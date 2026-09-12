import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSyncPayload, ORDER_FIELDS, SHEET_NAME } from "@/lib/sheets-sync.js";

// docs/sheets/orders-sync.gs 是貼進 Google Apps Script 的程式碼，不會被 Next.js 打包。
// 這裡把它載進來、把 Google 的全域物件換成假的，驗證欄位順序與 upsert 這類純邏輯，
// 避免哪天改欄位改壞了卻要等到正式試算表才發現。
const source = readFileSync(fileURLToPath(new URL("./orders-sync.gs", import.meta.url)), "utf8");

const pad = (n) => String(n).padStart(2, "0");

const Utilities = {
  // 只實作用得到的台灣時間格式
  formatDate(date, timeZone, format) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(date).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    const base = `${parts.year}-${parts.month}-${parts.day} ${pad(Number(parts.hour) % 24)}:${parts.minute}`;
    return format.endsWith("ss") ? `${base}:${parts.second}` : base;
  },
  getUuid: () => "11111111-2222-3333-4444-555555555555",
};

function makeSheet(initialRows = []) {
  const grid = initialRows.map((row) => row.slice());
  let maxRows = Math.max(1000, grid.length);
  let frozenRows = 0;

  const cell = (r, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : "");

  return {
    grid,
    getFrozenRows: () => frozenRows,
    setFrozenRows(n) { frozenRows = n; },
    getMaxRows: () => maxRows,
    insertRowsAfter(_after, howMany) { maxRows += howMany; },
    getLastRow() {
      for (let r = grid.length - 1; r >= 0; r--) {
        if ((grid[r] || []).some((v) => v !== "" && v !== null && v !== undefined)) return r + 1;
      }
      return 0;
    },
    getRange(row, col, numRows = 1, numCols = 1) {
      const range = {
        getValues: () => Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => cell(row - 1 + i, col - 1 + j))),
        setValues(values) {
          if (row - 1 + numRows > maxRows) throw new Error("超出試算表列數");
          values.forEach((line, i) => {
            const r = row - 1 + i;
            if (!grid[r]) grid[r] = [];
            line.forEach((v, j) => { grid[r][col - 1 + j] = v; });
          });
          return range;
        },
        setNumberFormat: () => range,
        setFontWeight: () => range,
      };
      return range;
    },
  };
}

function load({ sheets = { "InRecord 訂單": makeSheet() }, secret = "s3cret" } = {}) {
  const spreadsheet = {
    sheets,
    getSheetByName(name) { return this.sheets[name] || null; },
    insertSheet(name) { this.sheets[name] = makeSheet(); return this.sheets[name]; },
  };
  const factory = new Function(
    "PropertiesService", "LockService", "ContentService", "SpreadsheetApp", "Utilities", "Logger",
    `${source}
     return { doGet, doPost, upsertOrders_, buildRow_, groupRuns_, secretOk_, toDateText_, toNumber_, safeCell_, HEADERS, FIELDS };`
  );
  const api = factory(
    { getScriptProperties: () => ({ getProperty: () => secret }) },
    { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    { createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }), MimeType: { JSON: "json" } },
    { getActiveSpreadsheet: () => spreadsheet },
    Utilities,
    { log: () => {} }
  );
  return { ...api, spreadsheet, sheet: () => spreadsheet.getSheetByName("InRecord 訂單") };
}

const post = (api, body) => api.doPost({ postData: { contents: JSON.stringify(body) } });

const order = (overrides = {}) => ({
  mer_trade_no: "INREC1", created_at: "2026-09-01 10:00", paid_at: "2026-09-01 10:05",
  email: "a@example.com", name: "王小明", plan: "bundle", amount: 5500, coupon_code: "FAN3999",
  pay_type: "CREDIT", status: "paid", invoice_no: "AA26522751", source: "payuni",
  refunded_at: "", refund_amount: "", ...overrides,
});

describe("欄位對應", () => {
  it("表頭與欄位數量一致，且最後一欄是同步時間", () => {
    const api = load();
    expect(api.HEADERS).toHaveLength(15);
    expect(api.FIELDS).toHaveLength(15);
    expect(api.HEADERS[14]).toBe("同步時間");
    expect(api.FIELDS[14]).toBeNull();
  });

  it("buildRow_ 依照約定的欄位順序攤平", () => {
    const api = load();
    expect(api.buildRow_(order(), "2026-09-12 01:00")).toEqual([
      "INREC1", "2026-09-01 10:00", "2026-09-01 10:05", "a@example.com", "王小明", "bundle",
      5500, "FAN3999", "CREDIT", "paid", "AA26522751", "payuni", "", "", "2026-09-12 01:00",
    ]);
  });

  it("ISO 時間換成台灣時間、已是台灣格式就原樣沿用", () => {
    const api = load();
    expect(api.toDateText_("2026-09-01T02:00:00.000Z")).toBe("2026-09-01 10:00");
    expect(api.toDateText_("2026-09-01 10:00")).toBe("2026-09-01 10:00");
    expect(api.toDateText_(null)).toBe("");
  });

  it("金額轉數字、空值留白；開頭像公式的文字補單引號", () => {
    const api = load();
    expect(api.toNumber_("5500")).toBe(5500);
    expect(api.toNumber_(0)).toBe(0);
    expect(api.toNumber_(null)).toBe("");
    expect(api.safeCell_("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(api.safeCell_(undefined)).toBe("");
  });
});

describe("密鑰比對", () => {
  it("相同才通過，長度不同或空值一律擋掉", () => {
    const api = load();
    expect(api.secretOk_("abc", "abc")).toBe(true);
    expect(api.secretOk_("abd", "abc")).toBe(false);
    expect(api.secretOk_("abcd", "abc")).toBe(false);
    expect(api.secretOk_("", "")).toBe(false);
    expect(api.secretOk_(undefined, "abc")).toBe(false);
  });
});

describe("連續列分組", () => {
  it("相鄰列併成一塊、中間有斷點就切開", () => {
    const api = load();
    const runs = api.groupRuns_([{ row: 5, values: ["e"] }, { row: 2, values: ["b"] }, { row: 3, values: ["c"] }]);
    expect(runs).toEqual([
      { start: 2, values: [["b"], ["c"]] },
      { start: 5, values: [["e"]] },
    ]);
  });
});

describe("doPost 防呆", () => {
  it("密鑰不符回 unauthorized", () => {
    const api = load();
    expect(post(api, { secret: "wrong", orders: [] })).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("orders 不是陣列、超過 2000 筆、缺訂單編號都擋下來", () => {
    const api = load();
    expect(post(api, { secret: "s3cret", orders: "nope" })).toMatchObject({ ok: false, error: "invalid_orders" });
    const many = Array.from({ length: 2001 }, (_, i) => order({ mer_trade_no: `INREC${i}` }));
    expect(post(api, { secret: "s3cret", orders: many })).toMatchObject({ ok: false, error: "too_many_orders" });
    expect(post(api, { secret: "s3cret", orders: [order({ mer_trade_no: " " })] }))
      .toMatchObject({ ok: false, error: "missing_order_no" });
  });

  it("body 不是 JSON 回 bad_request", () => {
    const api = load();
    expect(api.doPost({ postData: { contents: "not json" } })).toMatchObject({ ok: false, error: "bad_request" });
    expect(api.doPost({})).toMatchObject({ ok: false, error: "bad_request" });
  });

  it("未設定密鑰時不寫入", () => {
    const api = load({ secret: null });
    expect(post(api, { secret: "s3cret", orders: [order()] })).toMatchObject({ ok: false, error: "not_configured" });
  });
});

describe("upsert", () => {
  it("新分頁會補表頭並凍結第一列", () => {
    const api = load();
    post(api, { secret: "s3cret", orders: [order()] });
    const sheet = api.sheet();
    expect(sheet.grid[0]).toEqual(api.HEADERS);
    expect(sheet.getFrozenRows()).toBe(1);
    expect(sheet.grid[1][0]).toBe("INREC1");
  });

  it("同一筆重複同步只更新那一列，不會長出重複列", () => {
    const api = load();
    post(api, { secret: "s3cret", orders: [order(), order({ mer_trade_no: "INREC2" })] });
    const second = post(api, {
      secret: "s3cret",
      orders: [order({ status: "refunded", refunded_at: "2026-09-10 12:00", refund_amount: 5500 })],
    });

    expect(second).toMatchObject({ ok: true, inserted: 0, updated: 1 });
    const sheet = api.sheet();
    expect(sheet.getLastRow()).toBe(3);           // 表頭 + 2 筆
    expect(sheet.grid[1][9]).toBe("refunded");   // 狀態欄就地更新
    expect(sheet.grid[1][12]).toBe("2026-09-10 12:00");
    expect(sheet.grid[1][13]).toBe(5500);
    expect(sheet.grid[2][0]).toBe("INREC2");      // 另一筆不受影響
  });

  it("同一批出現重複訂單編號時以最後一筆為準，只寫一列", () => {
    const api = load();
    const result = post(api, {
      secret: "s3cret",
      orders: [order({ status: "pending" }), order({ status: "paid" })],
    });
    expect(result).toMatchObject({ ok: true, inserted: 1, updated: 0 });
    expect(api.sheet().grid[1][9]).toBe("paid");
    expect(api.sheet().getLastRow()).toBe(2);
  });

  it("不會動到分頁裡既有的其他欄位（Q 欄之後的備註）", () => {
    const api = load();
    post(api, { secret: "s3cret", orders: [order()] });
    api.sheet().grid[1][15] = "老闆的備註";
    post(api, { secret: "s3cret", orders: [order({ amount: 6000 })] });

    expect(api.sheet().grid[1][15]).toBe("老闆的備註");
    expect(api.sheet().grid[1][6]).toBe(6000);
  });

  it("專屬分頁不存在就自己建立，並且完全不碰其他分頁", () => {
    const other = makeSheet([["收入", "金額"], ["八月", 12345]]);
    const api = load({ sheets: { "收入總表": other } });

    expect(post(api, { secret: "s3cret", orders: [order()] })).toMatchObject({ ok: true, inserted: 1, updated: 0 });
    expect(api.sheet().grid[0]).toEqual(api.HEADERS);
    expect(other.grid).toEqual([["收入", "金額"], ["八月", 12345]]);
  });

  it("orders 是空陣列就什麼都不做", () => {
    const api = load();
    expect(post(api, { secret: "s3cret", orders: [] })).toMatchObject({ ok: true, inserted: 0, updated: 0 });
  });
});

describe("doGet 健康檢查", () => {
  it("回報服務名稱與密鑰是否已設定，且不外洩密鑰", () => {
    const api = load();
    const res = api.doGet();
    expect(res).toMatchObject({ ok: true, service: "inrecord-orders-sync", sheet: "InRecord 訂單", secret_configured: true });
    expect(JSON.stringify(res)).not.toContain("s3cret");
  });
});

// 這一段刻意跨檔驗證：lib/sheets-sync.js（InRecord 端）產生的 payload，
// 必須能被 orders-sync.gs（試算表端）直接吃下去。兩邊欄位順序一旦走鐘，這裡會先爆。
describe("與 lib/sheets-sync.js 的合約", () => {
  it("前台送出的 payload 能原封不動寫進試算表", () => {
    const api = load();
    expect(SHEET_NAME).toBe("InRecord 訂單");
    // 欄序合約：前台送出的欄位名，要與試算表端 FIELDS（扣掉自動補的「同步時間」）完全一致
    expect(ORDER_FIELDS).toEqual(api.FIELDS.slice(0, -1));

    const orders = [
      { mer_trade_no: "INREC1", email: "a@example.com", plan: "bundle", amount: 5500, status: "paid",
        created_at: "2026-09-01T02:00:00.000Z", fulfilled_at: "2026-09-01T02:05:00.000Z", invoice_no: "AA26522751", source: "payuni" },
      { mer_trade_no: "INREC2", email: "b@example.com", plan: "course", amount: 3999, status: "refunded",
        created_at: "2026-09-02T02:00:00.000Z", updated_at: "2026-09-10T04:00:00.000Z", source: "payuni" },
    ];
    const payload = buildSyncPayload(orders, { secret: "s3cret", payLabelFn: () => "信用卡" });

    expect(post(api, payload)).toMatchObject({ ok: true, inserted: 2, updated: 0 });
    const sheet = api.sheet();
    expect(sheet.grid[0]).toEqual(api.HEADERS);
    expect(sheet.grid[1][0]).toBe("INREC1");
    expect(sheet.grid[1][2]).toBe("2026-09-01 10:05");  // 付款日期＝台灣時間
    expect(sheet.grid[1][6]).toBe(5500);                 // 金額是數字
    expect(sheet.grid[2][12]).toBe("2026-09-10 12:00");  // 退款日期
    expect(sheet.grid[2][13]).toBe(3999);                // 退款金額
    expect(sheet.grid[1][14]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/); // 同步時間由試算表端補

    // 重跑同一批：更新原列，不長出重複列
    expect(post(api, payload)).toMatchObject({ ok: true, inserted: 0, updated: 2 });
    expect(sheet.getLastRow()).toBe(3);
  });
});

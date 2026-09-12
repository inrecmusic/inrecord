import { describe, it, expect } from "vitest";
import {
  ORDER_FIELDS,
  twDateTime, twYmd, lastMonthRange, twRangeToUtc, statusLabel,
  orderToSheetRecord, buildSyncPayload,
} from "./sheets-sync.js";
import { payLabel } from "./dashboard.js";
import { PLAN_CATALOG } from "./plans.js";

const opts = { catalog: PLAN_CATALOG, payLabelFn: payLabel };

describe("twDateTime / twYmd（台灣時間）", () => {
  it("UTC 轉台灣時間 YYYY-MM-DD HH:mm", () => {
    expect(twDateTime("2026-09-11T16:00:00Z")).toBe("2026-09-12 00:00");
    expect(twDateTime("2026-09-12T01:23:45Z")).toBe("2026-09-12 09:23");
  });

  it("跨月／跨年邊界（UTC 仍是上個月、台灣已進下個月）", () => {
    expect(twDateTime("2026-08-31T16:00:00Z")).toBe("2026-09-01 00:00");
    expect(twYmd("2026-12-31T16:00:00Z")).toBe("2027-01-01");
  });

  it("空值與不合法時間回空字串（試算表留白）", () => {
    expect(twDateTime(null)).toBe("");
    expect(twDateTime("")).toBe("");
    expect(twDateTime("不是日期")).toBe("");
  });
});

describe("lastMonthRange（預設上個月整月）", () => {
  it("月初取上個月整月", () => {
    expect(lastMonthRange(new Date("2026-09-02T00:00:00Z"))).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("月底取上個月整月（含 30 天月份）", () => {
    expect(lastMonthRange(new Date("2026-07-31T15:00:00Z"))).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("一月時回上一年的十二月", () => {
    expect(lastMonthRange(new Date("2026-01-05T00:00:00Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("閏年二月", () => {
    expect(lastMonthRange(new Date("2024-03-10T00:00:00Z"))).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("以台灣時間判斷月份：UTC 還在 8/31、台灣已 9/1 → 上個月是八月", () => {
    expect(lastMonthRange(new Date("2026-08-31T16:00:00Z"))).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
});

describe("twRangeToUtc（台灣日界 → UTC 邊界）", () => {
  it("含起訖整天：起 00:00、訖 23:59:59.999（台灣）", () => {
    expect(twRangeToUtc("2026-08-01", "2026-08-31")).toEqual({
      startIso: "2026-07-31T16:00:00.000Z",
      endIso: "2026-08-31T15:59:59.999Z",
    });
  });

  it("單側留空＝該側不設限", () => {
    expect(twRangeToUtc("2026-08-01", "")).toEqual({ startIso: "2026-07-31T16:00:00.000Z", endIso: null });
    expect(twRangeToUtc("", "2026-08-31")).toEqual({ startIso: null, endIso: "2026-08-31T15:59:59.999Z" });
    expect(twRangeToUtc("", "")).toEqual({ startIso: null, endIso: null });
  });

  it("格式錯誤、起晚於訖、不存在的日期都回 null", () => {
    expect(twRangeToUtc("2026/08/01", "2026-08-31")).toBeNull();
    expect(twRangeToUtc("2026-08-31", "2026-08-01")).toBeNull();
    expect(twRangeToUtc("2026-13-01", "")).toBeNull();
    expect(twRangeToUtc("2026-02-31", "")).toBeNull(); // JS 會自動進位成 3/3，必須擋掉
  });

  it("起訖同一天仍是完整一天", () => {
    expect(twRangeToUtc("2026-08-05", "2026-08-05")).toEqual({
      startIso: "2026-08-04T16:00:00.000Z",
      endIso: "2026-08-05T15:59:59.999Z",
    });
  });
});

describe("statusLabel", () => {
  it("四種狀態轉中文，未知狀態原樣輸出", () => {
    expect(statusLabel("paid")).toBe("已付款");
    expect(statusLabel("pending")).toBe("待付款");
    expect(statusLabel("refunded")).toBe("已退款");
    expect(statusLabel("expired")).toBe("已逾期");
    expect(statusLabel("failed")).toBe("付款失敗");
    expect(statusLabel("weird")).toBe("weird");
    expect(statusLabel(null)).toBe("");
  });
});

describe("orderToSheetRecord", () => {
  const paid = {
    mer_trade_no: "INREC1782785571389",
    created_at: "2026-08-10T02:00:00Z",
    fulfilled_at: "2026-08-10T02:05:00Z",
    updated_at: "2026-08-10T02:05:00Z",
    email: "buy@x.com",
    grant_email: "learn@x.com",
    buyer_name: "周小明",
    plan: "bundle",
    plan_label: "學琴全攻略",
    amount: 3699,
    coupon_code: "FAN3999",
    pay_type: "1",
    status: "paid",
    invoice_no: "AA26522751",
    source: "payuni",
  };

  it("鍵名與 ORDER_FIELDS 一致（Apps Script 端照這些欄名對欄）", () => {
    expect(Object.keys(orderToSheetRecord(paid, opts))).toEqual(ORDER_FIELDS);
  });

  it("已付款單的完整對應", () => {
    expect(orderToSheetRecord(paid, opts)).toEqual({
      mer_trade_no: "INREC1782785571389",
      created_at: "2026-08-10 10:00",
      paid_at: "2026-08-10 10:05",
      email: "learn@x.com",           // 開通信箱優先
      name: "周小明",
      plan: "學琴全攻略",
      amount: 3699,
      coupon_code: "FAN3999",
      pay_type: "信用卡",
      status: "已付款",
      invoice_no: "AA26522751",
      source: "payuni",
      refunded_at: "",
      refund_amount: "",
    });
  });

  it("Email 用 grant_email 優先（購買信箱≠開通信箱）", () => {
    expect(orderToSheetRecord({ ...paid, grant_email: null }, opts).email).toBe("buy@x.com");
  });

  it("付款方式走 lib/dashboard.js 的 payLabel（數字碼→中文；無 pay_type 退回來源）", () => {
    expect(orderToSheetRecord({ ...paid, pay_type: null, source: "concert" }, opts).pay_type).toBe("音樂會現場");
    expect(orderToSheetRecord({ ...paid, pay_type: "2" }, opts).pay_type).toBe("ATM 轉帳");
  });

  it("未付款的單：付款日期／退款欄留空", () => {
    const r = orderToSheetRecord({ ...paid, status: "pending", fulfilled_at: null, invoice_no: null }, opts);
    expect(r).toMatchObject({ paid_at: "", status: "待付款", refunded_at: "", refund_amount: "", invoice_no: "" });
  });

  it("已退款的單：優先取 refunded_at／refund_amount（退款當下寫入，不受 updated_at trigger 影響）", () => {
    const r = orderToSheetRecord(
      { ...paid, status: "refunded", refunded_at: "2026-08-20T06:00:00Z", refund_amount: 3699, updated_at: "2026-09-01T00:00:00Z" },
      opts
    );
    // updated_at 已被退款後的補寄信／開發票蓋成 9/1，退款日期仍要是 8/20
    expect(r).toMatchObject({ status: "已退款", paid_at: "2026-08-10 10:05", refunded_at: "2026-08-20 14:00", refund_amount: 3699 });
  });

  it("舊單沒有 refunded_at／refund_amount（SQL 未執行前）→ 退回 updated_at 與原金額推算", () => {
    const r = orderToSheetRecord({ ...paid, status: "refunded", updated_at: "2026-08-20T06:00:00Z" }, opts);
    expect(r).toMatchObject({ status: "已退款", paid_at: "2026-08-10 10:05", refunded_at: "2026-08-20 14:00", refund_amount: 3699 });
  });

  it("部分退款：金額以 refund_amount 為準，不是訂單原金額", () => {
    const r = orderToSheetRecord({ ...paid, status: "refunded", refunded_at: "2026-08-20T06:00:00Z", refund_amount: 1000 }, opts);
    expect(r.refund_amount).toBe(1000);
  });

  it("已退款但沒有 fulfilled_at 時，付款日期留空（不可拿退款時間充數）", () => {
    const r = orderToSheetRecord({ ...paid, status: "refunded", fulfilled_at: null, updated_at: "2026-08-20T06:00:00Z" }, opts);
    expect(r.paid_at).toBe("");
    expect(r.refunded_at).toBe("2026-08-20 14:00");
  });

  it("外部來源已付款單沒有 fulfilled_at → 付款日期退回 updated_at", () => {
    const r = orderToSheetRecord({ ...paid, source: "concert", fulfilled_at: null, updated_at: "2026-08-11T03:00:00Z" }, opts);
    expect(r.paid_at).toBe("2026-08-11 11:00");
  });

  it("欄位缺漏不會炸，金額退回 0、其餘留白", () => {
    const r = orderToSheetRecord({}, opts);
    expect(Object.keys(r)).toEqual(ORDER_FIELDS);
    expect(r).toMatchObject({ mer_trade_no: "", amount: 0, status: "" });
  });
});

describe("buildSyncPayload", () => {
  it("payload＝{ secret, orders }，筆數與訂單一致", () => {
    const orders = [{ mer_trade_no: "A", amount: 100 }, { mer_trade_no: "B", amount: 200 }];
    const payload = buildSyncPayload(orders, { secret: "s3cret", ...opts });
    expect(Object.keys(payload).sort()).toEqual(["orders", "secret"]);
    expect(payload.secret).toBe("s3cret");
    expect(payload.orders.map((o) => o.mer_trade_no)).toEqual(["A", "B"]);
  });

  it("濾掉沒有訂單編號的髒資料（缺唯一鍵會讓 Apps Script 整批退回）", () => {
    const payload = buildSyncPayload([{ mer_trade_no: "A" }, { mer_trade_no: "" }, {}], { secret: "s", ...opts });
    expect(payload.orders).toHaveLength(1);
  });

  it("空清單回空陣列", () => {
    expect(buildSyncPayload([], { secret: "s", ...opts }).orders).toEqual([]);
  });
});

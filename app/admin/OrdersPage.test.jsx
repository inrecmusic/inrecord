// @vitest-environment jsdom
// 訂單管理是後台最關鍵的頁面（營收、開通、退款、對帳都在這），但先前零元件測試覆蓋。
// 2026-09-02 開課當晚就是整頁 ReferenceError 崩潰的事故，所以這裡先釘住「頁面渲染得出來、
// 既有功能區塊都還在」，再加上新的試算表同步按鈕的啟用／停用行為。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));

import OrdersPage from "./OrdersPage";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const ORDER = {
  id: "o1",
  email: "alan@example.com",
  plan: "bundle",
  plan_label: "學琴全攻略",
  amount: 3999,
  status: "paid",
  source: "payuni",
  pay_type: "1",
  mer_trade_no: "INREC1788000000000",
  created_at: "2026-09-01T02:00:00.000Z",
  updated_at: "2026-09-01T02:05:00.000Z",
  enrolled: true,
};

// 這頁進場會打兩支：/api/admin/orders 與 /api/admin/sheets-sync（讀設定狀態）；
// /api/admin/payment-events 只在展開某筆訂單詳情時才打（進頁不該對每筆訂單發請求）。
function mockApi({ orders = [ORDER], ordersOk = true, sheets = { configured: false }, events = { ok: true, tableMissing: false, data: [] }, eventsOk = true } = {}) {
  api.mockImplementation((path) => {
    if (path.startsWith("/api/admin/orders")) {
      return Promise.resolve({
        ok: ordersOk,
        status: ordersOk ? 200 : 500,
        json: async () => (ordersOk ? { ok: true, data: orders } : { error: "server_error" }),
      });
    }
    if (path.startsWith("/api/admin/sheets-sync")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => sheets });
    }
    if (path.startsWith("/api/admin/payment-events")) {
      return Promise.resolve({ ok: eventsOk, status: eventsOk ? 200 : 500, json: async () => events });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

describe("OrdersPage 基本渲染", () => {
  it("整頁渲染不拋錯，既有功能區塊都還在", async () => {
    mockApi();
    render(<OrdersPage showToast={vi.fn()} />);

    // 訂單資料到齊
    expect(await screen.findByText(/alan@example\.com/)).toBeTruthy();
    // 既有的對帳彙整與匯出仍在（新按鈕不得取代它們）
    expect(screen.getByText(/匯出對帳 CSV/)).toBeTruthy();
    // 手動開通表單仍在
    expect(screen.getAllByText(/手動開通/).length).toBeGreaterThan(0);
  });

  it("訂單載入失敗不冒充「沒有訂單」", async () => {
    mockApi({ ordersOk: false });
    render(<OrdersPage showToast={vi.fn()} />);

    // 失敗時要顯示錯誤與重試，不可出現「等待第一筆購買」這種把故障講成沒生意的文案
    expect(await screen.findByText(/載入訂單失敗/)).toBeTruthy();
    expect(screen.queryByText(/等待第一筆購買/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "重試" }).length).toBeGreaterThan(0);
  });
});

describe("Google 試算表同步按鈕", () => {
  it("環境變數未設時按鈕停用，並說明原因", async () => {
    mockApi({ sheets: { configured: false } });
    render(<OrdersPage showToast={vi.fn()} />);

    const btn = await screen.findByRole("button", { name: /同步到 Google 試算表/ });
    expect(btn.disabled).toBe(true);
  });

  it("環境變數設好後按鈕可按", async () => {
    mockApi({ sheets: { configured: true, sheet: "InRecord 訂單", from: "2026-08-01", to: "2026-08-31" } });
    render(<OrdersPage showToast={vi.fn()} />);

    const btn = await screen.findByRole("button", { name: /同步到 Google 試算表/ });
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});

// 訂單詳情的「付款明細」（分期期數／卡號末四碼／授權碼）。
// 這區最怕的不是壞掉，而是「看起來正常但講錯話」——抓不到分期欄位時若顯示「一次付清」，
// 老闆就會看到假的「沒有人分期」。三種狀態的文案各釘一條。
const CARD = (over = {}) => ({
  installment: null, installmentState: "missing", installmentRaw: null, last4: null, authCode: null,
  matchedKeys: { installment: null, last4: null, authCode: null },
  ...over,
});
const EVENT = (card, over = {}) => ({
  id: "e1", kind: "paid", trade_status: "1", pay_type: "1",
  created_at: "2026-09-14T10:00:00.000Z", card, raw: { MerTradeNo: "INREC1788000000000", TradeStatus: "1" },
  ...over,
});

// 展開第一筆訂單的詳情
async function openDetail() {
  const btn = (await screen.findAllByRole("button", { name: "查看" }))[0];
  fireEvent.click(btn);
  return screen.findByText("付款明細");
}

describe("訂單詳情 → 付款明細", () => {
  it("進頁時不打 payment-events，展開訂單詳情才抓", async () => {
    mockApi();
    render(<OrdersPage showToast={vi.fn()} />);
    await screen.findByText(/alan@example\.com/);
    expect(api.mock.calls.some(([p]) => p.startsWith("/api/admin/payment-events"))).toBe(false);

    await openDetail();
    await waitFor(() =>
      expect(api.mock.calls.some(([p]) => p === `/api/admin/payment-events?mer_trade_no=${ORDER.mer_trade_no}`)).toBe(true)
    );
  });

  it("狀態 a：資料表還沒建 → 說「尚未啟用付款回呼紀錄」", async () => {
    mockApi({ events: { ok: true, tableMissing: true, data: [] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/尚未啟用付款回呼紀錄/)).toBeTruthy();
  });

  it("狀態 b：有表但這筆沒紀錄 → 說明是啟用回呼紀錄之前的舊單，不可留白", async () => {
    mockApi({ events: { ok: true, tableMissing: false, data: [] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/查不到這筆訂單的回呼紀錄/)).toBeTruthy();
    expect(screen.queryByText(/2026-09-14/)).toBeNull(); // 不可宣稱日期與因果
  });

  it("狀態 c：有紀錄但抓不到分期欄位 → 顯示「回呼中找不到分期欄位」而非「一次付清」，並可展開原始 JSON", async () => {
    mockApi({ events: { ok: true, tableMissing: false, data: [EVENT(CARD())] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();

    expect(await screen.findByText(/回呼中找不到分期欄位/)).toBeTruthy();
    expect(screen.queryByText("一次付清")).toBeNull(); // ← 這行是本批最重要的防線

    // 原始回呼 JSON 預設收合，可展開讓人自己核對欄位名
    expect(screen.queryByText(/"MerTradeNo"/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /展開原始回呼 JSON/ }));
    expect(await screen.findByText(/"MerTradeNo"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /收合原始回呼 JSON/ }));
    await waitFor(() => expect(screen.queryByText(/"MerTradeNo"/)).toBeNull());
  });

  it("抓得到分期欄位：顯示期數／末四碼／授權碼，並註明是取自哪個欄位", async () => {
    const card = CARD({ installment: 3, installmentState: "n", last4: "4242", authCode: "012345", matchedKeys: { installment: "Installment", last4: "Card4No", authCode: "AuthCode" } });
    mockApi({ events: { ok: true, tableMissing: false, data: [EVENT(card)] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();

    expect(await screen.findByText("3 期")).toBeTruthy();
    expect(screen.getByText(/4242/)).toBeTruthy();
    expect(screen.getByText("012345")).toBeTruthy();
    expect(screen.getByText(/^共 1 筆$/)).toBeTruthy(); // 頁首的「共 N 筆訂單」不算
    expect(screen.getByText("Installment")).toBeTruthy(); // 命中的原始欄位名，供日後與真單對照
  });

  it("AFTEE 後支付（PaymentType 7）→ 走非卡版面：顯示付款方式與交易序號，不套信用卡欄位、不跳「找不到分期欄位」", async () => {
    const raw = { MerTradeNo: "INREC1788000000000", TradeStatus: "1", PaymentType: "7", PayNo: "tr_7U79ziH4kYhjRi7Y", PayTime: "2026-09-16 09:53:45", Message: "付款成功" };
    mockApi({ events: { ok: true, tableMissing: false, data: [EVENT(CARD(), { pay_type: "7", raw })] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect((await screen.findAllByText("AFTEE 後支付")).length).toBeGreaterThan(0);
    expect(screen.getByText("tr_7U79ziH4kYhjRi7Y")).toBeTruthy();
    expect(screen.queryByText(/回呼中找不到分期欄位/)).toBeNull();
    expect(screen.queryByText(/卡號末四碼/)).toBeNull();
  });

  it("分期欄位是 0 → 一次付清（與「找不到欄位」不同）", async () => {
    const card = CARD({ installmentState: "none", matchedKeys: { installment: "Installment", last4: null, authCode: null } });
    mockApi({ events: { ok: true, tableMissing: false, data: [EVENT(card)] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();

    expect(await screen.findByText("一次付清")).toBeTruthy();
    expect(screen.queryByText(/回呼中找不到分期欄位/)).toBeNull();
  });

  it("讀取失敗只講失敗，不冒充「沒有分期」", async () => {
    mockApi({ eventsOk: false, events: { error: "payment_events_load_failed" } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/讀取付款明細失敗/)).toBeTruthy();
    expect(screen.queryByText("一次付清")).toBeNull();
  });

  it("非 PAYUNi 成交的訂單不打 API，直接說明沒有回呼", async () => {
    mockApi({ orders: [{ ...ORDER, source: "concert", mer_trade_no: "CONCERT-1" }] });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/沒有付款回呼紀錄/)).toBeTruthy();
    expect(api.mock.calls.some(([p]) => p.startsWith("/api/admin/payment-events"))).toBe(false);
  });
});

describe("付款明細：覆驗迴歸", () => {
  it("欄位有值但看不懂（例如 \"NA\"）→ 顯示無法判讀，絕不顯示「一次付清」", async () => {
    const card = CARD({ installmentState: "unparsable", installmentRaw: "NA", matchedKeys: { installment: "Installment", last4: null, authCode: null } });
    mockApi({ events: { ok: true, tableMissing: false, data: [EVENT(card)] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/無法判讀/)).toBeTruthy();
    expect(screen.queryByText("一次付清")).toBeNull();
    expect(screen.getByText("NA")).toBeTruthy(); // 原值要露出來供核對
  });

  it("只信「付款成功」那一筆：先前失敗嘗試的 3 期不可混進來", async () => {
    const failed = EVENT(CARD({ installment: 3, installmentState: "n", matchedKeys: { installment: "Installment", last4: null, authCode: null } }),
      { id: "e-fail", kind: "other", trade_status: "0", created_at: "2026-09-14T09:00:00.000Z" });
    const paid = EVENT(CARD({ installmentState: "none", matchedKeys: { installment: "Installment", last4: null, authCode: null } }),
      { id: "e-paid", kind: "paid", trade_status: "1", created_at: "2026-09-14T10:00:00.000Z" });
    mockApi({ events: { ok: true, tableMissing: false, data: [paid, failed] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText("一次付清")).toBeTruthy();
    expect(screen.queryByText("3 期")).toBeNull();
  });

  it("有回呼但沒有「付款成功」那一筆 → 明說，不用其他回呼補位", async () => {
    const ev = EVENT(CARD({ installment: 3, installmentState: "n", matchedKeys: { installment: "Installment", last4: null, authCode: null } }),
      { kind: "other", trade_status: "0" });
    mockApi({ events: { ok: true, tableMissing: false, data: [ev] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/還沒有「付款成功」的那一筆/)).toBeTruthy();
    expect(screen.queryByText("3 期")).toBeNull();
  });

  it("source 為 NULL 的舊官網單也視為 PAYUNi 單、會去查回呼", async () => {
    mockApi({ orders: [{ ...ORDER, source: null }], events: { ok: true, tableMissing: false, data: [] } });
    render(<OrdersPage showToast={vi.fn()} />);
    await openDetail();
    expect(await screen.findByText(/查不到這筆訂單的回呼紀錄/)).toBeTruthy();
    expect(screen.queryByText(/非官網 PAYUNi/)).toBeNull();
  });
});

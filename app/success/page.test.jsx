// 付款成功頁三態：只有訂單真的 paid 才說「成功」並觸發轉換追蹤。
// ATM／超商「取號成功」也會導回這一頁，但 notify 只在 TradeStatus=1 才把訂單寫 paid，
// 所以此時訂單仍是 pending → 必須顯示待繳費、且不可打 Purchase（否則廣告平台會記到沒收到錢的轉換）。
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = { value: undefined };
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/sale", () => ({ getSaleSettings: vi.fn(async () => ({})), isPresale: vi.fn(() => false) }));
vi.mock("@/lib/order-fulfillment", () => ({ autoGrantEnabled: vi.fn(() => true) }));
vi.mock("@/lib/tracking", () => ({ getTrackingSettings: vi.fn(async () => ({ googleAds: null, line: null })) }));
// 具名函式：下方 walk() 以元件名稱判斷有沒有渲染到追蹤元件
vi.mock("@/components/tracking/PurchaseTracking", () => ({ default: function PurchaseTracking() { return null; } }));
vi.mock("@/components/GrantEmailForm", () => ({ default: function GrantEmailForm() { return null; } }));
vi.mock("@/components/Logo", () => ({ default: function Logo() { return null; } }));

import SuccessPage from "./page";
import { getSupabaseAdmin } from "@/lib/supabase";

function mockOrder(order) {
  getSupabaseAdmin.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: order, error: null }) }) }) }),
  });
}

// 把 server component 回傳的元素樹攤平成可搜尋的文字＋元件名稱清單
function walk(node, out = { text: "", names: [] }) {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.text += String(node); return out; }
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  const t = node.type;
  if (typeof t === "function") out.names.push(t.displayName || t.name || "anon");
  walk(node.props?.children, out);
  return out;
}
const renderPage = async (searchParams) => walk(await SuccessPage({ searchParams }));

beforeEach(() => { vi.clearAllMocks(); cookieStore.value = undefined; });

describe("/success 依訂單狀態決定畫面與追蹤", () => {
  it("訂單已付款 → 顯示成功、觸發 PurchaseTracking", async () => {
    mockOrder({ amount: 4299, plan: "bundle", status: "paid", email: "a@x.com" });
    const r = await renderPage({ MerTradeNo: "INREC1" });
    expect(r.text).toContain("購買成功");
    expect(r.names).toContain("PurchaseTracking");
  });

  it("ATM／超商取號（訂單仍 pending）→ 顯示待繳費、不觸發追蹤、不說成功", async () => {
    mockOrder({ amount: 4299, plan: "bundle", status: "pending", email: "a@x.com" });
    const r = await renderPage({ MerTradeNo: "INREC2" });
    expect(r.text).toContain("已取得繳費資訊");
    expect(r.text).not.toContain("購買成功");
    expect(r.text).not.toContain("預購成功");
    expect(r.names).not.toContain("PurchaseTracking");
  });

  it("已退款訂單 → 不顯示成功、不觸發追蹤", async () => {
    mockOrder({ amount: 4299, plan: "bundle", status: "refunded", email: "a@x.com" });
    const r = await renderPage({ MerTradeNo: "INREC3" });
    expect(r.names).not.toContain("PurchaseTracking");
    expect(r.text).not.toContain("購買成功");
  });

  it("查無訂單 → 維持原本成功畫面（保守，不嚇到真的付款成功的人），但不打追蹤", async () => {
    mockOrder(null);
    const r = await renderPage({ MerTradeNo: "INREC4" });
    expect(r.text).toContain("成功");
    expect(r.names).not.toContain("PurchaseTracking");
  });

  it("?status=failed → 付款未完成畫面", async () => {
    mockOrder({ amount: 4299, plan: "bundle", status: "pending", email: "a@x.com" });
    const r = await renderPage({ MerTradeNo: "INREC5", status: "failed" });
    expect(r.text).toContain("付款未完成");
    expect(r.names).not.toContain("PurchaseTracking");
  });
});

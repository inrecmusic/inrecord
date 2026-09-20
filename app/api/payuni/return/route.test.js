import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aesEncrypt, makeHashInfo } from "@/lib/payuni";
import { POST } from "./route";

const KEY = "k".repeat(32), IV = "i".repeat(16);

function returnReq(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://x/api/payuni/return", { method: "POST", body: fd });
}
// 真的 PAYUNi 導回：EncryptInfo（AES-GCM）＋ HashInfo（SHA256(key+EncryptInfo+iv)）
function signed(params) {
  const EncryptInfo = aesEncrypt(new URLSearchParams(params).toString(), KEY, IV);
  return { EncryptInfo, HashInfo: makeHashInfo(EncryptInfo, KEY, IV) };
}
const cookieOf = (res) => res.headers.get("set-cookie") || "";

describe("POST /api/payuni/return（付款導回）", () => {
  beforeEach(() => {
    vi.stubEnv("PAYUNI_HASH_KEY", KEY); vi.stubEnv("PAYUNI_HASH_IV", IV);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://site.test"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret-for-hmac");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("驗章通過且付款成功 → 303 到 /success?status=success，並種下導回憑證 cookie（限 /success）", async () => {
    const res = await POST(returnReq({ MerTradeNo: "INREC1", ...signed({ MerTradeNo: "INREC1", TradeStatus: "1" }) }));
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location"));
    expect(loc.pathname).toBe("/success");
    expect(loc.searchParams.get("status")).toBe("success");
    expect(loc.searchParams.get("MerTradeNo")).toBe("INREC1");
    expect(cookieOf(res)).toMatch(/inrec_pu=\d+\.[0-9a-f]{64}/);
    expect(cookieOf(res)).toMatch(/Path=\/success/i);
    expect(cookieOf(res)).toMatch(/HttpOnly/i);
  });

  it("只帶 MerTradeNo、沒有 EncryptInfo（任何人都能發的請求）→ 畫面仍導 success，但絕不種 cookie", async () => {
    const res = await POST(returnReq({ MerTradeNo: "INREC-victim" }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")).searchParams.get("status")).toBe("success"); // 畫面導向維持保守
    expect(cookieOf(res)).not.toContain("inrec_pu=");
  });

  it("HashInfo 不符（偽造）→ 不種 cookie", async () => {
    const s = signed({ MerTradeNo: "INREC1", TradeStatus: "1" });
    const res = await POST(returnReq({ MerTradeNo: "INREC1", EncryptInfo: s.EncryptInfo, HashInfo: "DEADBEEF" }));
    expect(cookieOf(res)).not.toContain("inrec_pu=");
  });

  it("驗章通過但未付款（TradeStatus≠1）→ status=failed、不種 cookie", async () => {
    const res = await POST(returnReq({ MerTradeNo: "INREC1", ...signed({ MerTradeNo: "INREC1", TradeStatus: "0" }) }));
    expect(new URL(res.headers.get("location")).searchParams.get("status")).toBe("failed");
    expect(cookieOf(res)).not.toContain("inrec_pu=");
  });

  it("MerTradeNo 以解密後的內層為準（外層表單值不可覆寫）", async () => {
    const res = await POST(returnReq({ MerTradeNo: "INREC-outer", ...signed({ MerTradeNo: "INREC-inner", TradeStatus: "1" }) }));
    expect(new URL(res.headers.get("location")).searchParams.get("MerTradeNo")).toBe("INREC-inner");
    expect(cookieOf(res)).toContain("inrec_pu=");
  });
});

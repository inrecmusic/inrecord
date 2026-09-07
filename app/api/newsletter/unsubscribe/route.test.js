import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => async () => ({ allowed: true }), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/unsubscribe", () => ({ verifyUnsubscribeToken: vi.fn(() => true), recordUnsubscribe: vi.fn(async (_sb, e) => e) }));
vi.mock("@/lib/brevo-contacts", () => ({ removeLeadContact: vi.fn() }));

import { POST } from "./route";
import { removeLeadContact } from "@/lib/brevo-contacts";
import { verifyUnsubscribeToken, recordUnsubscribe } from "@/lib/unsubscribe";

const oneClick = () => POST(new Request("http://x/api/newsletter/unsubscribe?e=A@x.com&t=tok", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }));

describe("POST /api/newsletter/unsubscribe → 同步移出 Brevo 潛客清單", () => {
  beforeEach(() => { vi.clearAllMocks(); verifyUnsubscribeToken.mockReturnValue(true); });

  it("退訂成功後把該 email 從 Brevo 清單移除", async () => {
    removeLeadContact.mockResolvedValue({ ok: true });
    const r = await oneClick();
    expect(r.status).toBe(200);
    expect(recordUnsubscribe).toHaveBeenCalled();
    expect(removeLeadContact).toHaveBeenCalledWith("A@x.com");
  });

  it("Brevo 移除失敗或丟錯，退訂結果照樣成功", async () => {
    removeLeadContact.mockResolvedValueOnce({ ok: false, error: "brevo_400" });
    expect((await oneClick()).status).toBe(200);
    removeLeadContact.mockRejectedValueOnce(new Error("net"));
    expect((await oneClick()).status).toBe(200);
  });

  it("簽章無效 → 不寫退訂、不動 Brevo", async () => {
    verifyUnsubscribeToken.mockReturnValue(false);
    expect((await oneClick()).status).toBe(400);
    expect(recordUnsubscribe).not.toHaveBeenCalled();
    expect(removeLeadContact).not.toHaveBeenCalled();
  });
});

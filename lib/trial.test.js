import { describe, it, expect, beforeEach } from "vitest";
import { signTrialToken, verifyTrialToken, buildTrialUrl, buildTrialPath, buildTrialEmail, isValidBunnyVideoId } from "./trial.js";
import { signUnsubscribeToken } from "./unsubscribe.js";

describe("trial（免費試看連結）", () => {
  beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret"; });

  it("簽章：同 email 大小寫／空白正規化後相同；竄改／空值／不同 email 皆失敗", () => {
    const t = signTrialToken(" A@X.com ");
    expect(verifyTrialToken("a@x.com", t)).toBe(true);
    expect(verifyTrialToken("b@x.com", t)).toBe(false);
    expect(verifyTrialToken("a@x.com", t.slice(0, -1) + "0")).toBe(false);
    expect(verifyTrialToken("a@x.com", "")).toBe(false);
    expect(verifyTrialToken("", t)).toBe(false);
  });

  it("試看簽章與退訂簽章不互通（拿試看連結不能幫人退訂）", () => {
    expect(signTrialToken("a@x.com")).not.toBe(signUnsubscribeToken("a@x.com"));
  });

  it("buildTrialUrl：/trial 帶 e（已編碼）與 t", () => {
    const u = buildTrialUrl("Alan+Test@X.com", "https://inrecordmusic.com");
    expect(u.startsWith("https://inrecordmusic.com/trial?e=alan%2Btest%40x.com&t=")).toBe(true);
    const url = new URL(u);
    expect(verifyTrialToken(url.searchParams.get("e"), url.searchParams.get("t"))).toBe(true);
  });

  it("buildTrialPath：回相對路徑、簽章可驗、UTM 與信件版分得開", () => {
    const p = buildTrialPath("Alan+Test@X.com");
    // 相對路徑是刻意的：preview 的 NEXT_PUBLIC_SITE_URL 指向正式站別名，
    // 用絕對網址會把留完 Email 的人導去正式站。
    expect(p.startsWith("/trial?e=alan%2Btest%40x.com&t=")).toBe(true);
    const q = new URL(p, "https://example.test").searchParams;
    expect(verifyTrialToken(q.get("e"), q.get("t"))).toBe(true);
    expect(q.get("utm_medium")).toBe("lead_form");     // 信件版是 email
    expect(q.get("utm_source")).toBe("site");
    // 與信件連結同一組簽章（同一個 email 兩邊都能開）
    expect(q.get("t")).toBe(signTrialToken("alan+test@x.com"));
  });

  it("buildTrialEmail：主旨＋品牌版面 HTML，內含專屬按鈕連結", () => {
    const { subject, html } = buildTrialEmail({ email: "a@x.com", siteUrl: "https://inrecordmusic.com" });
    expect(subject).toMatch(/試看/);
    expect(html).toContain("https://inrecordmusic.com/trial?e=a%40x.com&amp;t=");
    expect(html).toContain("觀看免費試看課程影片");
    expect(html).toContain("<!doctype html>");
  });

  it("isValidBunnyVideoId：GUID／英數連字號可，空字串可（清除），含引號或空白不可", () => {
    expect(isValidBunnyVideoId("3f2b7c1e-9a0d-4c11-8b2a-0f1e2d3c4b5a")).toBe(true);
    expect(isValidBunnyVideoId("")).toBe(true);
    expect(isValidBunnyVideoId("abc def")).toBe(false);
    expect(isValidBunnyVideoId("x\"><script>")).toBe(false);
    expect(isValidBunnyVideoId("a".repeat(65))).toBe(false);
  });
});

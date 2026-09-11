import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => globalThis.__sb }));
vi.mock("@/lib/game-devices", async (orig) => ({
  ...(await orig()),
  enforceDeviceLimit: vi.fn(async () => ({ ok: true })),
}));

import { GET } from "./route";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const USER = { id: "u1", email: "student@x.com" };
const SUB = { id: "s1" };
const FULL = "<!DOCTYPE html><html><head><title>g</title></head><body><canvas></canvas></body></html>";

// subResult＝subscriptions 查詢結果；game＝games 單筆查詢結果
function db({ subResult = { data: SUB, error: null }, game = { id: "g1", game_type: "html", html_content: FULL } } = {}) {
  return makeSupabaseMock((table) => {
    if (table === "subscriptions") return subResult;
    if (table === "games") return { data: game, error: null };
    return { data: null, error: null };
  });
}

const req = (qs = "", host = "inrecordmusic.com") =>
  new Request("http://x/api/classroom/games" + qs, { headers: { authorization: "Bearer t", host } });

describe("GET /api/classroom/games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: USER }, error: null });
    globalThis.__sb = db();
  });

  it("查無訂閱（PGRST116）→ 403 subscription_required", async () => {
    globalThis.__sb = db({ subResult: { data: null, error: { code: "PGRST116", message: "no rows" } } });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "subscription_required" });
  });

  it("DB 出錯（非 PGRST116）→ 503，不能讓已付費學員看到「需要訂閱」", async () => {
    globalThis.__sb = db({ subResult: { data: null, error: { code: "57014", message: "timeout" } } });
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "service_unavailable" });
  });

  it("html 遊戲：守衛與浮水印都注在 </body> 之前（不動 <head> 的 charset 位置）", async () => {
    const res = await GET(req("?id=g1&device_id=d1"));
    expect(res.status).toBe(200);
    const html = (await res.json()).game.html_content;
    expect(html).toMatch(/<script>\(function\(\)\{[\s\S]*<\/script>[\s\S]*<\/body>/);
    expect(html).toContain("<head><title>g</title></head>"); // head 原封不動
    expect(html).toContain("ancestorOrigins");
    expect(html.indexOf("student@x.com")).toBeGreaterThan(-1);
    expect(html.indexOf("student@x.com")).toBeLessThan(html.indexOf("</body>"));
    // 精確比對主機名，不是子字串比對
    expect(html).not.toContain("document.referrer.includes");
    expect(html).toContain('["inrecordmusic.com"]');
  });

  it("允許清單帶入本次請求的主機（preview／本機網域不會被自己的守衛擋掉）", async () => {
    const html = (await (await GET(req("?id=g1&device_id=d1", "inrecord-preview-inrec.vercel.app"))).json()).game.html_content;
    expect(html).toContain('["inrecord-preview-inrec.vercel.app","inrecordmusic.com"]');
  });

  it("偽造的 Host 標頭（含引號等非法字元）不會被寫進守衛腳本", async () => {
    const html = (await (await GET(req("?id=g1&device_id=d1", "evil'};alert(1);//"))).json()).game.html_content;
    expect(html).toContain('["inrecordmusic.com"]');
    expect(html).not.toContain("alert(1)");
  });

  it("只有 <head>、沒有 </body> → 守衛注進 <head>，浮水印補在最後", async () => {
    globalThis.__sb = db({ game: { id: "g1", game_type: "html", html_content: "<head><title>g</title></head><div>play</div>" } });
    const html = (await (await GET(req("?id=g1&device_id=d1"))).json()).game.html_content;
    expect(html).toMatch(/<head><script>\(function\(\)\{/);
    expect(html.indexOf("student@x.com")).toBeGreaterThan(html.indexOf("play"));
  });

  it("片段 HTML（沒有 <head> 也沒有 </body>）→ 守衛前置注入，仍照常發內容", async () => {
    // 守衛自帶 DOM 就緒判斷，前置注入一樣有效。這裡不能回 500——那會讓原本能玩的遊戲整支壞掉。
    globalThis.__sb = db({ game: { id: "g1", game_type: "html", html_content: "<div>naked</div>" } });
    const res = await GET(req("?id=g1&device_id=d1"));
    expect(res.status).toBe(200);
    const html = (await res.json()).game.html_content;
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("naked"));
    expect(html).toContain('["inrecordmusic.com"]');
    expect(html).toContain("student@x.com");
  });

  it("url 類型（公開試玩）不套守衛與浮水印", async () => {
    globalThis.__sb = db({ game: { id: "g1", game_type: "url", external_url: "https://x", html_content: FULL } });
    const body = await (await GET(req("?id=g1"))).json();
    expect(body.game.html_content).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/classroom-auth", () => ({ requireClassroomAuth: vi.fn() }));

import { POST, PATCH } from "./route";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const USER = { id: "u1", email: "student@x.com", user_metadata: { full_name: "小明" } };
const NOW = Date.parse("2026-10-11T07:05:00Z");
const ROW = { id: "r1", score: 4, content: null, created_at: "2026-10-11T07:00:00Z" };

const req = (method, body) => new Request("http://x/api/classroom/rating", {
  method, headers: { "Content-Type": "application/json", authorization: "Bearer tok" }, body: JSON.stringify(body),
});
const has = (entry, m) => entry.ops.some((o) => o.m === m);
const arg = (entry, m, i = 0) => entry.ops.find((o) => o.m === m)?.args[i];

// existing：該學員目前的評價列（null＝還沒評過）；寫入一律回成功
function setup(existing) {
  const db = makeSupabaseMock((table, ops) => {
    if (table !== "ratings") return { data: null, error: null };
    if (ops.some((o) => o.m === "insert")) return { data: { ...ROW, ...ops.find((o) => o.m === "insert").args[0] }, error: null };
    if (ops.some((o) => o.m === "update")) return { data: { ...existing, ...ops.find((o) => o.m === "update").args[0] }, error: null };
    return { data: existing ? [existing] : [], error: null };
  });
  requireClassroomAuth.mockResolvedValue({ user: USER, supabase: db });
  return db;
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("POST /api/classroom/rating（第一次評分）", () => {
  it("未登入／未購課 → 回授權閘的回應", async () => {
    requireClassroomAuth.mockResolvedValue({ res: NextResponse.json({ error: "forbidden" }, { status: 403 }) });
    expect((await POST(req("POST", { score: 5 }))).status).toBe(403);
  });
  it("只帶星數就能建立（點星即存），回建立的那一列", async () => {
    const db = setup(null);
    const res = await POST(req("POST", { score: 5 }));
    expect(res.status).toBe(200);
    const ins = db.calls.find((c) => has(c, "insert"));
    expect(arg(ins, "insert")).toMatchObject({ user_id: "u1", course_id: "main", score: 5, content: null, user_email: "student@x.com", user_name: "小明" });
    expect((await res.json()).data.score).toBe(5);
  });
  it("已評過 → 409 already_rated", async () => {
    setup(ROW);
    const res = await POST(req("POST", { score: 5 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_rated" });
  });
  it("星數不合法 → 400", async () => {
    setup(null);
    expect((await POST(req("POST", { score: 9 }))).status).toBe(400);
  });
});

describe("PATCH /api/classroom/rating（補心得／改星數）", () => {
  it("未登入／未購課 → 回授權閘的回應", async () => {
    requireClassroomAuth.mockResolvedValue({ res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
    expect((await PATCH(req("PATCH", { content: "x" }))).status).toBe(401);
  });
  it("還沒評過 → 404 not_rated", async () => {
    setup(null);
    const res = await PATCH(req("PATCH", { content: "很棒" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_rated" });
  });
  it("補寫心得 → 只更新本人那一列，並撤下首頁精選", async () => {
    const db = setup(ROW);
    const res = await PATCH(req("PATCH", { content: " 很有收穫 " }));
    expect(res.status).toBe(200);
    const up = db.calls.find((c) => has(c, "update"));
    expect(arg(up, "update")).toEqual({ content: "很有收穫", featured: false });
    expect(up.ops).toContainEqual({ m: "eq", args: ["id", "r1"] });
    expect(up.ops).toContainEqual({ m: "eq", args: ["user_id", "u1"] });
    expect((await res.json()).data.content).toBe("很有收穫");
  });
  it("15 分鐘內改星數 → 更新", async () => {
    const db = setup(ROW);
    expect((await PATCH(req("PATCH", { score: 5 }))).status).toBe(200);
    expect(arg(db.calls.find((c) => has(c, "update")), "update")).toEqual({ score: 5, featured: false });
  });
  it("超過 15 分鐘改星數 → 409 edit_window_closed，不寫入", async () => {
    const db = setup({ ...ROW, created_at: "2026-10-11T06:00:00Z" });
    const res = await PATCH(req("PATCH", { score: 1 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "edit_window_closed" });
    expect(db.calls.some((c) => has(c, "update"))).toBe(false);
  });
  it("格式錯誤 → 400", async () => {
    setup(ROW);
    expect((await PATCH(req("PATCH", { score: 9 }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { content: "字".repeat(1001) }))).status).toBe(400);
  });
  it("沒有任何變動 → 200，不寫入", async () => {
    const db = setup(ROW);
    const res = await PATCH(req("PATCH", { score: 4 }));
    expect(res.status).toBe(200);
    expect(db.calls.some((c) => has(c, "update"))).toBe(false);
  });
});

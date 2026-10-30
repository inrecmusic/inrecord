import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { GET, POST, PATCH, DELETE } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const BEE = readFileSync(new URL("../../../../lib/score/fixtures/twinkle-grand.musicxml", import.meta.url), "utf8");
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const req = (method, body, qs = "") =>
  new Request(`http://x/api/admin/scores${qs}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const isOp = (ops, m) => ops.some((o) => o.m === m);

describe("/api/admin/scores", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未登入 → 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: null })));
    expect((await POST(req("POST", { title: "x", musicxml: BEE }))).status).toBe(401);
  });

  it("POST inserts as draft", async () => {
    const sb = makeSupabaseMock((table, ops) => (isOp(ops, "insert") ? { data: { id: "s1" }, error: null } : { data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req("POST", { title: "小蜜蜂", musicxml: BEE, published: true }));
    expect(res.status).toBe(200);
    const ins = sb.calls.find((c) => c.table === "scores" && sb.has(c, "insert"));
    const row = sb.arg(ins, "insert");
    expect(row.published).toBe(false);
    expect(row.format).toBe("musicxml");
    expect(row.version).toBe(1);
    expect(row.meta.measureCount).toBe(8);
    expect(logAudit).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "score.create" }));
  });

  it("POST 帶 unitIds 寫入 score_units", async () => {
    const sb = makeSupabaseMock((table, ops) => (isOp(ops, "insert") && table === "scores" ? { data: { id: "s1" }, error: null } : { data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    await POST(req("POST", { title: "x", musicxml: BEE, unitIds: [U1, U2] }));
    const su = sb.calls.find((c) => c.table === "score_units" && sb.has(c, "insert"));
    expect(sb.arg(su, "insert")).toEqual([
      { score_id: "s1", video_id: U1, sort_order: 0 },
      { score_id: "s1", video_id: U2, sort_order: 1 },
    ]);
  });

  it("POST 三行以上的譜 → 400", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: null })));
    const res = await POST(req("POST", { title: "x", musicxml: BEE.replace("<staves>2</staves>", "<staves>3</staves>") }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_grand_staff");
  });

  it("PATCH 換 musicxml → version 加 1", async () => {
    const sb = makeSupabaseMock((table, ops) =>
      isOp(ops, "maybeSingle")
        ? { data: { id: "s1", format: "musicxml", version: 3, published: false, musicxml: "<old/>" }, error: null }
        : { data: { id: "s1" }, error: null });
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await PATCH(req("PATCH", { id: "s1", musicxml: BEE }));
    expect(res.status).toBe(200);
    const upd = sb.calls.find((c) => c.table === "scores" && sb.has(c, "update"));
    expect(sb.arg(upd, "update").version).toBe(4);
  });

  it("PATCH 同一份 musicxml 不加版本", async () => {
    const sb = makeSupabaseMock((table, ops) =>
      isOp(ops, "maybeSingle")
        ? { data: { id: "s1", format: "musicxml", version: 3, published: false, musicxml: BEE }, error: null }
        : { data: { id: "s1" }, error: null });
    getSupabaseAdmin.mockReturnValue(sb);
    await PATCH(req("PATCH", { id: "s1", musicxml: BEE, title: "新" }));
    const upd = sb.calls.find((c) => c.table === "scores" && sb.has(c, "update"));
    expect(sb.arg(upd, "update").version).toBe(undefined);
  });

  it("PATCH unitIds 整批換掉", async () => {
    const sb = makeSupabaseMock((table, ops) =>
      isOp(ops, "maybeSingle") ? { data: { id: "s1", format: "musicxml", version: 1, published: true, musicxml: BEE }, error: null } : { data: null, error: null });
    getSupabaseAdmin.mockReturnValue(sb);
    await PATCH(req("PATCH", { id: "s1", unitIds: [U2] }));
    const su = sb.calls.filter((c) => c.table === "score_units");
    expect(sb.has(su[0], "delete")).toBe(true);
    expect(sb.arg(su[1], "insert")).toEqual([{ score_id: "s1", video_id: U2, sort_order: 0 }]);
  });

  it("PATCH 舊 ABC 列只能改 published", async () => {
    const sb = makeSupabaseMock((table, ops) =>
      isOp(ops, "maybeSingle") ? { data: { id: "a1", format: "abc", version: 1, published: true }, error: null } : { data: { id: "a1" }, error: null });
    getSupabaseAdmin.mockReturnValue(sb);
    expect((await PATCH(req("PATCH", { id: "a1", title: "改" }))).status).toBe(400);
    const ok = await PATCH(req("PATCH", { id: "a1", published: false }));
    expect(ok.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "score.unpublish" }));
  });

  it("DELETE 已發布 → 409；舊 ABC → 409；草稿可刪", async () => {
    const row = { current: { id: "s1", format: "musicxml", published: true } };
    const sb = makeSupabaseMock((table, ops) => (isOp(ops, "maybeSingle") ? { data: row.current, error: null } : { data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    expect((await DELETE(req("DELETE", null, "?id=s1"))).status).toBe(409);
    row.current = { id: "a1", format: "abc", published: false };
    expect((await DELETE(req("DELETE", null, "?id=a1"))).status).toBe(409);
    row.current = { id: "s2", format: "musicxml", published: false };
    expect((await DELETE(req("DELETE", null, "?id=s2"))).status).toBe(200);
    expect(sb.calls.some((c) => c.table === "scores" && sb.has(c, "delete"))).toBe(true);
  });

  it("GET 列表不帶 musicxml 全文、附上單元", async () => {
    const sb = makeSupabaseMock((table) => {
      if (table === "scores") return { data: [{ id: "s1", title: "v2", format: "musicxml", video_id: null }, { id: "a1", title: "舊", format: "abc", video_id: U1 }], error: null };
      if (table === "score_units") return { data: [{ score_id: "s1", video_id: U2, sort_order: 0 }], error: null };
      if (table === "videos") return { data: [{ id: U1, title: "1-2 Do 之歌" }, { id: U2, title: "2-1 某課" }], error: null };
      return { data: null, error: null };
    });
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await GET(req("GET"));
    const { data } = await res.json();
    const sel = sb.arg(sb.calls.find((c) => c.table === "scores"), "select");
    expect(sel).not.toMatch(/musicxml(?!_)/);
    expect(data.find((s) => s.id === "s1").units).toEqual([{ video_id: U2, title: "2-1 某課" }]);
    expect(data.find((s) => s.id === "a1").units).toEqual([{ video_id: U1, title: "1-2 Do 之歌" }]);
  });
});

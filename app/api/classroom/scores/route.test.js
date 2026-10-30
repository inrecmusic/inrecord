import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/classroom-auth", () => ({ requireClassroomAuth: vi.fn() }));

import { NextResponse } from "next/server";
import { GET } from "./route";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const VID = "11111111-1111-4111-8111-111111111111";
const ABC_ROW = { id: "a1", video_id: VID, title: "小蜜蜂", subtitle: "右手旋律", abc: "X:1", sort_order: 0 };
const V2_ROW = { id: "s1", title: "小蜜蜂雙手", subtitle: null, format: "musicxml", musicxml: "<x/>", version: 1, sort_order: 1, published: true,
  meta: { defaultAccompaniment: "wave", unitAccompaniment: { [VID]: "root", other: "block" }, warnings: [] } };
const req = (qs = `?video_id=${VID}`) => new Request("http://x/api/classroom/scores" + qs, { headers: { authorization: "Bearer t" } });

function db(v2) {
  return makeSupabaseMock((table) => {
    if (table === "scores") return { data: [ABC_ROW], error: null };
    if (table === "score_units") return v2;
    return { data: null, error: null };
  });
}

describe("GET /api/classroom/scores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERACTIVE_SCORES = "on";
  });
  afterEach(() => delete process.env.INTERACTIVE_SCORES);

  it("未開通 → requireClassroomAuth 擋下", async () => {
    requireClassroomAuth.mockResolvedValue({ res: NextResponse.json({ error: "course_required" }, { status: 403 }) });
    expect((await GET(req())).status).toBe(403);
  });

  it("INTERACTIVE_SCORES 未設 → 空清單", async () => {
    delete process.env.INTERACTIVE_SCORES;
    const sb = db({ data: [], error: null });
    requireClassroomAuth.mockResolvedValue({ supabase: sb });
    expect(await (await GET(req())).json()).toEqual({ scores: [] });
    expect(sb.calls.length).toBe(0);
  });

  it("舊 ABC 與 v2 一起回", async () => {
    const sb = db({ data: [{ sort_order: 0, scores: V2_ROW }], error: null });
    requireClassroomAuth.mockResolvedValue({ supabase: sb });
    const { scores } = await (await GET(req())).json();
    expect(scores.map((s) => [s.id, s.format])).toEqual([["a1", "abc"], ["s1", "musicxml"]]);
    expect(scores[1].musicxml).toBe("<x/>");
    expect(scores[1].defaultAccompaniment).toBe("wave");
    expect(scores[1].lockedAccompaniment).toBe("root"); // 這個單元指定 8-2 根音伴奏
    expect(scores[1].meta).toBe(undefined); // 不外流整份 meta
    const legacy = sb.calls.find((c) => c.table === "scores");
    expect(sb.arg(legacy, "select")).not.toMatch(/format/);
    const link = sb.calls.find((c) => c.table === "score_units");
    expect(sb.arg(link, "eq")).toBe("video_id");
    expect(link.ops.filter((o) => o.m === "eq").map((o) => o.args)).toEqual(
      expect.arrayContaining([["scores.published", true], ["scores.format", "musicxml"]]),
    );
  });

  it("v2 草稿（published:false）不出現", async () => {
    const sb = db({ data: [{ sort_order: 0, scores: { ...V2_ROW, published: false } }], error: null });
    requireClassroomAuth.mockResolvedValue({ supabase: sb });
    const { scores } = await (await GET(req())).json();
    expect(scores.map((s) => s.id)).toEqual(["a1"]);
  });

  it("degrades when v2 columns are missing", async () => {
    for (const error of [
      { code: "42703", message: "column scores.format does not exist" },
      { code: "42P01", message: 'relation "score_units" does not exist' },
    ]) {
      const sb = db({ data: null, error });
      requireClassroomAuth.mockResolvedValue({ supabase: sb });
      const res = await GET(req());
      expect(res.status).toBe(200);
      expect((await res.json()).scores.map((s) => s.id)).toEqual(["a1"]);
    }
  });

  it("video_id 格式錯 → 400", async () => {
    requireClassroomAuth.mockResolvedValue({ supabase: db({ data: [], error: null }) });
    expect((await GET(req("?video_id=abc"))).status).toBe(400);
  });
});

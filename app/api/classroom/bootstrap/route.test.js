import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/classroom-auth", () => ({ requireClassroomAuth: vi.fn() }));
vi.mock("@/lib/course-access", () => ({ hasCourseAccess: vi.fn(async () => true) }));
vi.mock("@/lib/game-devices", () => ({ enforceDeviceLimit: vi.fn(async () => ({})) }));
vi.mock("@/lib/early-access-server", () => ({ resolveEarlyAccess: vi.fn(async () => ({ early: true, error: null })) }));

import { GET } from "./route";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { hasCourseAccess } from "@/lib/course-access";
import { enforceDeviceLimit } from "@/lib/game-devices";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const USER = { id: "u1", email: "student@x.com" };
const VIDEOS = [
  { id: "v1", chapter_id: "c1", title: "1-1", sort_order: 1, bunny_video_id: "bunny-1", vimeo_id: null, published: true },
  { id: "v2", chapter_id: "c1", title: "1-2", sort_order: 2, bunny_video_id: null, vimeo_id: null, published: true },
];
const ANN = [{ id: "a1", title: "公告", body: "內容", pinned: false, important: true, created_at: "2026-09-04T00:00:00Z" }];

function makeDb() {
  return makeSupabaseMock((table, ops) => {
    const sel = ops.find((o) => o.m === "select");
    if (table === "videos" && sel?.args[1]?.count) return { count: VIDEOS.length, error: null };
    switch (table) {
      case "chapters": return { data: [{ id: "c1", title: "Ch1", sort_order: 1 }], error: null };
      case "videos": return { data: VIDEOS.map((v) => ({ ...v })), error: null };
      case "progress": return { data: [{ video_id: "v1", watched_seconds: 60, total_seconds: 100, completed: true, watched_at: "2026-09-04T00:00:00Z" }], error: null };
      case "announcements": return { data: ANN, error: null };
      case "materials": case "games": return { data: [], error: null };
      default: return { data: null, error: null }; // subscriptions / student_profiles / orders → 無資料
    }
  });
}

const req = (qs = "") => new Request("http://x/api/classroom/bootstrap" + qs, { headers: { "user-agent": "vitest" } });

describe("GET /api/classroom/bootstrap（教室進場一次取回）", () => {
  let sb;
  beforeEach(() => {
    vi.clearAllMocks();
    sb = makeDb();
    requireClassroomAuth.mockResolvedValue({ user: USER, supabase: sb });
    hasCourseAccess.mockResolvedValue(true);
  });

  it("未登入 → 直接回 requireClassroomAuth 給的 401", async () => {
    requireClassroomAuth.mockResolvedValueOnce({ res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
    expect((await GET(req())).status).toBe(401);
  });

  it("未購課 → hasPurchased=false，且不撈章節／影片", async () => {
    hasCourseAccess.mockResolvedValueOnce(false);
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: true, hasPurchased: false, chapters: [], videos: [] });
    expect(sb.calls.some((c) => c.table === "chapters")).toBe(false);
  });

  it("儀表板模式：回章節／影片／進度與百分比；影片不外露 bunny_video_id 但帶 playable；不帶公告", async () => {
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: true, hasPurchased: true, completedCount: 1, totalCount: 2, percentage: 50 });
    expect(body.chapters).toHaveLength(1);
    expect(body.videos.map((v) => v.playable)).toEqual([true, false]);
    expect(body.videos[0]).not.toHaveProperty("bunny_video_id");
    expect(body.announcements).toBeUndefined();
    expect(enforceDeviceLimit).not.toHaveBeenCalled();
  });

  it("播放頁模式沒帶 device_id → 400 device_required", async () => {
    const res = await GET(req("?player=1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "device_required" });
  });

  it("播放頁模式：檢查裝置上限、影片帶 bunny_video_id、公告含 important", async () => {
    const body = await (await GET(req("?player=1&device_id=d1"))).json();
    expect(enforceDeviceLimit).toHaveBeenCalledWith(sb, expect.objectContaining({ userId: "u1", deviceId: "d1" }));
    expect(body.videos[0].bunny_video_id).toBe("bunny-1");
    expect(body.announcements).toEqual([expect.objectContaining({ id: "a1", important: true })]);
    expect(body.contentItems).toBeDefined();
  });

  it("裝置數超限 → 回 enforceDeviceLimit 的錯誤與狀態碼", async () => {
    enforceDeviceLimit.mockResolvedValueOnce({ error: "device_limit", status: 403 });
    const res = await GET(req("?player=1&device_id=d9"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "device_limit" });
  });
});

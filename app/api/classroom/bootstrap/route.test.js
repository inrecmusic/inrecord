import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { resolveEarlyAccess } from "@/lib/early-access-server";
import { FULL_RELEASE_MS, SECOND_RELEASE_MS } from "@/lib/early-access";

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

// ── 分批上架（非早鳥：9/30 開放 Ch1～Ch3、10/31 完整上架）────────────────────
// ⚠️ chapters.sort_order 是 0-based：0=Ch1、1=Ch2、2=Ch3、3=Ch4、10=附錄1
const TIER_CHAPTERS = [
  { id: "c1", title: "Ch1 踏上黑白鍵的第一步", sort_order: 0 },
  { id: "c3", title: "Ch3 看懂樂譜", sort_order: 2 },
  { id: "c4", title: "Ch4 節奏與拍子", sort_order: 3 },
  { id: "cA", title: "附錄1 如何更有效率地練琴？", sort_order: 10 },
];
const TIER_VIDEOS = [
  { id: "t",  chapter_id: "c1", title: "試看：課程 Demo", sort_order: 0, bunny_video_id: "b0", vimeo_id: null, published: true },
  { id: "a1", chapter_id: "c1", title: "1-1 認識鋼琴鍵盤", sort_order: 1, bunny_video_id: "b1", vimeo_id: null, published: true },
  { id: "a3", chapter_id: "c3", title: "3-1 看懂樂譜",     sort_order: 3, bunny_video_id: "b3", vimeo_id: null, published: true },
  { id: "a4", chapter_id: "c4", title: "4-1 節奏與拍子",   sort_order: 4, bunny_video_id: null, vimeo_id: "v4", published: true },
  { id: "ax", chapter_id: "cA", title: "附錄 練琴方法",     sort_order: 5, bunny_video_id: "bA", vimeo_id: null, published: true },
  { id: "an", chapter_id: null, title: "未分章單元",        sort_order: 6, bunny_video_id: "bN", vimeo_id: null, published: true },
];

function makeTierDb({ chaptersFail = false } = {}) {
  return makeSupabaseMock((table, ops) => {
    const sel = ops.find((o) => o.m === "select");
    if (table === "videos" && sel?.args[1]?.count) return { count: TIER_VIDEOS.length, error: null };
    switch (table) {
      case "chapters": return chaptersFail ? { data: null, error: { message: "boom" } } : { data: TIER_CHAPTERS, error: null };
      case "videos": return { data: TIER_VIDEOS.map((v) => ({ ...v })), error: null };
      case "progress": return { data: [], error: null };
      case "announcements": case "materials": case "games": return { data: [], error: null };
      default: return { data: null, error: null };
    }
  });
}

describe("GET /api/classroom/bootstrap（早鳥分批上架）", () => {
  let sb;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sb = makeTierDb();
    requireClassroomAuth.mockResolvedValue({ user: USER, supabase: sb });
    hasCourseAccess.mockResolvedValue(true);
  });
  afterEach(() => vi.useRealTimers());

  // 儀表板模式只回 playable 旗標（不外露來源 id），正好對應「能不能播」
  async function playable({ now, early = true, error = null, db }) {
    vi.setSystemTime(now);
    resolveEarlyAccess.mockResolvedValue({ early, error });
    if (db) requireClassroomAuth.mockResolvedValue({ user: USER, supabase: db });
    const body = await (await GET(req())).json();
    return { body, map: Object.fromEntries(body.videos.map((v) => [v.id, v.playable])) };
  }

  it("非早鳥、9/30–10/31：只有 Ch1～Ch3 與試看可播；Ch4／附錄／無章節不可播", async () => {
    const { body, map } = await playable({ now: Date.parse("2026-10-15T12:00:00+08:00"), early: false });
    expect(body.earlyAccess).toBe(false);
    expect(map).toEqual({ t: true, a1: true, a3: true, a4: false, ax: false, an: false });
    expect(body.chapters).toHaveLength(4); // 大綱照常完整回傳
  });

  it("非早鳥、9/30 前：只有試看可播", async () => {
    const { map } = await playable({ now: Date.parse("2026-09-15T12:00:00+08:00"), early: false });
    expect(map).toEqual({ t: true, a1: false, a3: false, a4: false, ax: false, an: false });
  });

  it("非早鳥、10/31 起：全部可播，且不再查早鳥資格", async () => {
    const { body, map } = await playable({ now: Date.parse("2026-11-05T12:00:00+08:00"), early: false });
    expect(map).toEqual({ t: true, a1: true, a3: true, a4: true, ax: true, an: true });
    expect(body.earlyAccess).toBeUndefined();
    expect(resolveEarlyAccess).not.toHaveBeenCalled();
  });

  it("早鳥：三段時間全部可播（含 Ch4、附錄、無章節）", async () => {
    for (const now of [Date.parse("2026-09-15T12:00:00+08:00"), Date.parse("2026-10-15T12:00:00+08:00"), Date.parse("2026-11-05T12:00:00+08:00")]) {
      const { map } = await playable({ now, early: true });
      expect(map).toEqual({ t: true, a1: true, a3: true, a4: true, ax: true, an: true });
    }
  });

  it("查詢故障維持 fail-open：非早鳥也當早鳥、全部可播（硬閘門在 video-embed）", async () => {
    const { body, map } = await playable({ now: Date.parse("2026-10-15T12:00:00+08:00"), early: false, error: true });
    expect(body.earlyAccess).toBe(true);
    expect(map.a4).toBe(true);
  });

  it("章節讀取失敗：非早鳥保守只留試看（大綱本來就空）", async () => {
    const { map } = await playable({ now: Date.parse("2026-10-15T12:00:00+08:00"), early: false, db: makeTierDb({ chaptersFail: true }) });
    expect(map).toEqual({ t: true, a1: false, a3: false, a4: false, ax: false, an: false });
  });

  it("邊界：正好 9/30 20:00 Ch1 開、Ch4 仍關；正好 10/31 20:00 Ch4 開", async () => {
    expect((await playable({ now: FULL_RELEASE_MS - 1, early: false })).map.a1).toBe(false);
    expect((await playable({ now: FULL_RELEASE_MS, early: false })).map).toMatchObject({ a1: true, a4: false });
    expect((await playable({ now: SECOND_RELEASE_MS - 1, early: false })).map.a4).toBe(false);
    expect((await playable({ now: SECOND_RELEASE_MS, early: false })).map.a4).toBe(true);
  });

  it("播放頁模式同樣分批：非早鳥的 Ch4 拿不到 bunny_video_id／vimeo_id", async () => {
    vi.setSystemTime(Date.parse("2026-10-15T12:00:00+08:00"));
    resolveEarlyAccess.mockResolvedValue({ early: false, error: null });
    const body = await (await GET(req("?player=1&device_id=d1"))).json();
    const byId = Object.fromEntries(body.videos.map((v) => [v.id, v]));
    expect(byId.a1.bunny_video_id).toBe("b1");
    expect(byId.a4.vimeo_id).toBeNull();
    expect(byId.ax.bunny_video_id).toBeNull();
    expect(byId.t.bunny_video_id).toBe("b0");
  });
});

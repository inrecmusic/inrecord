import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/classroom-auth", () => ({ requireClassroomAuth: vi.fn() }));
vi.mock("@/lib/early-access-server", () => ({ resolveEarlyAccess: vi.fn(async () => ({ early: false, error: false })) }));

import { GET } from "./route";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { resolveEarlyAccess } from "@/lib/early-access-server";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";
import { FULL_RELEASE_MS, SECOND_RELEASE_MS } from "@/lib/early-access";

const USER = { id: "u1", email: "student@x.com" };
// ⚠️ chapters.sort_order 是 0-based：0=Ch1、2=Ch3、3=Ch4、10=附錄1
const CHAPTERS = { c1: 0, c3: 2, c4: 3, cA: 10 };
const VIDEOS = {
  "v-ch1": { title: "1-1 認識鋼琴鍵盤", chapter_id: "c1", bunny_video_id: "bunny-1", vimeo_id: null },
  "v-ch3": { title: "3-1 看懂樂譜", chapter_id: "c3", bunny_video_id: "bunny-3", vimeo_id: null },
  "v-ch4": { title: "4-1 節奏與拍子", chapter_id: "c4", bunny_video_id: "bunny-4", vimeo_id: null },
  "v-apx": { title: "附錄 練琴方法", chapter_id: "cA", bunny_video_id: "bunny-a", vimeo_id: null },
  "v-nochap": { title: "未分章單元", chapter_id: null, bunny_video_id: "bunny-n", vimeo_id: null },
  "v-trial": { title: "試看：課程 Demo", chapter_id: "c4", bunny_video_id: "bunny-t", vimeo_id: null },
};

// chaptersFails=true 模擬章節查詢故障（回 data:null）
function makeDb({ chaptersFails = false } = {}) {
  return makeSupabaseMock((table, ops) => {
    const id = ops.find((o) => o.m === "eq" && o.args[0] === "id")?.args[1];
    if (table === "videos") return { data: VIDEOS[id] ? { ...VIDEOS[id] } : null, error: null };
    if (table === "chapters") {
      if (chaptersFails) return { data: null, error: { message: "boom" } };
      return { data: id in CHAPTERS ? { sort_order: CHAPTERS[id] } : null, error: null };
    }
    return { data: null, error: null };
  });
}

const req = (videoId) => new Request(`http://x/api/classroom/video-embed?video_id=${videoId}`);
const BEFORE_FIRST = Date.parse("2026-09-15T12:00:00+08:00");
const BETWEEN = Date.parse("2026-10-15T12:00:00+08:00");
const AFTER_SECOND = Date.parse("2026-11-05T12:00:00+08:00");

async function call(videoId, { now, early = false, db = makeDb() } = {}) {
  vi.setSystemTime(now);
  resolveEarlyAccess.mockResolvedValue({ early, error: false });
  requireClassroomAuth.mockResolvedValue({ user: USER, supabase: db });
  const res = await GET(req(videoId));
  return { res, body: await res.json(), db };
}

describe("GET /api/classroom/video-embed（分批上架硬閘門）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID = "733049";
    process.env.BUNNY_TOKEN_KEY = "k";
  });
  afterEach(() => vi.useRealTimers());

  it("未登入／未購課 → 直接回 requireClassroomAuth 的回應", async () => {
    requireClassroomAuth.mockResolvedValueOnce({ res: NextResponse.json({ error: "forbidden" }, { status: 403 }) });
    expect((await GET(req("v-ch1"))).status).toBe(403);
  });

  it("缺 video_id → 400；查無已發布影片 → 404", async () => {
    requireClassroomAuth.mockResolvedValue({ user: USER, supabase: makeDb() });
    expect((await GET(new Request("http://x/api/classroom/video-embed"))).status).toBe(400);
    const { res } = await call("nope", { now: BETWEEN });
    expect(res.status).toBe(404);
  });

  it("非早鳥、9/30–10/31：Ch4 回 403 not_released", async () => {
    const { res, body } = await call("v-ch4", { now: BETWEEN });
    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "not_released" });
  });

  it("非早鳥、9/30–10/31：第一批 Ch1／Ch3 簽發 Bunny 網址", async () => {
    for (const id of ["v-ch1", "v-ch3"]) {
      const { res, body } = await call(id, { now: BETWEEN });
      expect(res.status).toBe(200);
      expect(body.provider).toBe("bunny");
      expect(body.src).toMatch(/token=[a-f0-9]{64}&expires=\d+/);
    }
  });

  it("非早鳥、9/30–10/31：附錄與無章節影片被擋", async () => {
    expect((await call("v-apx", { now: BETWEEN })).res.status).toBe(403);
    expect((await call("v-nochap", { now: BETWEEN })).res.status).toBe(403);
  });

  it("非早鳥、無章節影片：不會去查 chapters（chapter_id 為 null）", async () => {
    const { db } = await call("v-nochap", { now: BETWEEN });
    expect(db.calls.some((c) => c.table === "chapters")).toBe(false);
  });

  it("非早鳥、章節查詢故障 → 保守擋下", async () => {
    const { res } = await call("v-ch1", { now: BETWEEN, db: makeDb({ chaptersFails: true }) });
    expect(res.status).toBe(403);
  });

  it("非早鳥、9/30 前：連 Ch1 都擋，且不必查章節", async () => {
    const { res, db } = await call("v-ch1", { now: BEFORE_FIRST });
    expect(res.status).toBe(403);
    expect(db.calls.some((c) => c.table === "chapters")).toBe(false);
  });

  it("非早鳥、10/31 起：Ch4／附錄全開，且不再查早鳥資格", async () => {
    for (const id of ["v-ch4", "v-apx", "v-nochap"]) {
      const { res, body } = await call(id, { now: AFTER_SECOND });
      expect(res.status).toBe(200);
      expect(body.provider).toBe("bunny");
    }
    expect(resolveEarlyAccess).not.toHaveBeenCalled();
  });

  it("早鳥：三段時間、任何章節（含附錄、無章節）都簽發，且不查 chapters", async () => {
    for (const now of [BEFORE_FIRST, BETWEEN, AFTER_SECOND]) {
      for (const id of ["v-ch4", "v-apx", "v-nochap"]) {
        const { res, body, db } = await call(id, { now, early: true });
        expect(res.status).toBe(200);
        expect(body.src).toContain("iframe.mediadelivery.net/embed/733049/");
        expect(db.calls.some((c) => c.table === "chapters")).toBe(false);
      }
    }
  });

  it("試看單元：任何時間、非早鳥也可播，且不查早鳥資格", async () => {
    for (const now of [BEFORE_FIRST, BETWEEN, AFTER_SECOND]) {
      const { res } = await call("v-trial", { now });
      expect(res.status).toBe(200);
    }
    expect(resolveEarlyAccess).not.toHaveBeenCalled();
  });

  it("邊界：正好 9/30 20:00 Ch1 開放、Ch4 仍擋；正好 10/31 20:00 Ch4 開放", async () => {
    expect((await call("v-ch1", { now: FULL_RELEASE_MS - 1 })).res.status).toBe(403);
    expect((await call("v-ch1", { now: FULL_RELEASE_MS })).res.status).toBe(200);
    expect((await call("v-ch4", { now: FULL_RELEASE_MS })).res.status).toBe(403);
    expect((await call("v-ch4", { now: SECOND_RELEASE_MS - 1 })).res.status).toBe(403);
    expect((await call("v-ch4", { now: SECOND_RELEASE_MS })).res.status).toBe(200);
  });

  it("只簽發已發布影片（published=true 條件仍在）", async () => {
    const { db } = await call("v-ch1", { now: AFTER_SECOND });
    const vq = db.calls.find((c) => c.table === "videos");
    expect(vq.ops.some((o) => o.m === "eq" && o.args[0] === "published" && o.args[1] === true)).toBe(true);
    expect(db.arg(vq, "select")).toContain("chapter_id");
  });
});

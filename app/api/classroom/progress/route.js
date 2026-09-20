import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { createDistributedLimiter } from "@/lib/rate-limit";
import { parseDurationSeconds } from "@/lib/duration";

// 進度寫入限流：key 用 user.id（登入後比 IP 精準，也不會誤傷同一個 NAT／校園網路下的多位學員）。
// 門檻 20 次/分的算法：前端心跳固定每 10 秒一次，sliding window 內單一播放器最多 7 次；
// 開兩個分頁邊看邊複習約 14 次，再加上播完的 ended 補送，15 次會擦邊被擋，故取 20 留餘裕。
// 對灌水的效果：單次 viewed_delta 已夾在 15 秒，20 次/分＝每分鐘最多記 300 秒觀看，
// 也就是實際時間的 5 倍上限，無法再用迴圈在數秒內把單元刷成 completed 換結業證書。
const progressLimiter = createDistributedLimiter({ limit: 20, windowMs: 60_000, prefix: "rl:classroom-progress" });

// 進度心跳每 10 秒一次，購課檢查結果以 email 為 key 快取 60 秒，減半熱路徑 DB 往返
// （開通/退款後最多延遲 60 秒生效，對進度寫入無實害）。
const accessCache = new Map(); // email -> { ok, exp }
async function hasCourseAccessCached(admin, email) {
  const now = Date.now();
  const hit = accessCache.get(email);
  if (hit && hit.exp > now) return hit.ok;
  const ok = await hasCourseAccess(admin, email);
  accessCache.set(email, { ok, exp: now + 60_000 });
  if (accessCache.size > 500) { // 簡單防脹
    for (const [k, v] of accessCache) { if (v.exp <= now) accessCache.delete(k); }
  }
  return ok;
}

// 影片長度（伺服器端權威值）快取 5 分鐘：心跳每 10 秒一次，不快取會變成每次心跳多一次 DB 往返。
// 值為 { published, seconds }；查不到該影片記 null。
const videoCache = new Map(); // video_id -> { v, exp }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getVideoCached(admin, videoId) {
  const now = Date.now();
  const hit = videoCache.get(videoId);
  if (hit && hit.exp > now) return hit.v;
  const { data } = await admin.from("videos").select("published, duration").eq("id", videoId).maybeSingle();
  const v = data ? { published: !!data.published, seconds: parseDurationSeconds(data.duration) } : null;
  videoCache.set(videoId, { v, exp: now + 300_000 });
  if (videoCache.size > 500) { // 簡單防脹
    for (const [k, e] of videoCache) { if (e.exp <= now) videoCache.delete(k); }
  }
  return v;
}

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function getUser(token) {
  if (!token) return null;
  const { data: { user }, error } = await getUserClient(token).auth.getUser();
  return error || !user ? null : user;
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user = await getUser(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, progress: [], completedCount: 0, totalCount: 0, percentage: 0 });

  const [progRes, countRes] = await Promise.all([
    admin
      .from("progress")
      .select("video_id, watched_seconds, total_seconds, completed, watched_at")
      .eq("user_id", user.id),
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("published", true),
  ]);

  if (progRes.error) return serverError(progRes.error);

  const progress = progRes.data || [];
  const completedCount = progress.filter(p => p.completed).length;
  const totalCount = countRes.count || 0;
  const percentage = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  return NextResponse.json({ ok: true, progress, completedCount, totalCount, percentage });
}

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user = await getUser(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await progressLimiter(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  // 須已購課才能寫進度（擋非購課者灌進度列）
  if (!(await hasCourseAccessCached(admin, user.email))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { video_id, watched_seconds = 0, total_seconds = 0, viewed_delta = 0 } = await req.json();
  if (!video_id) return NextResponse.json({ error: "video_id_required" }, { status: 400 });
  // video_id 一律驗格式：非 UUID 會讓 PostgREST 丟 22P02，變成 500
  if (typeof video_id !== "string" || !UUID_RE.test(video_id)) {
    return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });
  }
  const video = await getVideoCached(admin, video_id);
  if (!video || !video.published) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const clientTotal = Math.max(0, Math.floor(Number(total_seconds) || 0));
  // 完成判定的分母一律以伺服器端知道的長度為準（後台 duration 欄位），不採信前端送來的 total_seconds——
  // 否則連送兩次 total_seconds=1 就能把任一單元刷成完成、進而取得結業證書。
  // 後台沒填 duration 才退回前端值，此時靠 RPC 的 GREATEST 保證門檻只會往上、不會被後來的小 total 調低。
  const t = video.seconds || clientTotal;
  const wRaw = Math.max(0, Math.floor(Number(watched_seconds) || 0));
  const w = t > 0 ? Math.min(wRaw, t) : wRaw; // watched_seconds＝最遠播放位置（續播用）
  // viewed_delta＝這次心跳「實際播放」的秒數。夾在 0..15（心跳 10 秒 + 容忍誤差）：
  // 拖拉進度條、快轉、竄改大數值都無法灌水累計觀看時數。
  const d = Math.min(15, Math.max(0, Math.floor(Number(viewed_delta) || 0)));
  // 完成判定改看「累計實際觀看」達 70%（在 RPC 內以 viewed_seconds+delta 計算，避免拖到片尾就算完成）；
  // 此處的 c 僅作為 RPC 尚未部署時的後備門檻。
  const c = t > 0 && w >= Math.floor(t * 0.7);

  // 原子更新：RPC 內以 GREATEST(watched/total) + (completed OR …) 合併，
  // 避免並發（多分頁/快速心跳）的 read-modify-write 互相覆蓋而遺失進度。
  const rpc = await admin.rpc("upsert_progress", {
    p_user_id: user.id, p_video_id: video_id, p_watched: w, p_total: t, p_completed: false, p_viewed_delta: d,
  });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    return NextResponse.json({ ok: true, data: row });
  }

  // 後備：RPC 尚未部署（supabase-deploy.sql）時，退回非原子 read-modify-write，確保進度仍可記錄。
  console.error("[progress] rpc upsert_progress 失敗，退回 read-modify-write:", rpc.error.message);
  const { data: existing } = await admin
    .from("progress")
    .select("watched_seconds, viewed_seconds, completed")
    .eq("user_id", user.id)
    .eq("video_id", video_id)
    .maybeSingle();

  const viewed = (existing?.viewed_seconds || 0) + d;
  const { data, error } = await admin
    .from("progress")
    .upsert({
      user_id: user.id,
      video_id,
      watched_seconds: Math.max(w, existing?.watched_seconds || 0),
      total_seconds: t,
      viewed_seconds: viewed,
      completed: existing?.completed || (t > 0 && viewed >= Math.floor(t * 0.7)),
      watched_at: new Date().toISOString(),
    }, { onConflict: "user_id,video_id" })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}

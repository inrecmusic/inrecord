import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWatermark, exceedsDeviceLimit } from "@/lib/game-devices";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("email", user.email)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) return NextResponse.json({ error: "subscription_required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const gameId  = searchParams.get("id");
  const videoId = searchParams.get("video_id");

  /* ── single game (with content) ── */
  if (gameId) {
    const { data: game, error } = await supabase
      .from("games").select("*").eq("id", gameId).single();

    if (error || !game || game.is_active === false)
      return NextResponse.json({ error: "game_not_found" }, { status: 404 });

    // url 類型＝公開試玩：不套裝置上限/浮水印
    if (game.game_type === "url") {
      return NextResponse.json({ game: { ...game, html_content: null } });
    }

    // ── 裝置上限（只對 html 付費遊戲）──
    const deviceId = searchParams.get("device_id");
    if (!deviceId) return NextResponse.json({ error: "device_required" }, { status: 400 });

    const { data: settings } = await supabase
      .from("game_settings").select("device_limit").eq("id", "default").single();
    const limit = settings?.device_limit ?? 3;

    const { data: devices, error: devErr } = await supabase
      .from("game_devices").select("device_id, last_seen_at").eq("user_id", user.id);
    if (devErr) return NextResponse.json({ error: "device_check_failed" }, { status: 500 });

    // 先檢查（基於 bump 前狀態）：近 30 分鐘其他活躍裝置達上限 → 擋
    if (exceedsDeviceLimit(devices || [], deviceId, limit, Date.now(), 30 * 60 * 1000))
      return NextResponse.json({ error: "device_limit", limit }, { status: 403 });

    // 放行後才更新當前裝置 last_seen
    const ua = req.headers.get("user-agent") || null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase.from("game_devices").upsert(
      { user_id: user.id, device_id: deviceId, user_agent: ua, ip, last_seen_at: nowIso },
      { onConflict: "user_id,device_id" }
    );
    if (upErr) return NextResponse.json({ error: "device_check_failed" }, { status: 500 });

    // 浮水印（含日期）＋防嵌入
    const siteHost = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
      : "inrecordmusic.com";
    let html = (game.html_content || "").replace(
      "</body>", `${buildWatermark(user.email, nowIso.slice(0, 10))}</body>`
    );
    html = html.replace(
      "<head>",
      `<head><script>if(window.top!==window.self&&!document.referrer.includes('${siteHost}')){document.body.innerHTML='⛔ 未授權存取';}</script>`
    );

    // no-store：html 內容不落瀏覽器快取
    return new NextResponse(
      JSON.stringify({ game: { ...game, html_content: html } }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }

  /* ── list games for a video unit ── */
  let query = supabase
    .from("games")
    .select("*")
    .order("sort_order", { ascending: true });

  if (videoId) query = query.eq("video_id", videoId);

  const { data: rawGames, error: listErr } = await query;

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  // filter active, strip html_content from list to keep payload small
  const games = (rawGames || [])
    .filter(g => g.is_active !== false)
    .map(({ html_content: _, ...g }) => g);

  return NextResponse.json({ games });
}

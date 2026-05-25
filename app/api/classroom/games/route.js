import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

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
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (error || !game || game.is_active === false) return NextResponse.json({ error: "game_not_found" }, { status: 404 });

    if (game.game_type === "url") {
      return NextResponse.json({ game: { ...game, html_content: null } });
    }

    const siteHost = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
      : "inrecord-swart.vercel.app";

    let html = (game.html_content || "").replace(
      "</body>",
      `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);opacity:0.06;font-size:16px;color:#fff;pointer-events:none;z-index:9999;white-space:nowrap;user-select:none">${user.email} · InRecord</div></body>`
    );

    html = html.replace(
      "<head>",
      `<head><script>if(window.top!==window.self&&!document.referrer.includes('${siteHost}')){document.body.innerHTML='⛔ 未授權存取';}</script>`
    );

    return NextResponse.json({ game: { ...game, html_content: html } });
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

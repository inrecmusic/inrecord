import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWatermark, enforceDeviceLimit } from "@/lib/game-devices";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// 允許嵌入遊戲的主機名：本次請求的主機（＝學員正在瀏覽的網域，正式站／preview／本機都自動涵蓋）
// 加上 NEXT_PUBLIC_SITE_URL。只留合法主機名字元，避免可偽造的 Host 標頭把字串帶進注入的 script。
function allowedHosts(req) {
  const list = [
    (req.headers.get("host") || "").toLowerCase().split(":")[0],
    (() => {
      try { return new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname.toLowerCase(); }
      catch { return "inrecordmusic.com"; }
    })(),
  ].filter(h => /^[a-z0-9.-]+$/.test(h));
  return [...new Set(list)];
}

// 防盜嵌入守衛：被別的網站 iframe 進去就把內容清掉。原本的三個問題：
// 1) 腳本注在 <head>，執行當下 document.body 還是 null，`document.body.innerHTML=…` 直接丟
//    TypeError → 守衛等於完全沒作用。改成 DOM 就緒後才動 body。
// 2) `document.referrer.includes(siteHost)` 是子字串比對，inrecordmusic.com.evil.net 也會通過。
//    改成解析出 hostname 做精確比對。
// 3) 只看 referrer 不可靠：教室是用 <iframe srcdoc sandbox="allow-scripts allow-forms">（無
//    allow-same-origin）載入遊戲，實測 Chrome 的 referrer 是母頁網址、Firefox 是空字串，
//    top.location 則兩者都因不同源而丟例外。改以 location.ancestorOrigins 為主要訊號
//    （Chrome/Firefox 實測在此情境都拿得到母頁 origin，Safari 亦支援），top.location／referrer
//    當退路。三種訊號都問不到嵌入方時放行——寧可少擋，也不能讓正常學員看到「未授權存取」。
function buildFrameGuard(hosts) {
  return `<script>(function(){var A=${JSON.stringify(hosts)};function H(u){try{return new URL(u).hostname}catch(e){return ""}}function B(){function f(){if(document.body)document.body.innerHTML='⛔ 未授權存取'}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',f)}else{f()}}if(window.top===window.self)return;var s=[],h,i;try{var a=location.ancestorOrigins;for(i=0;a&&i<a.length;i++){h=H(a[i]);if(h)s.push(h)}}catch(e){}if(!s.length){try{h=window.top.location.hostname;if(h)s.push(h)}catch(e){}}if(!s.length){h=H(document.referrer);if(h)s.push(h)}for(i=0;i<s.length;i++){if(A.indexOf(s[i])<0){B();return}}})();</script>`;
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

  // PGRST116＝.single() 查無資料（真的沒有存取權）；其他錯誤代表 DB 出狀況，此時 sub 一樣是 null，
  // 照舊回 403 會讓已付費學員在資料庫短暫故障時看到「需要訂閱」→ 改回 503 讓前端可重試。
  if (subErr && subErr.code !== "PGRST116") {
    console.error("[games] 讀取遊戲存取權失敗:", subErr.message || subErr);
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
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

    // ── 裝置上限（只對 html 付費遊戲；擠最舊維持 N 台，不再用時間窗擋）──
    const deviceId = searchParams.get("device_id");
    if (!deviceId) return NextResponse.json({ error: "device_required" }, { status: 400 });

    const ua = req.headers.get("user-agent") || null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const dev = await enforceDeviceLimit(supabase, { userId: user.id, deviceId, ua, ip });
    if (dev.error) return NextResponse.json({ error: dev.error }, { status: dev.status });

    // 浮水印（含日期）＋防嵌入守衛
    const nowIso = new Date().toISOString();
    const raw = game.html_content || "";
    const HEAD_OPEN = /<head[^>]*>/i;
    const BODY_CLOSE = /<\/body\s*>/i;
    const guard = buildFrameGuard(allowedHosts(req));

    const watermark = buildWatermark(user.email, nowIso.slice(0, 10));

    // 優先注在 </body> 之前：守衛已自帶 DOM 就緒判斷，放這裡不會把遊戲 <head> 裡的
    // <meta charset> 往後推（瀏覽器只掃前 1024 bytes 找編碼）。沒有 </body> 才退而求其次注進 <head>。
    let html;
    if (BODY_CLOSE.test(raw)) html = raw.replace(BODY_CLOSE, m => guard + watermark + m);
    else if (HEAD_OPEN.test(raw)) html = raw.replace(HEAD_OPEN, m => m + guard) + watermark;
    // 片段式 HTML（沒有 </body> 也沒有 <head>）：守衛自帶 document.readyState／DOMContentLoaded 判斷，
    // 直接前置注入一樣有效。不要在這裡回 500——那會讓原本能玩的遊戲整支壞掉，而防護力並沒有變好。
    else html = guard + raw + watermark;

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

  if (listErr) return serverError(listErr);

  // filter active, strip html_content from list to keep payload small
  const games = (rawGames || [])
    .filter(g => g.is_active !== false)
    .map(({ html_content: _, ...g }) => g);

  return NextResponse.json({ games });
}

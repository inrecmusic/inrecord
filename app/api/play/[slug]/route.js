import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { publicGame, injectEndSignal } from "@/lib/public-games";

// 公開試玩遊戲的 HTML 來源（免登入）。只服務 lib/public-games.js 白名單上的遊戲，
// 且以「標題」查，呼叫端無法指定 id —— 其餘付費遊戲一律走 /api/classroom/games（要購課＋裝置上限）。
// 只給 iframe 用；frame-ancestors 'self' 擋掉外站嵌入。
export const revalidate = 3600;

export async function GET(req, { params }) {
  const meta = publicGame(params?.slug);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("games")
    .select("html_content, is_active")
    .eq("title", meta.title)
    .not("is_active", "is", false)
    .maybeSingle();

  if (error) {
    console.error("[play] 讀取失敗", error.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!data?.html_content) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(injectEndSignal(data.html_content), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}

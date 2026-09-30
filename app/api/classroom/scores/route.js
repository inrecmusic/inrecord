import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";

// GET /api/classroom/scores?video_id=<uuid>
// 互動樂譜內容（ABC 文字譜）。與遊戲同樣屬付費教材：驗 Supabase JWT ＋ 課程開通後才回。
// 表還沒建（尚未執行 supabase-scores.sql）時回 200 ＋ 空清單，播放頁只是不顯示樂譜分頁，不報錯。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req) {
  const gate = await requireClassroomAuth(req);
  if (gate.res) return gate.res;
  const { supabase } = gate;

  // INTERACTIVE_SCORES 未設＝功能關閉（正式站先關、preview 先試）
  if (process.env.INTERACTIVE_SCORES !== "on") return NextResponse.json({ scores: [] });

  const videoId = new URL(req.url).searchParams.get("video_id");
  if (videoId && !UUID_RE.test(videoId)) return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });

  try {
    let q = supabase.from("scores").select("id, video_id, title, subtitle, abc, sort_order")
      .eq("published", true).order("sort_order", { ascending: true });
    if (videoId) q = q.eq("video_id", videoId);
    const { data, error } = await q;
    if (error) {
      // 表還沒建：安全降級成「這個單元沒有樂譜」
      if (/scores/i.test(error.message || "") && /does not exist|schema cache/i.test(error.message || "")) {
        return NextResponse.json({ scores: [], tableMissing: true });
      }
      return serverError(error);
    }
    return NextResponse.json({ scores: data || [] });
  } catch (err) {
    return serverError(err);
  }
}

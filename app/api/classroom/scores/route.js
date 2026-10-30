import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { mergeUnitScores, isMissingRelation } from "@/lib/score/unit-scores";

// GET /api/classroom/scores?video_id=<uuid>
// 互動樂譜內容：舊 ABC 文字譜（scores.video_id）＋ v2 雙手 MusicXML（score_units 多對多）。
// 與遊戲同樣屬付費教材：驗 Supabase JWT ＋ 課程開通後才回。
// 表還沒建（尚未執行 supabase-scores.sql）時回 200 ＋ 空清單；v2 欄位／表還沒建（supabase-scores-v2.sql）
// 時只回舊 ABC——舊查詢刻意只選舊欄位（不選 format），以 abc 非空認定舊版。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const V2_COLS = "id, title, subtitle, format, musicxml, version, sort_order, published, meta";

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
      .eq("published", true).not("abc", "is", null).order("sort_order", { ascending: true });
    if (videoId) q = q.eq("video_id", videoId);
    const v2q = videoId
      ? supabase.from("score_units").select(`sort_order, scores!inner(${V2_COLS})`)
        .eq("video_id", videoId).eq("scores.published", true).eq("scores.format", "musicxml")
      : supabase.from("scores").select(V2_COLS).eq("published", true).eq("format", "musicxml");
    const [{ data, error }, v2] = await Promise.all([q, v2q]);
    if (error) {
      // 表還沒建：安全降級成「這個單元沒有樂譜」
      if (/scores/i.test(error.message || "") && /does not exist|schema cache/i.test(error.message || "")) {
        return NextResponse.json({ scores: [], tableMissing: true });
      }
      return serverError(error);
    }
    let linked = [];
    if (v2.error) {
      if (!isMissingRelation(v2.error)) return serverError(v2.error);
      console.error("[classroom/scores] v2 尚未建表，只回舊 ABC：", v2.error.message);
    } else {
      linked = (v2.data || [])
        .map((r) => (videoId ? r.scores && { ...r.scores, sort_order: r.sort_order ?? r.scores.sort_order } : r))
        .filter((s) => s && s.published === true && s.format === "musicxml");
    }
    return NextResponse.json({ scores: mergeUnitScores(data, linked, videoId) });
  } catch (err) {
    return serverError(err);
  }
}

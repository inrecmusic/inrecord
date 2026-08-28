import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";

const BUCKET = "course-materials";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { supabase } = g;

  const url = new URL(req.url);

  // 簽章模式（?id=<materialId>）：下載當下才簽一張新鮮的短效 URL。
  // 舊做法在「清單載入時」就把每筆都簽好（300 秒），學員看完 >5 分鐘影片再點就已過期。
  const signRaw = url.searchParams.get("id");
  const signId = signRaw && UUID_RE.test(signRaw) ? signRaw : null;
  if (signId) {
    const { data: m, error: mErr } = await supabase
      .from("materials").select("storage_path, video_id").eq("id", signId).maybeSingle();
    if (mErr) return serverError(mErr);
    if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // 綁定單元的講義：該單元須已發布，避免用未公開單元的 UUID 提前取得下載連結
    if (m.video_id) {
      const { data: v } = await supabase.from("videos").select("published").eq("id", m.video_id).maybeSingle();
      if (!v || !v.published) return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300);
    if (sErr || !signed?.signedUrl) return NextResponse.json({ error: "sign_failed" }, { status: 500 });
    return NextResponse.json({ url: signed.signedUrl });
  }

  // 清單模式：只回 metadata、不簽 URL（下載時才逐一即時簽，也順帶消除逐筆簽章的 N+1）。
  // video_id 需為合法 UUID 才採用（避免注入 PostgREST or() 過濾）
  const raw = url.searchParams.get("video_id");
  const videoId = raw && UUID_RE.test(raw) ? raw : null;

  // 該單元講義（若有 videoId）＋ 全課程通用講義（video_id IS NULL）
  let q = supabase
    .from("materials")
    .select("id, video_id, kind, title, file_size, sort_order")
    .order("sort_order", { ascending: true });
  q = videoId ? q.or(`video_id.eq.${videoId},video_id.is.null`) : q.is("video_id", null);
  const { data, error } = await q;
  if (error) return serverError(error);

  const materials = (data || []).map((m) => ({ id: m.id, title: m.title, file_size: m.file_size, video_id: m.video_id, kind: m.kind }));
  return NextResponse.json({ materials });
}

import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getProjectRef(url) {
  return url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ref = getProjectRef(SB_URL);
  if (!ref || !SB_SVC) return NextResponse.json({ error: "missing config" }, { status: 500 });

  // Try Supabase Management API with service role key
  // (works if this project is on the same Supabase account as the PAT)
  const MGMT_URL = `https://api.supabase.com/v1/projects/${ref}/database/query`;

  const migration = `
ALTER TABLE videos ADD COLUMN IF NOT EXISTS bunny_video_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS assignment_desc TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS assignment_due DATE;
CREATE OR REPLACE FUNCTION admin_save_video(
  p_id uuid DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_vimeo_id text DEFAULT NULL,
  p_bunny_video_id text DEFAULT NULL,
  p_duration text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_published boolean DEFAULT NULL,
  p_assignment_desc text DEFAULT NULL,
  p_assignment_due date DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result json;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO videos (chapter_id,title,vimeo_id,bunny_video_id,duration,sort_order,published,assignment_desc,assignment_due)
    VALUES (p_chapter_id,p_title,NULLIF(p_vimeo_id,''),NULLIF(p_bunny_video_id,''),NULLIF(p_duration,''),COALESCE(p_sort_order,0),COALESCE(p_published,false),NULLIF(p_assignment_desc,''),p_assignment_due)
    RETURNING row_to_json(videos.*) INTO result;
  ELSE
    UPDATE videos SET
      chapter_id=COALESCE(p_chapter_id,chapter_id), title=COALESCE(p_title,title),
      vimeo_id=NULLIF(p_vimeo_id,''), bunny_video_id=NULLIF(p_bunny_video_id,''),
      duration=NULLIF(p_duration,''), sort_order=COALESCE(p_sort_order,sort_order),
      published=COALESCE(p_published,published), assignment_desc=NULLIF(p_assignment_desc,''),
      assignment_due=p_assignment_due
    WHERE id=p_id RETURNING row_to_json(videos.*) INTO result;
  END IF;
  RETURN result;
END;
$$;
SELECT pg_notify('pgrst', 'reload schema');`;

  // Try with service role key (works if project is on same Supabase account)
  const svcRes = await fetch(MGMT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB_SVC}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: migration }),
  });
  const svcJson = await svcRes.json().catch(() => ({}));

  if (svcRes.ok) {
    return NextResponse.json({ ok: true, method: "management_api_svc", result: svcJson });
  }

  console.error("[run-migration] management API failed", svcJson);
  return NextResponse.json({
    ok: false,
    method: "management_api_failed",
    error: svcJson,
  });
}

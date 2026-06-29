import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

const KEYS = ["privacy", "terms"];

// 站內可編輯內容（隱私權政策/服務條款）。GET 回所有；PATCH { key, body_md } 寫單筆。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: {} });
  const { data, error } = await supabase.from("site_content").select("key, body_md, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const map = {};
  for (const r of data || []) map[r.key] = r.body_md;
  return NextResponse.json({ ok: true, data: map });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { key, body_md } = await req.json().catch(() => ({}));
  if (!KEYS.includes(key)) return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  if (typeof body_md !== "string") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { error } = await supabase.from("site_content")
    .upsert({ key, body_md, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, { actor: payload.email, action: "site_content.update", targetType: "site_content", targetId: key, meta: { length: body_md.length }, req });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sanitizeTrackingConfig } from "@/lib/tracking";
import { logAudit } from "@/lib/audit";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("tracking_settings").select("config").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data?.config || {} });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const r = sanitizeTrackingConfig(body.config || body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const { data, error } = await sb.from("tracking_settings")
    .upsert({ id: "default", config: r.config, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("config").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("tracking-settings");
  await logAudit(sb, { actor: payload.email, action: "tracking_settings.update", targetType: "tracking_settings", targetId: "default", meta: r.config, req });
  return NextResponse.json({ data: data.config });
}

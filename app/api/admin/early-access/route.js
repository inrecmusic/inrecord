import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

// 後台學員名單「觀看權限」覆寫：null=依購買時間自動｜'early'=強制早鳥搶先看｜'standard'=強制 9/30 開放。
// 寫在 enrollments.early_override（該 email 的所有開通列一起改）。
export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  const override = body.override ?? null;
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });
  if (override !== null && override !== "early" && override !== "standard") {
    return NextResponse.json({ error: "bad_override" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("enrollments")
    .update({ early_override: override })
    .ilike("email", email) // 等值比對（無萬用字元），容忍大小寫差異
    .select("id");
  if (error) return serverError(error);
  if (!data?.length) return NextResponse.json({ error: "no_enrollment" }, { status: 404 });

  await logAudit(supabase, {
    actor: payload.email, action: "student.early_override", targetType: "enrollment",
    targetId: email, meta: { override, rows: data.length }, req,
  });
  return NextResponse.json({ ok: true, rows: data.length });
}

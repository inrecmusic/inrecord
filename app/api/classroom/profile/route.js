import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { validateProfile, mergePrefill } from "@/lib/student-profile";

export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  const { data: profile, error: profileError } = await supabase
    .from("student_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  // 預填候選：最近一筆已付款訂單的 buyer_name/phone
  const { data: order, error: orderError } = await supabase
    .from("orders").select("buyer_name, phone")
    .eq("email", user.email).eq("status", "paid")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  return NextResponse.json({ profile: profile || null, prefill: mergePrefill(profile, order) });
}

export async function PATCH(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  const body = await req.json().catch(() => ({}));
  const v = validateProfile(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("student_profiles").select("consent_at").eq("user_id", user.id).maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  const consent_at = existing?.consent_at || now;

  const { error } = await supabase.from("student_profiles").upsert(
    { user_id: user.id, email: user.email, ...v.value, consent_at, updated_at: now },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

export async function PATCH(req, { params }) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = params;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const v = body?.fan_review;
  if (v !== "approved" && v !== "rejected")
    return NextResponse.json({ ok: false, error: "bad_value" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase)
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { error } = await supabase
    .from("orders")
    .update({ fan_review: v })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

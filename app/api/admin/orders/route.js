import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [] });

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

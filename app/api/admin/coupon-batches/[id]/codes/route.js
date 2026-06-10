import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// GET：取得某批次所有序號（含 used 狀態），供畫面顯示 / 複製 / CSV
export async function GET(req, { params }) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, used, type, value")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data || [] });
}

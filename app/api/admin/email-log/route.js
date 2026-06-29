import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// 後台「寄信紀錄」：所有對外寄信的統一紀錄（最新在前，預設 100、上限 500）。可選 to / kind 篩選。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [] });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);
  const to = (searchParams.get("to") || "").trim().toLowerCase();

  let q = supabase.from("email_log")
    .select("id, to_email, subject, kind, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (to) q = q.ilike("to_email", `%${to}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data || [] });
}

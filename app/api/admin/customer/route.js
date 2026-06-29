import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// 顧客 360：輸入 email，一次彙整該顧客的 訂單 / 課程開通 / 遊戲存取 / 寄信紀錄。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, orders: [], enrollments: [], subscriptions: [], emails: [] });

  const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  const [ord, enr, sub, mail] = await Promise.all([
    supabase.from("orders").select("id, plan, plan_label, amount, status, source, mer_trade_no, invoice_no, created_at, access_granted_at, presale_email_sent_at, phone, buyer_name").ilike("email", email).order("created_at", { ascending: false }),
    supabase.from("enrollments").select("course_id, enrolled_at, order_id").ilike("email", email),
    supabase.from("subscriptions").select("plan_type, status, expires_at, source, created_at").ilike("email", email).order("created_at", { ascending: false }),
    supabase.from("email_log").select("subject, kind, status, error, created_at").ilike("to_email", email).order("created_at", { ascending: false }).limit(50),
  ]);

  return NextResponse.json({
    ok: true,
    email,
    orders: ord.data || [],
    enrollments: enr.data || [],
    subscriptions: sub.data || [],
    emails: mail.data || [],
  });
}

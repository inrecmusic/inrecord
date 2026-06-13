import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sendPurchaseEmail } from "@/lib/brevo-email";

// 後台補寄開課確認信（比照 issue-invoice 結構）
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, email, plan, plan_label, mer_trade_no")
    .eq("id", id)
    .single();
  if (error || !order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (!order.email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  const result = await sendPurchaseEmail({
    email:      order.email,
    plan:       order.plan,
    planLabel:  order.plan_label,
    merTradeNo: order.mer_trade_no,
  });

  if (!result.success) {
    await supabase.from("orders").update({ email_error: result.error || "send_failed" }).eq("id", order.id);
    return NextResponse.json({ error: result.error || "send_failed", skipped: result.skipped || false }, { status: 500 });
  }
  await supabase.from("orders").update({ email_error: null }).eq("id", order.id);
  return NextResponse.json({ ok: true });
}

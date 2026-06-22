import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { getSaleSettings, isPresale } from "@/lib/sale";

// 後台手動批次寄「預購成功」信給 WordPress 付款名單。
// Body { ids?: string[] }：給 ids 只寄這些；不給則對「全部未寄」。已寄者(presale_email_sent_at 非空)自動跳過。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { ids } = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  let query = supabase
    .from("orders")
    .select("id, email, plan, plan_label, mer_trade_no")
    .eq("source", "wordpress")
    .is("presale_email_sent_at", null);
  if (Array.isArray(ids) && ids.length) query = query.in("id", ids);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // presale 文案旗標依目前 sale_settings 決定（與 notify 一致）
  const saleSettings = await getSaleSettings();
  const presale = isPresale(saleSettings, new Date());

  let sent = 0, failed = 0;
  const errors = [];
  for (const order of orders || []) {
    if (!order.email) { failed++; errors.push(`${order.id}: missing_email`); continue; }
    const result = await sendPurchaseEmail({
      email:      order.email,
      plan:       order.plan,
      planLabel:  order.plan_label,
      merTradeNo: order.mer_trade_no,
      presale,
    });
    if (result.success) {
      await supabase.from("orders")
        .update({ presale_email_sent_at: new Date().toISOString(), email_error: null })
        .eq("id", order.id);
      sent++;
    } else if (result.skipped) {
      failed++; errors.push(`${order.id}: ${result.error || "skipped"}`);
    } else {
      await supabase.from("orders").update({ email_error: result.error || "send_failed" }).eq("id", order.id);
      failed++; errors.push(`${order.id}: ${result.error || "send_failed"}`);
    }
  }

  return NextResponse.json({ ok: true, sent, failed, errors });
}

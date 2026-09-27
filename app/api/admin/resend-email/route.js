import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { getSaleSettings, isPresale, purchasePhaseLabel } from "@/lib/sale";
import { effectiveEmail } from "@/lib/refund-guard";
import { logAudit } from "@/lib/audit";

// 後台補寄開課確認信（比照 issue-invoice 結構）
// ⚠️ 收件人用 effectiveEmail（grant_email ?? email）：買家可在付款成功頁指定「要開通到哪個信箱」，
// 課程權限就開在那裡（grantAccess 同一個函式）。開課通知要寄給實際上課的人，
// 寄到下單信箱的話，被指定的那個人永遠不會知道自己有課（買來送人的情境會直接踩到）。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, email, grant_email, plan, plan_label, mer_trade_no, amount, created_at, coupon_code")
    .eq("id", id)
    .single();
  if (error || !order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  const to = effectiveEmail(order);
  if (!to) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  // 依目前 sale_settings 決定「預購成功」vs「課程已開通」文案（與 notify／send-presale-email 一致）；
  // 否則預購期補寄會誤寄「課程已開通」，但教室其實還鎖著。
  const saleSettings = await getSaleSettings();
  const presale = isPresale(saleSettings, new Date());
  const result = await sendPurchaseEmail({
    email:      to,
    plan:       order.plan,
    planLabel:  order.plan_label,
    merTradeNo: order.mer_trade_no,
    amount:     order.amount,
    phaseLabel: purchasePhaseLabel({ couponCode: order.coupon_code, createdAt: order.created_at, settings: saleSettings }),
    presale,
  });

  if (!result.success) {
    await supabase.from("orders").update({ email_error: result.error || "send_failed" }).eq("id", order.id);
    return NextResponse.json({ error: result.error || "send_failed", skipped: result.skipped || false }, { status: 500 });
  }
  await supabase.from("orders").update({ email_error: null }).eq("id", order.id);
  // 寄信涉及顧客個資與履約通知，留稽核（比照 send-presale-email）
  // 稽核記實際寄達的信箱；與下單信箱不同時兩個都留，事後查得出寄給了誰
  await logAudit(supabase, { actor: payload.email, action: "email.resend_purchase", targetType: "order", targetId: order.id,
    meta: to === order.email ? { email: to } : { email: to, orderEmail: order.email }, req });
  return NextResponse.json({ ok: true, sentTo: to });
}

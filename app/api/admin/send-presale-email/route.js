import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { fetchPendingLeads } from "@/lib/admin-leads";
import { logAudit } from "@/lib/audit";

// 後台手動批次寄「預購成功」信給付款名單（WooCommerce + concert-shop）。
// Body { ids?: string[] }：給 ids 只寄這些；不給則對「全部未寄」。已寄者(presale_email_sent_at 非空)自動跳過。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { ids } = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: orders, error } = await fetchPendingLeads(supabase, {
    columns: "id, email, plan, plan_label, mer_trade_no",
    flagColumn: "presale_email_sent_at",
    ids,
  });
  if (error) return serverError(error);

  // presale 文案旗標依目前 sale_settings 決定（與 notify 一致）
  const saleSettings = await getSaleSettings();
  const presale = isPresale(saleSettings, new Date());

  let sent = 0, failed = 0, skipped = 0;
  const errors = [];
  for (const order of orders || []) {
    if (!order.email) { failed++; errors.push(`${order.id}: missing_email`); continue; }

    // 先原子 claim 再寄（同 issue-invoice）：把 presale_email_sent_at NULL→now，只有搶到的請求才寄。
    // 先寄後標記的話，管理員雙擊／前端逾時重試會讓同一位顧客收到兩封預購信。
    const { data: claimed, error: claimErr } = await supabase
      .from("orders")
      .update({ presale_email_sent_at: new Date().toISOString(), email_error: null })
      .eq("id", order.id)
      .is("presale_email_sent_at", null)
      .select("id")
      .maybeSingle();
    // claim 失敗（DB 逾時／連線斷）要算失敗，不能跟「別人搶走」混為一談：
    // 混在一起會讓 DB 異常顯示成「已跳過」，管理員以為信寄過了，實際上一封都沒寄。
    if (claimErr) { failed++; errors.push(`${order.id}: claim_failed`); continue; }
    if (!claimed) { skipped++; continue; } // 另一個請求已搶走（或剛寄完）

    const result = await sendPurchaseEmail({
      email:      order.email,
      plan:       order.plan,
      planLabel:  order.plan_label,
      merTradeNo: order.mer_trade_no,
      presale,
    });
    if (result.success) {
      sent++;
    } else {
      // 寄失敗把旗標清回 null，讓下次批次可再寄（維持「至少寄達一次」）；
      // result.skipped（缺 Brevo 設定）沿用舊行為不寫 email_error。
      const patch = { presale_email_sent_at: null };
      if (!result.skipped) patch.email_error = result.error || "send_failed";
      await supabase.from("orders").update(patch).eq("id", order.id);
      failed++; errors.push(`${order.id}: ${result.error || (result.skipped ? "skipped" : "send_failed")}`);
    }
  }

  await logAudit(supabase, { actor: payload.email, action: "presale_email.send", targetType: "orders", meta: { sent, failed, skipped, errors: errors.length }, req });
  return NextResponse.json({ ok: true, sent, failed, skipped, errors });
}

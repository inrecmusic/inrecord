import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantAccess } from "@/lib/fulfillment-grant";
import { pickUngrantedPayuni } from "@/lib/order-enrolled";
import { selectAll } from "@/lib/supabase-paginate";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { getSaleSettings, isPresale, purchasePhaseLabel } from "@/lib/sale";
import { effectiveEmail } from "@/lib/refund-guard";
import { logAudit } from "@/lib/audit";

// 後台手動開通官網(payuni)已付款訂單。body { ids?: string[], sendEmail?: boolean }：
//   給 ids → 只開通這些（仍過濾成 payuni+paid+未開通）；不給 → 全部未開通官網訂單。
//   sendEmail:true → 開通成功後一併寄通知信（開課後＝「課程已開通」、預購期＝「預購成功」，
//   文案依 sale_settings 自動判斷）。收件人用 effectiveEmail：買家若指定過開通信箱，
//   課程開在那裡，通知就該寄給實際上課的人。
// 現有 /api/admin/grant-access 硬篩 source∈{wordpress,concert}，官網單撈不到，故另立此端點。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : null;

  const supabase = getSupabaseAdmin();

  try {
    // 撈候選官網已付款訂單（給 ids 就限縮）。用 selectAll 分頁，避免 >1000 筆時「全部開通」被 PostgREST 預設上限靜默截斷而漏開。
    // ids===null（body 沒帶 ids）→ 全部；ids 為陣列（含空陣列 []）→ 用 .in 限縮，[] 撈 0 筆＝no-op（避免誤開全部）。
    const orders = await selectAll(supabase, "orders", (q) => {
      // mer_trade_no／amount／coupon_code／created_at 是通知信要印的（訂單編號、金額、購買階段文案）
      const base = q.select("id, email, grant_email, plan, plan_label, source, status, mer_trade_no, amount, coupon_code, created_at")
        .eq("source", "payuni").eq("status", "paid");
      return ids ? base.in("id", ids) : base;
    });

    // 撈已開通 email → 篩出真正未開通者（分頁避免 >1000 列 truncate）
    const enr = await selectAll(supabase, "enrollments", (q) => q.select("email").eq("course_id", "piano-101"));
    const pending = pickUngrantedPayuni(orders || [], enr.map((e) => e.email));

    const sendEmail = body.sendEmail === true;
    // 文案旗標一次算好（與 notify／resend-email 同一套判斷），不要每封都重打 sale_settings
    const saleSettings = sendEmail ? await getSaleSettings() : null;
    const presale = sendEmail ? isPresale(saleSettings, new Date()) : false;

    const now = new Date().toISOString();
    let granted = 0, failed = 0, mailed = 0, mailFailed = 0;
    const errors = [];
    for (const o of pending) {
      const g = await grantAccess(supabase, o);
      if (!g.ok) {
        failed++;
        errors.push(`${o.email}: ${g.errors.join("; ")}`);
        continue;   // 沒開通成功就不寄「課程已開通」，否則學員收到信卻進不了教室
      }
      granted++;
      await supabase.from("orders").update({ access_granted_at: now }).eq("id", o.id);
      if (!sendEmail) continue;

      const to = effectiveEmail(o);
      const r = to
        ? await sendPurchaseEmail({
            email: to, plan: o.plan, planLabel: o.plan_label, merTradeNo: o.mer_trade_no,
            amount: o.amount, presale,
            phaseLabel: purchasePhaseLabel({ couponCode: o.coupon_code, createdAt: o.created_at, settings: saleSettings }),
          }).catch((e) => ({ success: false, error: e?.message || "send_threw" }))
        : { success: false, error: "missing_email" };
      if (r.success) {
        mailed++;
        await supabase.from("orders").update({ email_error: null }).eq("id", o.id);
      } else {
        // 寄信失敗不影響「已開通」這個事實，只記錄下來讓告警面板可補寄
        mailFailed++;
        errors.push(`${to || o.email}: 開通成功但寄信失敗（${r.error || "send_failed"}）`);
        await supabase.from("orders").update({ email_error: r.error || "send_failed" }).eq("id", o.id);
      }
    }

    await logAudit(supabase, {
      actor: payload.email, action: "grant_orders",
      targetType: "orders", targetId: ids ? ids.join(",") : "all_pending",
      meta: { granted, failed, mailed, mailFailed, sendEmail }, req,
    });

    return NextResponse.json({ ok: true, granted, failed, mailed, mailFailed, errors });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

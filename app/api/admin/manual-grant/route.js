import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { grantAccess } from "@/lib/fulfillment-grant";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { normalizeManualGrantInput, buildManualOrder } from "@/lib/manual-grant";

const COURSE_ID = "piano-101"; // 單一課程架構

// 後台「手動開通課程」：直接輸入 Email(+電話/姓名/方案) 開通線上課程，不依賴 webhook 名單。
// 建一筆 source='manual' 訂單作稽核 → grantAccess 建 enrollments(+bundle 加 subscriptions) →
// 可選寄開課/預購通知信。已開通(該 email 已有 enrollment)則不重複建單。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const norm = normalizeManualGrantInput(body);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });
  const { email, plan, phone, name, sendEmail } = norm.value;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // 防重：已有 piano-101 enrollment 就不重複建單（grantAccess 本身冪等，但避免重複稽核訂單）
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("email", email)
    .eq("course_id", COURSE_ID)
    .maybeSingle();
  const alreadyGranted = !!existing;

  let orderId = null;
  let planLabel = plan === "bundle" ? "課程包" : "課程";
  let merTradeNo = "MANUAL";

  if (!alreadyGranted) {
    const orderPayload = buildManualOrder({ email, plan, phone, name, now: new Date() });
    planLabel = orderPayload.plan_label;
    merTradeNo = orderPayload.mer_trade_no;

    const { data: order, error: insErr } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single();
    if (insErr) {
      return NextResponse.json({ error: "order_insert_failed", detail: insErr.message }, { status: 500 });
    }
    orderId = order.id;

    const res = await grantAccess(supabase, { id: orderId, email, plan });
    if (!res.ok) {
      return NextResponse.json({ error: "grant_failed", detail: res.errors.join("; ") }, { status: 500 });
    }
  }

  // 寄開課/預購通知信（presale 比照 notify：依 sale_settings 計算）
  let emailSent = false;
  let emailError = null;
  if (sendEmail) {
    try {
      const saleSettings = await getSaleSettings();
      const r = await sendPurchaseEmail({
        email,
        plan,
        planLabel,
        merTradeNo,
        presale: isPresale(saleSettings, new Date()),
      });
      emailSent = !!r.success;
      if (!r.success) emailError = r.error || "send_failed";
    } catch (e) {
      emailError = e.message || "send_failed";
    }
    if (!emailSent && orderId) {
      await supabase.from("orders").update({ email_error: emailError }).eq("id", orderId);
    }
  }

  return NextResponse.json({ ok: true, granted: !alreadyGranted, alreadyGranted, emailSent, emailError });
}

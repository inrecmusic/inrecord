import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { grantAccess } from "@/lib/fulfillment-grant";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { normalizeManualGrantInput, buildManualOrder } from "@/lib/manual-grant";
import { logAudit } from "@/lib/audit";

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
  const { email, plan, phone, name, grant, sendEmail } = norm.value;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  let orderId = null;
  let alreadyGranted = false;
  // 信件用的方案名稱／參考號：開通時用訂單值；只寄信時用通用名 + 預購參考號
  let planLabel = plan === "bundle" ? "課程包" : "課程";
  let merTradeNo = "PRE-" + Date.now();

  // 開通課程存取（建立 enrollment / bundle 加 subscriptions）
  if (grant) {
    // 防重：已有 piano-101 enrollment 就不重複建單（grantAccess 本身冪等，但避免重複稽核訂單）
    const { data: existing } = await supabase
      .from("enrollments")
      .select("id")
      .eq("email", email)
      .eq("course_id", COURSE_ID)
      .maybeSingle();
    alreadyGranted = !!existing;

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
  }

  // 只寄信、沒有建開通訂單時（grant=false，或 grant 但已開通）：建一筆 status='notified'
  // 的 manual 紀錄單，好讓「這次寄信」可事後查證（成功/失敗都會落在這筆上）。
  if (sendEmail && !orderId) {
    const recPayload = buildManualOrder({ email, plan, phone, name, now: new Date(), granted: false });
    planLabel = recPayload.plan_label;
    merTradeNo = recPayload.mer_trade_no;
    const { data: rec, error: recErr } = await supabase
      .from("orders")
      .insert(recPayload)
      .select("id")
      .single();
    if (!recErr && rec) orderId = rec.id;
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
    // 有建訂單時，把寄信結果落到訂單上（成功記 presale_email_sent_at、失敗記 email_error）
    if (orderId) {
      await supabase.from("orders").update(
        emailSent
          ? { presale_email_sent_at: new Date().toISOString(), email_error: null }
          : { email_error: emailError }
      ).eq("id", orderId);
    }
  }

  await logAudit(supabase, { actor: payload.email, action: "course.manual_grant", targetType: "email", targetId: email, meta: { plan, grant, sendEmail, granted: grant && !alreadyGranted, alreadyGranted, emailSent }, req });

  // 寫進 log，寄信成敗永遠可在 Vercel runtime logs 查到
  console.log("[manual-grant]", JSON.stringify({
    email, plan, grant, sendEmail,
    granted: grant && !alreadyGranted, alreadyGranted,
    orderId, emailSent, emailError,
  }));

  return NextResponse.json({
    ok: true,
    granted: grant && !alreadyGranted,
    alreadyGranted,
    emailSent,
    emailError,
    mode: grant ? "grant" : "email_only",
  });
}

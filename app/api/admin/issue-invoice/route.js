import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createInvoice } from "@/lib/amego-invoice";
import { isValidTaxId, isValidMobileBarcode } from "@/lib/invoice-fields";
import { logAudit } from "@/lib/audit";

// 後台手動開立發票（呼叫同一個 createInvoice 函數）
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, email, plan_label, amount, buyer_name, buyer_tax_id, carrier_type, carrier_id, invoice_no")
    .eq("id", id)
    .single();

  if (error || !order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.invoice_no) return NextResponse.json({ error: "already_issued", invoiceNo: order.invoice_no }, { status: 400 });
  if (order.status !== "paid") return NextResponse.json({ error: "order_not_paid" }, { status: 400 });
  if (order.buyer_tax_id && !isValidTaxId(order.buyer_tax_id)) {
    return NextResponse.json({ error: "invalid_tax_id" }, { status: 400 });
  }
  if (order.carrier_id && !isValidMobileBarcode(order.carrier_id)) {
    return NextResponse.json({ error: "invalid_carrier_id" }, { status: 400 });
  }

  // 原子 claim 防與 notify 自動開票／管理員雙擊並發重複開票（與 notify 共用 invoice_claimed_at）：
  // 只有把 invoice_claimed_at NULL→now 搶到的請求才呼叫 Amego，其餘回 409。
  const { data: invClaim } = await supabase
    .from("orders")
    .update({ invoice_claimed_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("invoice_no", null)
    .is("invoice_claimed_at", null)
    .select("id")
    .maybeSingle();
  if (!invClaim) return NextResponse.json({ error: "invoice_in_progress" }, { status: 409 });

  const result = await createInvoice({
    orderId: order.id,
    buyerName: order.buyer_name || "學員",
    buyerEmail: order.email,
    buyerTaxId: order.buyer_tax_id || null,
    amount: order.amount,
    productName: order.plan_label || "從零開始學鋼琴",
    carrierType: order.carrier_type || "",
    carrierId: order.carrier_id || "",
    trackApiCode: process.env.AMEGO_TRACK_API_CODE || "",
  });

  if (!result.success) {
    // 失敗清 claim，讓後續重試（notify 或後台）可再搶（保留「開票失敗可重試」語意）
    await supabase.from("orders").update({ invoice_claimed_at: null }).eq("id", order.id);
    return NextResponse.json({ error: result.error || "issue_failed", code: result.code }, { status: 500 });
  }

  await supabase.from("orders").update({ invoice_no: result.invoiceNo, invoice_error: null }).eq("id", order.id);
  await logAudit(supabase, { actor: payload.email, action: "invoice.issue", targetType: "order", targetId: order.id, meta: { invoiceNo: result.invoiceNo, amount: order.amount }, req });
  return NextResponse.json({ ok: true, invoiceNo: result.invoiceNo });
}

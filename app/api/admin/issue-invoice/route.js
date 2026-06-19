import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createInvoice } from "@/lib/amego-invoice";

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
    .select("id, email, plan_label, amount, buyer_name, buyer_tax_id, carrier_type, carrier_id, invoice_no")
    .eq("id", id)
    .single();

  if (error || !order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.invoice_no) return NextResponse.json({ error: "already_issued", invoiceNo: order.invoice_no }, { status: 400 });

  const result = await createInvoice({
    orderId: order.id,
    buyerName: order.buyer_name || "學員",
    buyerEmail: order.email,
    buyerTaxId: order.buyer_tax_id || null,
    amount: order.amount,
    productName: order.plan_label || "零基礎流行鋼琴入門課",
    carrierType: order.carrier_type || "",
    carrierId: order.carrier_id || "",
    trackApiCode: process.env.AMEGO_TRACK_API_CODE || "",
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "issue_failed", code: result.code }, { status: 500 });
  }

  await supabase.from("orders").update({ invoice_no: result.invoiceNo, invoice_error: null }).eq("id", order.id);
  return NextResponse.json({ ok: true, invoiceNo: result.invoiceNo });
}

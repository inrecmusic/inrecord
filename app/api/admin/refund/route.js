import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { payuniTrade } from "@/lib/payuni";

// 後台申請退款：呼叫 PAYUNi trade/close（CloseType=2 退款），成功後標記訂單並撤銷存取
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, email, plan, status, payuni_trade_no")
    .eq("id", id)
    .single();

  if (error || !order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.status === "refunded") return NextResponse.json({ error: "already_refunded" }, { status: 400 });
  if (order.status !== "paid")     return NextResponse.json({ error: "not_paid" }, { status: 400 });
  if (!order.payuni_trade_no)      return NextResponse.json({ error: "missing_trade_no" }, { status: 400 });

  // 呼叫 PAYUNi 退款（CloseType=2）
  const result = await payuniTrade("trade/close", {
    TradeNo:   order.payuni_trade_no,
    CloseType: "2",
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.data?.Message || result.data?.error || "refund_failed", detail: result.data },
      { status: 502 }
    );
  }

  // 標記訂單已退款
  await supabase
    .from("orders")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", order.id);

  // 撤銷存取：取消遊戲存取訂閱 + 移除課程開通
  if (order.plan === "game" || order.plan === "bundle") {
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("payuni_order_id", order.id);
  }
  if (order.plan === "course" || order.plan === "bundle") {
    await supabase.from("enrollments").delete().eq("order_id", order.id);
  }

  return NextResponse.json({ ok: true });
}

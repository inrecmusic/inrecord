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

  // 自動判斷：先嘗試「請退款」(trade/close CloseType=2)；
  // 若該筆尚未請款（仍為授權狀態，close 會失敗），改用「取消授權」(trade/cancel)。
  let result = await payuniTrade("trade/close", {
    TradeNo:   order.payuni_trade_no,
    CloseType: "2",
  });
  let method = "refund"; // 請退款

  if (!result.success) {
    const cancel = await payuniTrade("trade/cancel", { TradeNo: order.payuni_trade_no });
    if (cancel.success) {
      result = cancel;
      method = "cancel"; // 取消授權
    } else {
      return NextResponse.json(
        {
          error: "refund_failed",
          close_detail:  result.data?.Message || result.data?.error || result.data,
          cancel_detail: cancel.data?.Message || cancel.data?.error || cancel.data,
        },
        { status: 502 }
      );
    }
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

  return NextResponse.json({ ok: true, method });
}

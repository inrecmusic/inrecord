import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { payuniTrade } from "@/lib/payuni";
import { logAudit } from "@/lib/audit";

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

  if (error || !order) return NextResponse.json({ error: "order_not_found", detail: "找不到此訂單" }, { status: 404 });
  if (order.status === "refunded") return NextResponse.json({ error: "already_refunded", detail: "此訂單已退款，請勿重複操作" }, { status: 400 });
  if (order.status !== "paid")     return NextResponse.json({ error: "not_paid", detail: `訂單狀態為「${order.status}」，僅「已付款」訂單可退款` }, { status: 400 });
  if (!order.payuni_trade_no)      return NextResponse.json({ error: "missing_trade_no", detail: "此訂單沒有 PAYUNi 交易序號（可能非線上付款或付款未完成），無法線上退款" }, { status: 400 });

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
      const closeMsg  = result.message || result.status || "close_error";
      const cancelMsg = cancel.message || cancel.status || "cancel_error";
      // 落地完整 PAYUNi 回應供診斷（解密後內層 data 一併記錄）
      console.error("[admin refund] PAYUNi 退款/取消皆失敗", {
        orderId: order.id, tradeNo: order.payuni_trade_no,
        closeStatus: result.status, closeMsg, closeData: result.data,
        cancelStatus: cancel.status, cancelMsg, cancelData: cancel.data,
      });
      return NextResponse.json(
        {
          error: "refund_failed",
          detail: `PAYUNi 退款失敗：${closeMsg}；取消授權失敗：${cancelMsg}`,
          close_detail:  result.data?.Message || result.message || result.data,
          cancel_detail: cancel.data?.Message || cancel.message || cancel.data,
        },
        { status: 502 }
      );
    }
  }

  // 退款已成功 → 標記訂單 + 撤銷存取。逐項檢查 error：撤銷失敗不可靜默吞錯，
  // 否則會變成「已退款但存取權還在」。退款本身已成功，故不回 5xx，而是回報需人工補撤的項目。
  const revokeFailed = [];
  const { error: stErr } = await supabase
    .from("orders")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", order.id);
  if (stErr) revokeFailed.push(`order_status: ${stErr.message}`);

  if (order.plan === "game" || order.plan === "bundle") {
    const { error: subErr } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("payuni_order_id", order.id);
    if (subErr) revokeFailed.push(`subscriptions: ${subErr.message}`);
  }
  if (order.plan === "course" || order.plan === "bundle") {
    const { error: enErr } = await supabase.from("enrollments").delete().eq("order_id", order.id);
    if (enErr) revokeFailed.push(`enrollments: ${enErr.message}`);
  }

  await logAudit(supabase, { actor: payload.email, action: "order.refund", targetType: "order", targetId: order.id, meta: { email: order.email, plan: order.plan, method, revokeFailed: revokeFailed.length ? revokeFailed : undefined }, req });

  if (revokeFailed.length) {
    console.error("[admin refund] 退款成功但撤銷存取失敗", { orderId: order.id, revokeFailed });
    return NextResponse.json({
      ok: true, method, refunded: true, revokeFailed,
      detail: "PAYUNi 退款已成功，但撤銷課程/遊戲存取時發生錯誤，請手動確認並撤銷存取。",
    });
  }

  return NextResponse.json({ ok: true, method });
}

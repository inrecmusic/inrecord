import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { payuniTrade } from "@/lib/payuni";
import { logAudit } from "@/lib/audit";
import { effectiveEmail, hasOtherPaidCourseAccess } from "@/lib/refund-guard";

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
    .select("id, email, grant_email, plan, status, payuni_trade_no")
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
      // 常見情境：信用卡「當日交易尚未結算(撥款)」→ 請退款無可退金額、取消授權也查無請款。
      // 這不是系統錯誤，是金流結算時序：需隔日結算後才能線上退，或走 PAYUNi 商店後台。
      const notSettled = /未有請退款金額|尚未請款|未請款|無.*請款金額/.test(closeMsg)
        || /查無符合請款|查無請款|查無.*請款/.test(cancelMsg);
      const friendly = notSettled
        ? "此筆為近期交易、銀行尚未完成結算，暫時無法線上退款。請於隔日（結算後）再操作一次退款；若需立即退款，可至 PAYUNi 商店後台直接處理。"
        : "PAYUNi 退款未成功。可稍後再試，或至 PAYUNi 商店後台直接退款；仍有問題請聯繫 PAYUNi 客服。";
      return NextResponse.json(
        {
          error: "refund_failed",
          reason: notSettled ? "not_settled" : "gateway_error",
          detail: friendly,
          gateway_detail: `PAYUNi 回應：${closeMsg}／${cancelMsg}`, // 技術細節附註，供進階排查
        },
        { status: 502 }
      );
    }
  }

  // 退款已成功 → 標記訂單 + 撤銷存取。逐項檢查 error：撤銷失敗不可靜默吞錯，
  // 否則會變成「已退款但存取權還在」。退款本身已成功，故不回 5xx，而是回報需人工補撤的項目。
  const revokeFailed = [];
  let enrollmentKept = false; // 該 email 尚有其他有效訂單時保留課程存取，不撤 enrollment
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
    // enrollments 用 upsert(onConflict: email,course_id) 寫入：同 email 多筆訂單只會有一列、
    // order_id 會被最新一筆覆蓋，故不能靠 order_id 判斷／刪除。改為：先查該 email 名下是否還有
    // 其他有效訂單（其他 paid 的 course/bundle），有則保留存取；沒有才用真正的 key（email+course_id）撤。
    const email = effectiveEmail(order); // 與 grantAccess 開通時一致
    const { data: paidOrders, error: othersErr } = await supabase
      .from("orders")
      .select("id, email, grant_email")
      .eq("status", "paid")
      .in("plan", ["course", "bundle"]);
    if (othersErr) {
      revokeFailed.push(`enrollments_check: ${othersErr.message}`);
    } else if (hasOtherPaidCourseAccess(order, paidOrders)) {
      enrollmentKept = true;
    } else {
      const { error: enErr } = await supabase.from("enrollments").delete().eq("email", email).eq("course_id", "piano-101");
      if (enErr) revokeFailed.push(`enrollments: ${enErr.message}`);
    }
  }

  await logAudit(supabase, { actor: payload.email, action: "order.refund", targetType: "order", targetId: order.id, meta: { email: order.email, plan: order.plan, method, revokeFailed: revokeFailed.length ? revokeFailed : undefined, enrollmentKept: enrollmentKept || undefined }, req });

  if (revokeFailed.length) {
    console.error("[admin refund] 退款成功但撤銷存取失敗", { orderId: order.id, revokeFailed });
    return NextResponse.json({
      ok: true, method, refunded: true, revokeFailed,
      detail: "PAYUNi 退款已成功，但撤銷課程/遊戲存取時發生錯誤，請手動確認並撤銷存取。",
    });
  }

  if (enrollmentKept) {
    return NextResponse.json({
      ok: true, method, enrollmentKept: true,
      detail: "退款成功；因該 email 尚有其他有效訂單，未撤銷課程存取。",
    });
  }

  return NextResponse.json({ ok: true, method });
}

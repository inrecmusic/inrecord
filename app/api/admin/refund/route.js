import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { payuniTrade } from "@/lib/payuni";
import { logAudit } from "@/lib/audit";
import { effectiveEmail, hasOtherPaidCourseAccess } from "@/lib/refund-guard";

// 缺欄位時 PostgREST／Postgres 會回的錯誤碼（schema cache 沒這欄／欄位不存在）。
// supabase-payment-events.sql 尚未執行時，refunded_at／refund_amount 會撞到這兩碼 → 降級只寫 status。
const MISSING_COLUMN = new Set(["PGRST204", "42703"]);

// 後台申請退款：呼叫 PAYUNi trade/close（CloseType=2 退款），成功後標記訂單並撤銷存取
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, manual } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: order, error } = await supabase
    .from("orders")
    // mer_trade_no／pay_type 純為稽核紀錄用：退款後要對帳／查 ATM 匯款資訊時，
    // 光有內部 id 找不回 PAYUNi 那邊的單（見 logAudit 的 meta）。
    .select("id, email, grant_email, plan, status, payuni_trade_no, amount, mer_trade_no, pay_type")
    .eq("id", id)
    .single();

  if (error || !order) return NextResponse.json({ error: "order_not_found", detail: "找不到此訂單" }, { status: 404 });
  if (order.status === "refunded") return NextResponse.json({ error: "already_refunded", detail: "此訂單已退款，請勿重複操作" }, { status: 400 });
  if (order.status !== "paid")     return NextResponse.json({ error: "not_paid", detail: `訂單狀態為「${order.status}」，僅「已付款」訂單可退款` }, { status: 400 });
  if (!manual && !order.payuni_trade_no) return NextResponse.json({ error: "missing_trade_no", detail: "此訂單沒有 PAYUNi 交易序號（可能非線上付款或付款未完成），無法線上退款" }, { status: 400 });

  // manual：已在 PAYUNi 商店後台退完款，這裡只做訂單標記＋撤銷存取，不再呼叫 PAYUNi。
  // 否則先「請退款」(trade/close CloseType=2；TradeAmt 依官方文件為請退款必填，漏送會回 CLOSE02010)；
  // 若該筆尚未請款（仍為授權狀態，close 會失敗），改用「取消授權」(trade/cancel)。
  let method = manual ? "manual" : "refund";
  let result = manual ? { success: true } : await payuniTrade("trade/close", {
    TradeNo:   order.payuni_trade_no,
    CloseType: "2",
    TradeAmt:  String(order.amount),
  });

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
      // 直接回 PAYUNi 原始錯誤碼＋訊息（對照 docs.payuni.com.tw 錯誤代碼表），不再猜測情境。
      // CLOSE01007＝商店退款功能受限（商店層級權限），要找 PAYUNi 開通。
      const hint = result.status === "CLOSE01007"
        ? "商店的 API 退款權限受限，請洽 PAYUNi 客服開通；或先至 PAYUNi 商店後台退款，再回此處按「已在 PAYUNi 退款 → 標記」。"
        : "可至 PAYUNi 商店後台直接退款，再回此處按「已在 PAYUNi 退款 → 標記」。";
      return NextResponse.json(
        { error: "refund_failed", detail: `PAYUNi 拒絕退款：${result.status} ${closeMsg}（取消授權：${cancel.status} ${cancelMsg}）。${hint}` },
        { status: 502 }
      );
    }
  }

  // 退款已成功 → 標記訂單 + 撤銷存取。逐項檢查 error：撤銷失敗不可靜默吞錯，
  // 否則會變成「已退款但存取權還在」。退款本身已成功，故不回 5xx，而是回報需人工補撤的項目。
  const revokeFailed = [];
  let enrollmentKept = false;         // 該 email 尚有其他有效訂單時保留課程存取，不撤 enrollment
  let revokedEnrollment = null;       // 被刪掉的 enrollments 整列快照（進稽核紀錄）
  let revokedSubscriptions;           // 被取消的 subscriptions 筆數

  // 退款時間／金額寫進專屬欄位：updated_at 有 trigger，之後任何操作（補寄信、開發票、開通）
  // 都會蓋掉它，拿它當退款日期對帳會錯。
  const refundedAt = new Date().toISOString();
  let { error: stErr } = await supabase
    .from("orders")
    .update({ status: "refunded", refunded_at: refundedAt, refund_amount: Number.isFinite(Number(order.amount)) ? Number(order.amount) : null, updated_at: refundedAt })
    .eq("id", order.id);
  // 降級：supabase-payment-events.sql 還沒跑（沒有 refunded_at／refund_amount 欄）→ 退回只寫 status，
  // 讓退款照樣完成。絕不可因為少欄位就退不了款。
  if (stErr && MISSING_COLUMN.has(stErr.code)) {
    console.error("[refund] orders 缺 refunded_at／refund_amount 欄，本次只寫 status；請先執行 supabase-payment-events.sql");
    ({ error: stErr } = await supabase
      .from("orders")
      .update({ status: "refunded", updated_at: refundedAt })
      .eq("id", order.id));
  }
  if (stErr) { console.error("[refund] order_status:", stErr.message); revokeFailed.push("order_status"); }

  if (order.plan === "game" || order.plan === "bundle") {
    const { data: subRows, error: subErr } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("payuni_order_id", order.id)
      .select("id");
    if (subErr) { console.error("[refund] subscriptions:", subErr.message); revokeFailed.push("subscriptions"); }
    else revokedSubscriptions = (subRows || []).length;
  }
  if (order.plan === "course" || order.plan === "bundle") {
    // enrollments 用 upsert(onConflict: email,course_id) 寫入：同 email 多筆訂單只會有一列、
    // order_id 會被最新一筆覆蓋，故不能靠 order_id 判斷／刪除。改為：先查該 email 名下是否還有
    // 其他有效訂單（其他 paid 的 course/bundle），有則保留存取；沒有才用真正的 key（email+course_id）撤。
    const email = effectiveEmail(order); // 與 grantAccess 開通時一致
    // 只撈「這個 email 名下」的有效訂單：原本撈全部 paid 單再用 JS 比對，訂單破千後會被
    // PostgREST 預設 1000 列上限靜默截斷 → 誤判成「沒有其他有效訂單」，把該學員還付過錢的課程存取一起撤掉。
    // 不用字串組 .or()（email 帶 , ( ) 會破壞語法），拆成 grant_email / email 兩查詢再合併（同 lib/early-access-server.js）。
    const paidCourse = (q) => q.select("id, email, grant_email").eq("status", "paid").in("plan", ["course", "bundle"]);
    const [byGrant, byEmail] = email
      ? await Promise.all([
          paidCourse(supabase.from("orders")).eq("grant_email", email),
          paidCourse(supabase.from("orders")).eq("email", email).is("grant_email", null),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    const othersErr = byGrant.error || byEmail.error;
    const paidOrders = [...(byGrant.data || []), ...(byEmail.data || [])];
    if (othersErr) {
      console.error("[refund] enrollments_check:", othersErr.message); revokeFailed.push("enrollments_check");
    } else if (hasOtherPaidCourseAccess(order, paidOrders)) {
      enrollmentKept = true;
    } else {
      // 刪除前先留整列快照：enrollments 被 DELETE 後 enrolled_at／early_override 永久消失
      // （正式庫已實際發生過一次，2026-08-23 的開通時間現在查不到）。誤退／爭議要復原時，
      // 只剩稽核紀錄裡的這份快照可查。快照失敗不中斷退款流程。
      try {
        const { data: snap, error: snapErr } = await supabase
          .from("enrollments").select("*").eq("email", email).eq("course_id", "piano-101").maybeSingle();
        if (snapErr) console.error("[refund] enrollment_snapshot:", snapErr.message);
        else revokedEnrollment = snap || null;
      } catch (e) {
        console.error("[refund] enrollment_snapshot threw:", e?.message || e);
      }
      const { error: enErr } = await supabase.from("enrollments").delete().eq("email", email).eq("course_id", "piano-101");
      if (enErr) { console.error("[refund] enrollments:", enErr.message); revokeFailed.push("enrollments"); }
    }
  }

  // 稽核紀錄帶齊金額／訂單編號／交易序號／付款方式與被撤銷資料的快照：
  // 退款是不可逆的金錢＋存取權操作，事後查帳只剩這一列可回溯。
  await logAudit(supabase, {
    actor: payload.email, action: "order.refund", targetType: "order", targetId: order.id,
    meta: {
      email: order.email, plan: order.plan, method,
      mer_trade_no: order.mer_trade_no || undefined,
      payuni_trade_no: order.payuni_trade_no || undefined,
      pay_type: order.pay_type || undefined,
      amount: order.amount,
      refunded_at: refundedAt,
      revoked_enrollment: revokedEnrollment || undefined,
      revoked_subscriptions: revokedSubscriptions,
      revokeFailed: revokeFailed.length ? revokeFailed : undefined,
      enrollmentKept: enrollmentKept || undefined,
    },
    req,
  });

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

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyGrantToken } from "@/lib/grant-token";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { autoGrantEnabled } from "@/lib/order-fulfillment";
import { grantAccess } from "@/lib/fulfillment-grant";
import { hasOtherPaidCourseAccess } from "@/lib/refund-guard";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 每 IP+訂單 每分鐘 10 次，擋 token/枚舉暴力嘗試（全域，缺 Redis 時記憶體保底）
const limiter = createDistributedLimiter({ limit: 10, windowMs: 60_000, prefix: "rl:grant-email" });

// 付款成功頁：學員確認/修改要開通到哪個 email（購買 email 可能 ≠ 想登入教室的 email）。
// 選填功能；學員付款後多半未登入，不能用登入驗證，改用 /success 簽出的 HMAC grantToken
// 證明請求者確實看得到該筆訂單的成功頁（防 IDOR：光憑可枚舉的 MerTradeNo 無法通過）。
// 另外限定 status=paid 才可開通、grant_email 一旦設定就不可覆蓋（單次）。
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { MerTradeNo, email, grantToken } = body || {};

  if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!MerTradeNo || typeof MerTradeNo !== "string") {
    return NextResponse.json({ error: "missing_trade_no" }, { status: 400 });
  }

  const rl = await limiter(`${clientIp(req)}:${MerTradeNo}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  if (!verifyGrantToken(MerTradeNo, grantToken)) {
    return NextResponse.json({ error: "bad_token" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data: order, error: findError } = await supabase
    .from("orders").select("id, status, email, plan, grant_email").eq("mer_trade_no", MerTradeNo).maybeSingle();
  if (findError) { console.error("[grant-email] find", findError.message); return NextResponse.json({ error: "server_error" }, { status: 500 }); }
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.status !== "paid") return NextResponse.json({ error: "not_paid" }, { status: 403 });
  if (order.grant_email) return NextResponse.json({ error: "already_set" }, { status: 409 });

  const grantEmail = email.trim().toLowerCase();
  const { error: updateError } = await supabase
    .from("orders").update({ grant_email: grantEmail }).eq("mer_trade_no", MerTradeNo);
  if (updateError) { console.error("[grant-email] update", updateError.message); return NextResponse.json({ error: "server_error" }, { status: 500 }); }

  // 付款即自動開通（AUTO_GRANT_ACCESS=on）時，notify 已把課程開在付款信箱上；學員在成功頁改成別的信箱，
  // 要把「這張訂單」的開通搬到新信箱：先開新信箱，成功後才收回付款信箱上由此單建立的那一列
  // （只刪 order_id＋email 都相符的，不動同信箱其他訂單的開通；失敗就保留舊開通，學員至少還進得了教室，
  // 後台付款名單會以 grant_email 判斷為待開通、可手動補）。開關關閉時照舊只記 grant_email、由後台手動開通。
  const paidEmail = String(order.email || "").trim().toLowerCase();
  if (autoGrantEnabled() && paidEmail && grantEmail !== paidEmail) {
    const grant = await grantAccess(supabase, { ...order, grant_email: grantEmail });
    if (!grant.ok) {
      console.error("[grant-email] 重開通到新信箱失敗（保留付款信箱的開通）", MerTradeNo, grant.errors.join("; "));
    } else {
      if (order.plan === "course" || order.plan === "bundle") {
        // enrollments 同 email 只有一列、order_id 會被最新一筆覆蓋（同 lib/refund-guard 與退款流程）：
        // 老學員再買一份送朋友、把開通信箱改成朋友的，不能把自己的開通刪掉。先查付款信箱名下是否還有
        // 其他有效課程訂單，有就保留；查詢失敗也保守不刪。只撈這個 email（避免 PostgREST 1000 列截斷）。
        const paidCourse = (q) => q.select("id, email, grant_email").eq("status", "paid").in("plan", ["course", "bundle"]);
        const [byGrant, byEmail] = await Promise.all([
          paidCourse(supabase.from("orders")).eq("grant_email", paidEmail),
          paidCourse(supabase.from("orders")).eq("email", paidEmail).is("grant_email", null),
        ]);
        const othersErr = byGrant.error || byEmail.error;
        const others = [...(byGrant.data || []), ...(byEmail.data || [])];
        if (othersErr) {
          console.error("[grant-email] 查付款信箱其他訂單失敗，保留其 enrollments", MerTradeNo, othersErr.message);
        } else if (!hasOtherPaidCourseAccess({ id: order.id, email: paidEmail }, others)) {
          const { error } = await supabase.from("enrollments").delete()
            .eq("email", paidEmail).eq("course_id", "piano-101").eq("order_id", order.id);
          if (error) console.error("[grant-email] 收回付款信箱 enrollments 失敗", MerTradeNo, error.message);
        }
      }
      // 遊戲存取：subscriptions 以 payuni_order_id 唯一（uniq_sub_purchase_order），grantAccess 對新信箱的 insert
      // 會撞索引被當成已開通；故把這張訂單原本那列的 email 直接改到新信箱。
      if (order.plan === "game" || order.plan === "bundle") {
        const { error } = await supabase.from("subscriptions").update({ email: grantEmail })
          .eq("payuni_order_id", order.id).eq("source", "purchase").eq("email", paidEmail);
        if (error) console.error("[grant-email] 搬移遊戲存取失敗", MerTradeNo, error.message);
      }
    }
  }

  return NextResponse.json({ ok: true, email: grantEmail });
}

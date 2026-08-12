import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyGrantToken } from "@/lib/grant-token";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

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
    .from("orders").select("id, status, grant_email").eq("mer_trade_no", MerTradeNo).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.status !== "paid") return NextResponse.json({ error: "not_paid" }, { status: 403 });
  if (order.grant_email) return NextResponse.json({ error: "already_set" }, { status: 409 });

  const grantEmail = email.trim().toLowerCase();
  const { error: updateError } = await supabase
    .from("orders").update({ grant_email: grantEmail }).eq("mer_trade_no", MerTradeNo);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, email: grantEmail });
}

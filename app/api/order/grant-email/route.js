import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 付款成功頁：學員確認/修改要開通到哪個 email（購買 email 可能 ≠ 想登入教室的 email）。
// 選填功能；憑證＝MerTradeNo（訂單存在即可更新，與成功頁現況一致，不需另外登入驗證）。
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { MerTradeNo, email } = body || {};

  if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!MerTradeNo || typeof MerTradeNo !== "string") {
    return NextResponse.json({ error: "missing_trade_no" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data: order, error: findError } = await supabase
    .from("orders").select("id").eq("mer_trade_no", MerTradeNo).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  const grantEmail = email.trim().toLowerCase();
  const { error: updateError } = await supabase
    .from("orders").update({ grant_email: grantEmail }).eq("mer_trade_no", MerTradeNo);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, email: grantEmail });
}

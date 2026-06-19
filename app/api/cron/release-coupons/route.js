import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// 優惠券逾時釋放（Vercel Cron / 手動觸發）
// ──────────────────────────────────────────────────────────────────────────
// 背景：checkout 對「限量券」做原子預扣以防 TOCTOU 重複折抵（見 payuni/checkout）。
// 但使用者開了結帳卻沒付款（放棄）會佔住名額，限量碼可能提早顯示用罄。此端點把
// 「逾時仍未付款」的 pending 訂單原子標記 expired，並退回其限量券的預扣額度。
//
// ⚠️ 安全前提：COUPON_RELEASE_AFTER_HOURS 必須「大於」PayUni ATM／超商的付款期限，
//    否則顧客可能在釋放後才完成付款。即便如此，notify 端對 expired 訂單仍會「補回扣抵 +
//    寄告警」（見 payuni/notify 的 wasExpired 處理），避免靜默重複折抵；但仍以避免發生為上策。
//
// 觸發：
//   - Vercel Cron：在 vercel.json 設定排程，Vercel 會自動帶 Authorization: Bearer <CRON_SECRET>。
//   - 手動：curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/release-coupons
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hours = Number(process.env.COUPON_RELEASE_AFTER_HOURS || 72);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  // 候選：逾時、仍 pending、且帶優惠券的訂單
  const { data: stale, error } = await supabase
    .from("orders")
    .select("id, coupon_code")
    .eq("status", "pending")
    .not("coupon_code", "is", null)
    .lt("created_at", cutoff)
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let expired = 0;
  let released = 0;
  for (const o of stale || []) {
    // 原子標記 expired：只在「仍 pending」時成功，避免與 notify 競態而誤釋放已付款訂單。
    const { data: claimed } = await supabase
      .from("orders")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    expired++;

    // 只退回「限量券」的預扣（無限量券當初未在 checkout 預扣）。以 CAS 還原一次。
    const { data: c } = await supabase
      .from("coupons")
      .select("used, usage_limit")
      .eq("code", o.coupon_code)
      .maybeSingle();
    if (c && c.usage_limit != null && (c.used || 0) > 0) {
      const { data: rel } = await supabase
        .from("coupons")
        .update({ used: c.used - 1 })
        .eq("code", o.coupon_code)
        .eq("used", c.used)
        .select("id");
      if (rel && rel.length) released++;
    }
  }

  return NextResponse.json({ ok: true, scanned: stale?.length || 0, expired, released, hours, cutoff });
}

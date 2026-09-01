// lib/coupon-hold.js — 限量券預扣的釋放（checkout 下單即預扣 used+1；訂單過期時退回）。
// checkout「同一買家重試」與 release-coupons cron「逾時回收」共用，確保兩邊語意一致。
// 兩步皆 CAS：訂單只在「仍 pending」時標 expired（避免與 notify 競態誤釋放已付款單）；
// 券 used 只在讀到的值未變時 -1，且只退限量券（無限量券當初未預扣）。

export async function expirePendingOrderAndRelease(supabase, { orderId, couponCode, now = new Date() }) {
  const { data: expired } = await supabase
    .from("orders")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!expired) return { expired: false, released: false };
  if (!couponCode) return { expired: true, released: false };

  const { data: c } = await supabase
    .from("coupons").select("used, usage_limit").eq("code", couponCode).maybeSingle();
  if (!c || c.usage_limit == null || !((c.used || 0) > 0)) return { expired: true, released: false };

  const { data: rel } = await supabase
    .from("coupons").update({ used: c.used - 1 })
    .eq("code", couponCode).eq("used", c.used)
    .select("id");
  return { expired: true, released: !!(rel && rel.length) };
}

// 同一買家（email）× 同一張券 仍 pending 的舊單全部作廢＋釋放；回傳釋放的額度數。
export async function releaseOwnPendingCouponHolds(supabase, { email, couponCode, now = new Date() }) {
  if (!email || !couponCode) return 0;
  const { data: mine } = await supabase
    .from("orders").select("id")
    .eq("email", email).eq("coupon_code", couponCode).eq("status", "pending");
  let released = 0;
  for (const o of mine || []) {
    const r = await expirePendingOrderAndRelease(supabase, { orderId: o.id, couponCode, now });
    if (r.released) released++;
  }
  return released;
}

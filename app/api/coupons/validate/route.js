import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PLAN_CATALOG, applyCoupon, couponError } from "@/lib/plans";

// 公開：結帳前驗證優惠券並回傳折後價（顯示用；checkout 會再次後端驗證）
export async function POST(req) {
  try {
    const { code, plan } = await req.json();
    const catalog = PLAN_CATALOG[plan];
    if (!catalog) return NextResponse.json({ valid: false, error: "invalid_plan" }, { status: 400 });
    if (!code || !String(code).trim()) return NextResponse.json({ valid: false, error: "missing_code" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ valid: false, error: "db_not_configured" }, { status: 503 });

    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", String(code).trim().toUpperCase())
      .maybeSingle();

    const err = couponError(coupon);
    if (err) return NextResponse.json({ valid: false, error: err }, { status: 200 });

    const finalPrice = applyCoupon(catalog.price, coupon);
    return NextResponse.json({
      valid: true,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      value: coupon.value,
      originalPrice: catalog.price,
      finalPrice,
      discount: catalog.price - finalPrice,
    });
  } catch (e) {
    return NextResponse.json({ valid: false, error: e.message }, { status: 500 });
  }
}

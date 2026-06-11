import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// GET：取得某批次所有序號（含 used 狀態與兌換反查），供畫面顯示 / 複製 / CSV
export async function GET(req, { params }) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data: codes, error } = await supabase
    .from("coupons")
    .select("id, code, used, type, value")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 兌換反查：以 orders.coupon_code 比對已付款訂單
  const codeList = (codes || []).map(c => c.code);
  const redeem = {};
  if (codeList.length) {
    const { data: orders } = await supabase
      .from("orders")
      .select("coupon_code, email, created_at")
      .in("coupon_code", codeList)
      .eq("status", "paid");
    for (const o of orders || []) {
      const at = o.created_at;
      const prev = redeem[o.coupon_code];
      // 一碼限用一次，正常只一筆；若多筆取最早
      if (!prev || (at && at < prev.at)) redeem[o.coupon_code] = { email: o.email, at };
    }
  }

  const data = (codes || []).map(c => ({
    ...c,
    redeemedEmail: redeem[c.code]?.email || null,
    redeemedAt: redeem[c.code]?.at || null,
  }));
  return NextResponse.json({ data });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user || !user.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  // 只回本人（以驗證後的 user.email 為準）的訂單，淨化欄位
  const { data, error } = await supabase
    .from("orders")
    .select("mer_trade_no, plan, plan_label, amount, currency, status, invoice_no, source, created_at")
    .eq("email", user.email)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [] });
}

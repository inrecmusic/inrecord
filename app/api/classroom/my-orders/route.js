import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";

export async function GET(req) {
  // 只驗登入、不驗購課（未購課者也能查自己的訂單狀態）
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  // 只回本人（以驗證後的 user.email 為準）的訂單，淨化欄位
  const { data, error } = await supabase
    .from("orders")
    .select("mer_trade_no, plan, plan_label, amount, currency, status, invoice_no, source, created_at")
    .eq("email", user.email)
    .order("created_at", { ascending: false });
  if (error) return serverError(error);

  return NextResponse.json({ orders: data || [] });
}

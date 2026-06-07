import { createInvoice } from "@/lib/amego-invoice";
import { NextResponse } from "next/server";

// 僅供本機 / 非正式環境測試用；正式環境直接 404，避免被外部呼叫亂開發票
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await createInvoice({
    orderId: "TEST-" + Date.now(),
    buyerName: "測試學員",
    buyerEmail: "inrecmusic@gmail.com",
    amount: 2200,
    productName: "零基礎流行鋼琴入門課（測試）",
    trackApiCode: "TEST123",
  });
  return NextResponse.json(result);
}

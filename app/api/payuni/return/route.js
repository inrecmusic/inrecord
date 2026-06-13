import { NextResponse } from "next/server";
import { parsePayuniCallback } from "@/lib/payuni";

// Payuni 前景導回（ReturnURL）：Payuni 以 POST 導回，這裡判斷付款結果後 303 轉址到 /success。
// 實際開通／發票由背景 NotifyURL /api/payuni/notify 負責，這裡僅作畫面導向（成功 vs 失敗引導）。
export async function POST(req) {
  let merTradeNo = "";
  // 預設成功：避免極端情況（無法驗章/解密）把真的付款成功的人誤導到失敗頁。
  // 失敗只在「明確判定未付款」時才標記；帳號實際開通與否仍以背景 notify 為準。
  let status = "success";

  try {
    const form        = await req.formData();
    merTradeNo        = form.get("MerTradeNo") || "";
    const encryptInfo = form.get("EncryptInfo");
    const hashInfo    = form.get("HashInfo");

    const result = parsePayuniCallback(
      encryptInfo,
      hashInfo,
      process.env.PAYUNI_HASH_KEY,
      process.env.PAYUNI_HASH_IV
    );

    if (result.verified) {
      merTradeNo = result.params.MerTradeNo || merTradeNo;
      status = result.paid ? "success" : "failed";
    } else {
      // 無法驗章/解密時退而求其次：讀外層未加密的 Status 欄位
      const outer = form.get("Status");
      if (outer && String(outer).toUpperCase() !== "SUCCESS") status = "failed";
    }
  } catch {
    // ignore parse error；維持 success（保守，不擋住成功者）
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const target  = new URL("/success", siteUrl);
  target.searchParams.set("status", status);
  if (merTradeNo) target.searchParams.set("MerTradeNo", merTradeNo);

  // 用 303 讓瀏覽器改以 GET 載入結果頁
  return NextResponse.redirect(target, 303);
}

import { NextResponse } from "next/server";
import { parsePayuniCallback } from "@/lib/payuni";
import { RETURN_COOKIE, RETURN_TTL_MS, signReturnCookie } from "@/lib/grant-token";

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
  const res = NextResponse.redirect(target, 303);
  // 付款完成憑證：/success 只有拿得到這張 cookie 才會顯示「確認開通信箱」表單。
  // 它只在這裡（PAYUNi 導回、且判定為成功）種下，所以光知道網址上的訂單編號改不了別人的訂單。
  // SameSite=Lax：303 之後是一次 GET 的頂層導航，Lax 會送出；不用 None 以免被當成第三方 cookie。
  if (status === "success" && merTradeNo) {
    res.cookies.set(RETURN_COOKIE, signReturnCookie(merTradeNo), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/success", maxAge: Math.floor(RETURN_TTL_MS / 1000),
    });
  }
  return res;
}

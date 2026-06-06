import { NextResponse } from "next/server";

// Payuni 前景導回（ReturnURL）：Payuni 以 POST 導回，這裡接住後 303 轉址到 client 端 /success 頁
// （實際開通由背景 NotifyURL /api/payuni/notify 負責，這裡僅作畫面導向）
export async function POST(req) {
  let merTradeNo = "";
  try {
    const form = await req.formData();
    const encryptInfo = form.get("EncryptInfo");
    // EncryptInfo 為加密字串，這裡不解密；僅嘗試從 form 取得可顯示的單號（若有）
    merTradeNo = form.get("MerTradeNo") || "";
    void encryptInfo;
  } catch {
    // ignore parse error；仍導向 success 頁
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const target = new URL("/success", siteUrl);
  if (merTradeNo) target.searchParams.set("MerTradeNo", merTradeNo);

  // 用 303 讓瀏覽器改以 GET 載入 /success 頁
  return NextResponse.redirect(target, 303);
}

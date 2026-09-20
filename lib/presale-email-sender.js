// lib/presale-email-sender.js — webhook 自動寄預購成功信的注入器（concert / woocommerce 路由共用）。
// 與 lib/woocommerce-webhook 分開，讓核心 handler 維持零外部依賴、可單元測試。
import { sendPurchaseEmail } from "./brevo-email";

// webhook 進來的訂單（現場／WordPress 成交）一律由後台人工開通，付款當下不會有課程存取，
// 所以這封信固定寄「預購成功、開通後 Email 通知」版本——不能像以前那樣看 sale_settings 的開課日：
// 開課後會寄出「購買成功，課程已開通」＋登入按鈕，但學員登入進去什麼都沒有。
// 真正開通時後台手動開通可勾「寄開通信」，那封才會依開課狀態寫「已開通」。
export function makePresaleEmailSender() {
  return async ({ email, plan, planLabel, merTradeNo }) =>
    sendPurchaseEmail({ email, plan, planLabel, merTradeNo, presale: true });
}

// lib/presale-email-sender.js — webhook 自動寄預購成功信的注入器（concert / woocommerce 路由共用）。
// 與 lib/woocommerce-webhook 分開，讓核心 handler 維持零外部依賴、可單元測試。
import { sendPurchaseEmail } from "./brevo-email";
import { getSaleSettings, isPresale } from "./sale";

// presale 文案旗標在「寄信當下」由 sale_settings 決定，與 payuni notify、後台手動寄信一致：
// 開課前寄「預購成功」版本、開課後寄「購買成功已開通」版本。
export function makePresaleEmailSender() {
  return async ({ email, plan, planLabel, merTradeNo }) => {
    const settings = await getSaleSettings();
    return sendPurchaseEmail({
      email,
      plan,
      planLabel,
      merTradeNo,
      presale: isPresale(settings, new Date()),
    });
  };
}

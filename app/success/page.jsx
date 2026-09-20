import Logo from "@/components/Logo";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTrackingSettings } from "@/lib/tracking";
import { cookies } from "next/headers";
import { RETURN_COOKIE, signGrantToken, verifyReturnCookie } from "@/lib/grant-token";
import { autoGrantEnabled } from "@/lib/order-fulfillment";
import PurchaseTracking from "@/components/tracking/PurchaseTracking";
import GrantEmailForm from "@/components/GrantEmailForm";

// 付款成功頁需即時讀 sale 狀態（預購 / 已開課），故 server component + 動態。
export const dynamic = "force-dynamic";

const card = {
  maxWidth: 480, width: "100%", background: "#fff", borderRadius: 24,
  padding: 40, textAlign: "center", boxShadow: "0 20px 60px rgba(15,23,42,.1)",
};
const primaryBtn = {
  display: "inline-block", background: "linear-gradient(135deg,#2563eb,#3b82f6)",
  color: "#fff", fontWeight: 900, padding: "14px 28px", borderRadius: 12, textDecoration: "none",
};
const ghostBtn = {
  display: "inline-block", border: "1px solid #cbd5e1", color: "#475569",
  fontWeight: 700, padding: "13px 24px", borderRadius: 12, textDecoration: "none",
};

export default async function SuccessPage({ searchParams }) {
  const sp = searchParams || {};
  const tradeNo = sp.MerTradeNo || sp.TradeNo || "";
  const failed = sp.status === "failed";
  // 「確認開通信箱」表單只給真的從 PAYUNi 付款完成導回來的人：憑證是 /api/payuni/return
  // 驗過 PAYUNi 簽章後種下的 HttpOnly cookie。訂單編號是可預測的時間戳、又會留在網址列與瀏覽紀錄，
  // 光憑它（或它的 HMAC）不足以證明身分——沒有 cookie 就不顯示表單、也不吐出買家 email。
  const fromPayuni = Boolean(tradeNo) && !failed
    && verifyReturnCookie(tradeNo, cookies().get(RETURN_COOKIE)?.value);
  const grantToken = fromPayuni ? signGrantToken(tradeNo) : "";

  // 與購買信（notify → lib/brevo-email.js）同一條規則：自動開通關閉（AUTO_GRANT_ACCESS 未設）時付款後不會立刻開通，
  // 一律顯示「預購成功、開通後 Email 通知」；只有自動開通開啟且已開課才顯示「課程已開通／前往登入」。
  // 讀取失敗時安全 fallback 成預購（= 現況），不讓成功頁壞掉。
  let presale = true;
  try { presale = !autoGrantEnabled() || isPresale(await getSaleSettings()); } catch { presale = true; }

  // 回查訂單以觸發 Purchase 轉換追蹤 + 取得開通 email 預填值；best-effort，任何失敗都不影響成功頁本身。
  let purchase = null;
  let orderExists = false;
  let orderPaid = false;
  let orderEmail = "";
  if (tradeNo && !failed) {
    try {
      const sb = getSupabaseAdmin();
      const { data: order } = sb
        ? await sb.from("orders").select("amount, plan, status, email").eq("mer_trade_no", tradeNo).maybeSingle()
        : { data: null };
      if (order) {
        orderExists = true;
        orderPaid = order.status === "paid";
        if (fromPayuni) orderEmail = order.email || ""; // 沒憑證就不預填（等於不外洩買家信箱）
        // 轉換追蹤只在真的收到款時觸發：ATM／超商的「取號成功」也會導回這一頁，
        // 此時訂單還是 pending，打 Purchase 會讓廣告平台記到一筆沒收到錢的轉換。
        if (orderPaid) {
          const platforms = await getTrackingSettings();
          purchase = {
            transactionId: tradeNo,
            value: Number(order.amount) || 0,
            contentIds: [order.plan],
            googleAdsSendTo: platforms?.googleAds?.purchaseLabel ? `${platforms.googleAds.id}/${platforms.googleAds.purchaseLabel}` : null,
            lineTagId: platforms?.line?.id || null,
          };
        }
      }
    } catch {}
  }

  // ATM／超商取號：導回時訂單仍是 pending（notify 只在 TradeStatus=1 才寫 paid）。
  // 這種情況不能說「購買成功」，改顯示待繳費說明。
  // 查不到訂單時維持原本的成功畫面（保守，不嚇到真的付款成功的人）。
  const awaitingPayment = orderExists && !orderPaid;

  if (failed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(135deg,#fff7ed,#fef2f2)" }}>
        <div style={card}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>😕</div>
          <Logo size={28} />
          <h1 style={{ fontSize: 32, letterSpacing: "-.04em", margin: "16px 0 10px" }}>付款未完成</h1>
          <p style={{ color: "#64748b", marginBottom: 8 }}>這筆付款沒有完成，<strong>系統不會向你收取任何費用</strong>。</p>
          <p style={{ color: "#64748b", marginBottom: 28 }}>可能是付款中途取消或銀行未授權，請重新嘗試；若已扣款卻看到此頁，款項會自動退回，也歡迎與我們聯絡。</p>
          {tradeNo && <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24 }}>訂單編號：{tradeNo}</p>}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/#pricing" style={primaryBtn}>重新購買</a>
            <a href="/contact" style={ghostBtn}>聯絡客服</a>
          </div>
        </div>
      </div>
    );
  }

  if (awaitingPayment) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(135deg,#fffbeb,#eff6ff)" }}>
        <div style={card}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🧾</div>
          <Logo size={28} />
          <h1 style={{ fontSize: 30, letterSpacing: "-.04em", margin: "16px 0 10px", wordBreak: "keep-all", lineBreak: "strict" }}>已取得繳費資訊</h1>
          <p style={{ color: "#64748b", margin: "0 0 8px", lineHeight: 1.8, wordBreak: "keep-all", lineBreak: "strict" }}>這筆訂單還沒完成付款。請依付款方式提供的帳號或代碼，在期限內完成繳費。</p>
          <p style={{ color: "#64748b", marginBottom: 24, wordBreak: "keep-all", lineBreak: "strict" }}>繳費完成後我們會收到通知，並以 Email 與你確認。</p>
          {tradeNo && <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24 }}>訂單編號：{tradeNo}</p>}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/" style={primaryBtn}>回到首頁</a>
            <a href="/contact" style={ghostBtn}>聯絡我們</a>
          </div>
        </div>
      </div>
    );
  }

  const heading = presale ? "預購成功，感謝你的支持！" : "購買成功，感謝你的支持！";
  const intro = presale
    ? "你已完成預購，課程正式開課後我們會以 Email 通知你登入學習。"
    : "恭喜你加入《從零開始學鋼琴》，課程已為你開通。";
  const mailNote = presale
    ? "我們已寄出預購確認信，請到信箱查收。"
    : "我們已寄出開課確認 Email，請到信箱查收。";

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(135deg,#f0fdf4,#eff6ff)" }}>
      <div style={card}>
        {purchase && purchase.value > 0 && <PurchaseTracking {...purchase} />}
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎹</div>
        <Logo size={28} />
        <h1 style={{ fontSize: 32, letterSpacing: "-.04em", margin: "16px 0 10px" }}>{heading}</h1>
        <p style={{ color: "#64748b", margin: "0 0 8px", lineHeight: 1.8 }}>{intro}</p>
        <p style={{ color: "#64748b", marginBottom: 24 }}>{mailNote}</p>

        {presale && (
          <div style={{ background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: 12, padding: "16px 18px", marginBottom: 24, textAlign: "left" }}>
            <p style={{ margin: 0, color: "#1e40af", fontSize: 14, fontWeight: 800, textAlign: "center" }}>📅 課程開課後將以 Email 通知</p>
            <p style={{ margin: "7px 0 0", color: "#3b82f6", fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>屆時即可使用本次購買的 Email 登入學習，請留意收信。</p>
          </div>
        )}

        {fromPayuni && orderExists && <GrantEmailForm tradeNo={tradeNo} defaultEmail={orderEmail} grantToken={grantToken} />}

        {tradeNo && <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24 }}>訂單編號：{tradeNo}</p>}

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {presale
            ? <a href="/" style={primaryBtn}>回到首頁</a>
            : <>
                <a href="/classroom/login" style={primaryBtn}>前往課程登入</a>
                <a href="/" style={ghostBtn}>回到首頁</a>
              </>}
        </div>
      </div>
    </div>
  );
}

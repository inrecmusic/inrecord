import Logo from "@/components/Logo";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTrackingSettings } from "@/lib/tracking";
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

  // 與購買信（lib/brevo-email.js）一致：預售期間顯示「預購成功」、開課後顯示「購買成功，課程已開通」。
  // 讀取失敗時安全 fallback 成預購（= 現況），不讓成功頁壞掉。
  let presale = true;
  try { presale = isPresale(await getSaleSettings()); } catch { presale = true; }

  // 回查訂單以觸發 Purchase 轉換追蹤 + 取得開通 email 預填值；best-effort，任何失敗都不影響成功頁本身。
  let purchase = null;
  let orderExists = false;
  let orderEmail = "";
  if (tradeNo && !failed) {
    try {
      const sb = getSupabaseAdmin();
      const { data: order } = sb
        ? await sb.from("orders").select("amount, plan, status, email").eq("mer_trade_no", tradeNo).maybeSingle()
        : { data: null };
      if (order) {
        orderExists = true;
        orderEmail = order.email || "";
        if (order.status !== "refunded") {
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

  const heading = presale ? "預購成功，感謝你的支持！" : "購買成功，課程已開通！";
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

        {tradeNo && orderExists && <GrantEmailForm tradeNo={tradeNo} defaultEmail={orderEmail} />}

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

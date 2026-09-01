import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

// 電子報退訂頁（信中「取消訂閱」按鈕的落地頁）。多一步「確認」是為了擋信箱服務商的連結預抓誤退訂。
export const metadata = { title: "取消訂閱｜InRecord", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const F = "-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif";
const card = { maxWidth: 440, margin: "0 auto", background: "#fff", borderRadius: 20, padding: "36px 32px", boxShadow: "0 12px 40px rgba(15,23,42,.08)", textAlign: "center", wordBreak: "keep-all", lineBreak: "strict" };
const h = { margin: "0 0 12px", fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-.01em" };
const p = { margin: "0 0 20px", fontSize: 15, lineHeight: 1.8, color: "#475569" };
const btn = { display: "inline-block", padding: "13px 32px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 999, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: F, textDecoration: "none" };
const link = { display: "inline-block", marginTop: 18, fontSize: 13, color: "#94a3b8", textDecoration: "none" };

export default function UnsubscribePage({ searchParams }) {
  const e = String(searchParams?.e || "");
  const t = String(searchParams?.t || "");
  const done = searchParams?.done === "1";
  const error = searchParams?.error;
  const valid = !done && !error && verifyUnsubscribeToken(e, t);

  let body;
  if (done) {
    body = (<>
      <h1 style={h}>已取消訂閱</h1>
      <p style={p}>之後不會再收到 InRecord 的課程消息與電子報。<br />登入驗證碼、購課與課程開通通知不受影響。</p>
      <a href="/" style={btn}>回到官網</a>
    </>);
  } else if (valid) {
    body = (<>
      <h1 style={h}>取消訂閱電子報</h1>
      <p style={p}>確定不再收到 InRecord 的課程消息嗎？<br /><span style={{ color: "#0f172a", fontWeight: 700 }}>{e}</span></p>
      <form method="post" action="/api/newsletter/unsubscribe">
        <input type="hidden" name="e" value={e} />
        <input type="hidden" name="t" value={t} />
        <input type="hidden" name="confirm" value="1" />
        <button type="submit" style={btn}>確認取消訂閱</button>
      </form>
      <a href="/" style={link}>我按錯了，回到官網</a>
    </>);
  } else {
    body = (<>
      <h1 style={h}>{error === "server" ? "暫時無法處理" : "連結無效"}</h1>
      <p style={p}>{error === "server" ? "系統忙碌中，請稍後再試一次。" : "這個取消訂閱連結已失效或不完整，請從最新一封電子報重新點擊。"}<br />也可以直接回信告訴我們，我們會手動處理。</p>
      <a href="/" style={btn}>回到官網</a>
    </>);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#eef2f7", padding: "56px 16px", fontFamily: F }}>
      <div style={card}>
        <a href="/" style={{ display: "inline-block", marginBottom: 22 }}><img src="/logo-wordmark.png" alt="InRecord" width="130" style={{ width: 130, height: "auto" }} /></a>
        {body}
      </div>
    </main>
  );
}

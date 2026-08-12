"use client";

import { useState } from "react";

const wrap = {
  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12,
  padding: "16px 18px", marginBottom: 24, textAlign: "left",
};
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1",
  fontSize: 14, marginTop: 10, marginBottom: 10, boxSizing: "border-box",
};
const btnStyle = {
  display: "inline-block", background: "linear-gradient(135deg,#2563eb,#3b82f6)",
  color: "#fff", fontWeight: 800, padding: "9px 20px", borderRadius: 10, border: "none",
  fontSize: 14, cursor: "pointer",
};

// 付款成功頁：確認/修改開通用 email（購買 email 可能 ≠ 想登入教室的 email）。
// 選填——學員不改、不按「確認」也不影響，預設仍用訂單本身的 email 開通。
export default function GrantEmailForm({ tradeNo, defaultEmail }) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const [message, setMessage] = useState("");

  async function handleConfirm() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/order/grant-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ MerTradeNo: tradeNo, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error === "invalid_email" ? "Email 格式不正確，請重新確認。" : "更新失敗，請稍後再試或聯絡客服。");
        return;
      }
      setStatus("done");
      setMessage(data.email || email);
    } catch {
      setStatus("error");
      setMessage("網路異常，請稍後再試。");
    }
  }

  return (
    <div style={wrap}>
      <p style={{ margin: 0, color: "#334155", fontSize: 13, fontWeight: 800 }}>✉️ 確認開通 Email</p>
      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12.5, lineHeight: 1.7 }}>
        確認課程要開通到哪個 email（預設用購買時的 email；想用別的帳號登入教室請改）。
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={inputStyle}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={status === "saving"}
          style={{ ...btnStyle, opacity: status === "saving" ? 0.7 : 1 }}
        >
          {status === "saving" ? "確認中…" : "確認"}
        </button>
        {status === "done" && (
          <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>✅ 已記錄，將開通到 {message}</span>
        )}
        {status === "error" && (
          <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 700 }}>{message}</span>
        )}
      </div>
    </div>
  );
}

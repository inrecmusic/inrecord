"use client";
import { useState } from "react";
import { freshToken, F } from "./shared";

/* ── RatingTab ───────────────────────────────────────────────────────────────── */
export default function RatingTab({ token }) {
  const [hover, setHover]       = useState(0);
  const [selected, setSelected] = useState(0);
  const [content, setContent]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [err, setErr]           = useState("");

  async function submit() {
    if (!selected) return;
    setSubmitting(true); setErr("");
    try {
      const tk = await freshToken(token);
      const r = await fetch("/api/classroom/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ score: selected, content }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok && json.error !== "already_rated") throw new Error(json.error || "送出失敗");
      setDone(true);
    } catch (e) { setErr(e.message === "unauthorized" ? "登入狀態逾時，請重新整理頁面再送一次" : (e.message || "送出失敗，請稍後再試")); }
    finally { setSubmitting(false); }
  }

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>⭐</div>
      <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 18, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: "0 0 14px" }}>你對這堂課的評分是？</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setSelected(i)}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 30, padding: 2, lineHeight: 1 }}
          >
            {(hover || selected) >= i ? "⭐" : "☆"}
          </button>
        ))}
      </div>
      {selected > 0 && (
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
          {["", "有點失望", "普通", "還不錯", "很好", "非常推薦！"][selected]}
        </p>
      )}
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="分享你的學習心得（選填）" rows={3}
        style={{
          width: "100%", background: "#f1f5f9",
          border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
          padding: "10px 12px", color: "#0f172a", fontSize: 13.5,
          fontFamily: F, resize: "vertical", outline: "none",
          boxSizing: "border-box", marginBottom: 14,
        }}
      />
      {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <button onClick={submit} disabled={!selected || submitting}
        style={{
          background: "#2563eb", color: "#fff", border: 0, borderRadius: 980,
          padding: "8px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          fontFamily: F, opacity: !selected ? 0.35 : 1, transition: "opacity .15s",
        }}
      >
        {submitting ? "送出中…" : "送出評分"}
      </button>
    </div>
  );
}

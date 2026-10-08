// components/classroom/RatingForm.jsx — 課程評分表單（星星＋選填心得），播放頁「課程評價」分頁與儀表板推力卡片共用。
"use client";
import { useState } from "react";
import { freshToken, F } from "./shared";

const LABELS = ["", "有點失望", "普通", "還不錯", "很好", "非常推薦！"];

export default function RatingForm({ token, onDone, compact = false }) {
  const [hover, setHover]       = useState(0);
  const [selected, setSelected] = useState(0);
  const [content, setContent]   = useState("");
  const [submitting, setSubmitting] = useState(false);
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
      onDone?.();
    } catch (e) { setErr(e.message === "unauthorized" ? "登入狀態逾時，請重新整理頁面再送一次" : (e.message || "送出失敗，請稍後再試")); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "inherit", margin: compact ? "0 0 8px" : "0 0 14px" }}>你對這堂課的評分是？</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" aria-label={`${i} 星`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setSelected(i)}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 30, padding: 2, lineHeight: 1 }}
          >
            {(hover || selected) >= i ? "⭐" : "☆"}
          </button>
        ))}
      </div>
      {selected > 0 && <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>{LABELS[selected]}</p>}
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="分享你的學習心得（選填）" rows={compact ? 2 : 3}
        style={{
          width: "100%", background: "#f1f5f9",
          border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
          padding: "10px 12px", color: "#0f172a", fontSize: 13.5,
          fontFamily: F, resize: "vertical", outline: "none",
          boxSizing: "border-box", marginBottom: 12,
        }}
      />
      {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <button type="button" onClick={submit} disabled={!selected || submitting}
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

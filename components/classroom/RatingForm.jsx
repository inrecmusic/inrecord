// components/classroom/RatingForm.jsx — 課程評分表單：點星就先存，再問要不要寫一句（可跳過）。
// 播放頁「課程評價」分頁、儀表板推力卡片、播完單元的彈窗共用。
// existing：已存的那筆評價（補寫心得用）；onRated(row)：每次存檔成功；onDone()：寫完或跳過。
"use client";
import { useState } from "react";
import { freshToken, F } from "./shared";
import { canEditScore } from "@/lib/rating-edit";

const LABELS = ["", "有點失望", "普通", "還不錯", "很好", "非常推薦！"];
const MESSAGES = {
  unauthorized: "登入狀態逾時，請重新整理頁面再試一次",
  edit_window_closed: "評分送出超過 15 分鐘，無法再修改",
  content_too_long: "心得最多 1000 字",
};
const message = (code) => MESSAGES[code] || "送出失敗，請稍後再試";

async function send(token, method, body) {
  const tk = await freshToken(token);
  const r = await fetch("/api/classroom/rating", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, error: json.error, data: json.data };
}

export default function RatingForm({ token, existing = null, onRated, onDone, compact = false }) {
  const [rating, setRating]   = useState(existing); // 已存的那筆；null＝還沒評
  const [hover, setHover]     = useState(0);
  const [pending, setPending] = useState(0);        // 存檔中的星數，先亮起來不等往返
  const [content, setContent] = useState(existing?.content || "");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");

  const locked = !!rating && !canEditScore(rating, Date.now());
  const shown  = (locked ? 0 : hover) || pending || rating?.score || 0;

  async function pickStar(k) {
    if (busy || locked || k === rating?.score) return;
    setBusy(true); setErr(""); setPending(k);
    try {
      const res = await send(token, rating ? "PATCH" : "POST", { score: k });
      if (res.ok && res.data) { setRating(res.data); onRated?.(res.data); }
      else if (res.error === "already_rated") onDone?.(); // 別的裝置／分頁已評過
      else setErr(message(res.error));
    } catch { setErr(message()); }
    finally { setPending(0); setBusy(false); }
  }

  async function submitContent() {
    const text = content.trim();
    if (!text) { setErr("寫一句再送出，或按「跳過」"); return; }
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const res = await send(token, "PATCH", { content: text });
      if (res.ok && res.data) { setRating(res.data); onRated?.(res.data); onDone?.(); }
      else setErr(message(res.error));
    } catch { setErr(message()); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {!compact && !rating && <p style={{ fontSize: 15, fontWeight: 600, color: "inherit", margin: "0 0 14px" }}>你對這堂課的評分是？</p>}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" aria-label={`${i} 星`} disabled={locked}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => pickStar(i)}
            style={{ background: "none", border: 0, cursor: locked ? "default" : "pointer", fontSize: 30, padding: 2, lineHeight: 1 }}
          >
            {shown >= i ? "⭐" : "☆"}
          </button>
        ))}
      </div>

      {!rating && <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 4px" }}>{hover ? LABELS[hover] : "點一下星星就完成了"}</p>}

      {rating && (
        <>
          <p style={{ fontSize: 13, color: "#16a34a", margin: "0 0 14px" }}>
            ✓ 已記下你的 {rating.score} 星{locked ? "" : "，可以再點星星修改"}
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "inherit", margin: "0 0 8px" }}>願意多寫一句心得嗎？</p>
          <textarea value={content} onChange={e => { setContent(e.target.value); setErr(""); }}
            placeholder="寫下你的學習心得，一句也可以" rows={compact ? 2 : 3}
            style={{
              width: "100%", background: "#f1f5f9",
              border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
              padding: "10px 12px", color: "#0f172a", fontSize: 13.5,
              fontFamily: F, resize: "vertical", outline: "none",
              boxSizing: "border-box", marginBottom: 12,
            }}
          />
        </>
      )}

      {err && <p role="alert" style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}

      {rating && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={submitContent}
            style={{
              background: "#2563eb", color: "#fff", border: 0, borderRadius: 980,
              padding: "8px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F,
            }}
          >
            {busy ? "送出中…" : "送出心得"}
          </button>
          <button type="button" onClick={() => onDone?.()}
            style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", opacity: .7, fontSize: 13, padding: "8px 6px", fontFamily: F }}
          >
            跳過
          </button>
        </div>
      )}
    </div>
  );
}

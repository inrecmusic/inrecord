// components/classroom/RatingPrompt.jsx — 播放頁「播完一個單元，邀請評分」的彈窗。
// ended：播放頁在單元播到結尾時給的 { video, completed, at }（每次都是新物件）。
// 要不要跳由 lib/rating-prompt.js 決定（未評分、正課單元、本裝置最多 3 次、同一天最多 2 次）；跳出就記一次。
"use client";
import { useEffect, useState } from "react";
import RatingForm from "./RatingForm";
import { F } from "./shared";
import { shouldPrompt, readPromptState, recordPrompt, localDay } from "@/lib/rating-prompt";

const storage = () => (typeof window !== "undefined" ? window.localStorage : null);

export default function RatingPrompt({ token, rated, ended, onRated }) {
  const [open, setOpen]           = useState(false);
  const [ratedHere, setRatedHere] = useState(false); // 在這個彈窗裡點星存好了：留著問心得
  const [thanks, setThanks]       = useState(false);

  useEffect(() => {
    if (!ended) return;
    const today = localDay();
    if (!shouldPrompt({ rated, video: ended.video, completed: ended.completed, state: readPromptState(storage()), today })) return;
    recordPrompt(storage(), today);
    setRatedHere(false); setThanks(false); setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在「又播完一個單元」時判斷；rated 之後變 true 不該把開著的彈窗關掉或重判
  }, [ended]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const close = () => setOpen(false);

  return (
    <div onClick={close} style={backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="rating-prompt-title" onClick={(e) => e.stopPropagation()} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <h2 id="rating-prompt-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>
            {thanks ? "感謝你的評價！" : "願意留下您的課程評價嗎？"}
          </h2>
          <button type="button" aria-label="關閉" onClick={close} style={x}>✕</button>
        </div>

        {thanks ? (
          <>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b" }}>你的回饋對我們非常重要</p>
            <button type="button" onClick={close} style={primary}>繼續上課</button>
          </>
        ) : (
          <>
            <RatingForm token={token} compact
              onRated={(row) => { setRatedHere(true); onRated?.(row); }}
              onDone={() => setThanks(true)} />
            {!ratedHere && <button type="button" onClick={close} style={later}>先不用</button>}
          </>
        )}
      </div>
    </div>
  );
}

const backdrop = { position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const card = { width: "100%", maxWidth: 400, background: "#fff", color: "#0f172a", borderRadius: 18, padding: "22px 22px 20px", boxSizing: "border-box", fontFamily: F, boxShadow: "0 20px 60px rgba(15,23,42,.3)" };
const x = { background: "none", border: 0, cursor: "pointer", color: "#64748b", fontSize: 16, lineHeight: 1.2, padding: "2px 4px" };
const later = { background: "none", border: 0, cursor: "pointer", color: "#64748b", fontSize: 13, padding: "10px 0 0", fontFamily: F };
const primary = { background: "#2563eb", color: "#fff", border: 0, borderRadius: 980, padding: "8px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F };

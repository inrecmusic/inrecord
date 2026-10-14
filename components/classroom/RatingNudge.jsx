// components/classroom/RatingNudge.jsx — 儀表板「看完第 1 章，給課程評分」推力卡片。
// 顯示條件在 lib/rating-nudge.js（純函式）；關閉／點星存好後記在本裝置 localStorage，不再出現。
"use client";
import { useEffect, useState } from "react";
import RatingForm from "./RatingForm";
import { shouldNudge, readNudgeDismissed, writeNudgeDismissed } from "@/lib/rating-nudge";

const storage = () => (typeof window !== "undefined" ? window.localStorage : null);

export default function RatingNudge({ token, rated, chapters = [], videos = [], progress = [] }) {
  const [dismissed, setDismissed] = useState(true); // SSR／首次 render 先當作關閉，mount 後再讀 localStorage，避免 hydration 不一致
  const [thanks, setThanks] = useState(false);
  const [ratedHere, setRatedHere] = useState(false); // 這張卡上剛點星存好：卡片留著問心得，不受 dismissed 影響

  useEffect(() => { setDismissed(readNudgeDismissed(storage())); }, []);

  const close = () => { writeNudgeDismissed(storage()); setDismissed(true); };
  const onRated = () => { writeNudgeDismissed(storage()); setRatedHere(true); };
  const onDone = () => { writeNudgeDismissed(storage()); setThanks(true); };

  if (thanks) return (
    <section aria-live="polite" style={wrap}>
      <p style={{ margin: 0, fontWeight: 600 }}>感謝你的評價！</p>
      <p style={{ margin: "4px 0 0", fontSize: 14, opacity: .75 }}>你的回饋對我們非常重要</p>
    </section>
  );
  if (!ratedHere && !shouldNudge({ rated, chapters, videos, progress, dismissed })) return null;

  return (
    <section aria-label="給課程評分" style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 700 }}>看完第 1 章了，給這堂課一個評分吧</h2>
        {!ratedHere && <button type="button" onClick={close} style={ghost}>先不用</button>}
      </div>
      <RatingForm token={token} onRated={onRated} onDone={onDone} compact />
    </section>
  );
}

// 底色／框線走儀表板主題變數（hub-css.js 兩版都有 --card／--line），淺色主題才看得到容器；沒有變數時退回深色半透明
const wrap = { margin: "0 0 24px", padding: "18px 20px", borderRadius: 16, border: "1px solid var(--line, rgba(255,255,255,.14))", background: "var(--card, rgba(255,255,255,.05))", color: "inherit" };
const ghost = { background: "none", border: 0, cursor: "pointer", color: "inherit", opacity: .7, fontSize: 14, padding: "2px 4px", whiteSpace: "nowrap" };

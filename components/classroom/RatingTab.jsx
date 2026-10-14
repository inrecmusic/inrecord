"use client";
import { useState } from "react";
import RatingForm from "./RatingForm";

/* ── RatingTab：播放頁「課程評價」分頁，表單共用 RatingForm ─────────────────
   rating：bootstrap 帶回的本人評價（null＝還沒評）。評過但心得空白的人在這裡補寫；已有心得就只顯示感謝。 */
export default function RatingTab({ token, rating = null, onRated }) {
  const [done, setDone] = useState(false);

  if (done || rating?.content) return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>⭐</div>
      <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 18, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return <RatingForm token={token} existing={rating} onRated={onRated} onDone={() => setDone(true)} />;
}

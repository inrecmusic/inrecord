"use client";
import { useState } from "react";
import RatingForm from "./RatingForm";

/* ── RatingTab：播放頁「課程評價」分頁，表單共用 RatingForm ───────────────── */
export default function RatingTab({ token }) {
  const [done, setDone] = useState(false);

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>⭐</div>
      <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 18, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return <RatingForm token={token} onDone={() => setDone(true)} />;
}

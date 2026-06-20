"use client";
import { useEffect, useState } from "react";

// 顯示到 target（ISO）的倒數；過期回 null（不顯示）
export default function Countdown({ to, prefix = "", style }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!to) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const txt = d > 0 ? `${d} 天 ${h} 時` : `${h} 時 ${m} 分 ${s} 秒`;
  return <span style={{ wordBreak: "keep-all", lineBreak: "strict", ...style }}>{prefix}{txt}</span>;
}

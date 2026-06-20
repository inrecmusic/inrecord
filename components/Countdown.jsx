"use client";

import { useEffect, useState } from "react";
import { formatCountdownParts } from "@/lib/countdown";
import styles from "./Countdown.module.css";

/**
 * 即時倒數到 `target`（Date 或 ISO 字串）。
 * SSR 安全：首次渲染顯示「—」，掛載後才開始每秒 tick，避免水合不一致。
 * target 為空 → 不渲染（正式牌價無倒數時可傳 null）。
 */
export default function Countdown({ target }) {
  const [parts, setParts] = useState(null);

  useEffect(() => {
    if (!target) return;
    const t = new Date(target).getTime();
    const tick = () => setParts(formatCountdownParts(t - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;
  if (!parts) return <span className={styles.cd} suppressHydrationWarning>—</span>;
  return (
    <span className={styles.cd} suppressHydrationWarning>
      {parts.d} 天 {parts.h}:{parts.m}:{parts.s}
    </span>
  );
}

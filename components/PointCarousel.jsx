"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PointSlide from "./PointSlide";
import styles from "./PointCarousel.module.css";

const AUTOPLAY_MS = 4000;
const SWIPE_THRESHOLD = 60; // px dragged before a slide change commits

// 進／出場用彈簧；待命中的投影片直接歸位（不需要動畫，也省效能）
const GLIDE = {
  x: { type: "spring", stiffness: 320, damping: 36 },
  opacity: { duration: 0.25 },
};
const INSTANT = { duration: 0 };

/**
 * 環狀待命位置：算第 i 張相對當前張的最短距離，決定它停在右邊還是左邊。
 * 下一張停右邊（往前翻時從右滑入）、上一張停左邊，離開的那張自然被推向另一側。
 */
function restingX(i, index, count, leaving = false) {
  const rel = (((i - index) % count) + count) % count;
  // 張數為偶數時 rel 剛好等於半圈會兩邊都成立；離場張此時走反邊，
  // 否則進場張與離場張會停在同一側、切換動畫看起來像破圖（每個 POINT 都是 4 張，必中）。
  if (rel * 2 === count) return leaving ? "-100%" : "100%";
  return rel < count / 2 ? "100%" : "-100%";
}

/**
 * Horizontal, auto-playing slide carousel for the POINT sections (1 & 2).
 * Each slide is a natively-rebuilt <PointSlide> (title / progress / footer /
 * visual all real DOM); the carousel only adds chrome: arrows, dots,
 * drag/keyboard navigation and the sliding transition. `point` numbers the
 * eyebrow/footer of every slide.
 *
 * 所有投影片都留在 DOM（初始 HTML 就有全部文字，搜尋引擎／讀螢幕軟體讀得到），
 * 非當前張以 hidden（display:none）隱藏：不佔版面、不會被 Tab 聚焦、
 * 圖片的 lazy load 也不會被觸發；剛離開的那張暫時不隱藏，好把出場動畫演完。
 */
export default function PointCarousel({ slides, point = 1 }) {
  // [當前張, 剛離開的那張] — 後者只用來決定「要演出場動畫還是直接歸位」。
  const [[index, exiting], setState] = useState([0, -1]);
  const [paused, setPaused] = useState(false);
  const count = slides?.length || 0;

  const go = useCallback(
    // wrap around for infinite loop
    (to) => setState(([i]) => [((to % count) + count) % count, i]),
    [count]
  );

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Autoplay — paused on hover, drag, or when the tab is hidden.
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setState(([i]) => [(i + 1) % count, i]);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  if (!count) return null; // 空資料防護（所有 hook 之後才 early-return，符合 hooks 規則）

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label={`POINT ${point} 課程亮點`}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); next(); }
        if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
      }}
    >
      <div className={styles.viewport}>
        {slides.map((s, i) => {
          const active = i === index;
          const leaving = !active && i === exiting;
          return (
            <motion.div
              key={i}
              className={styles.slide}
              style={{ zIndex: active ? 2 : 1 }}
              hidden={!active && !leaving}
              aria-hidden={!active}
              inert={active ? undefined : ""}
              initial={false}
              animate={
                active
                  ? { x: 0, opacity: 1 }
                  : { x: restingX(i, index, count, leaving), opacity: 0 }
              }
              transition={active || leaving ? GLIDE : INSTANT}
              drag={active ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragStart={() => setPaused(true)}
              onDragEnd={(_, info) => {
                setPaused(false);
                if (info.offset.x < -SWIPE_THRESHOLD) next();
                else if (info.offset.x > SWIPE_THRESHOLD) prev();
              }}
            >
              <PointSlide slide={s} index={i} total={count} point={point} />
            </motion.div>
          );
        })}

        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={prev}
          aria-label="上一張"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowRight}`}
          onClick={next}
          aria-label="下一張"
        >
          <ChevronRight size={22} strokeWidth={2.2} />
        </button>
      </div>

      <div className={styles.dots} role="tablist" aria-label="投影片導覽">
        {slides.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`第 ${i + 1} 張：${s.title}`}
            className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  );
}

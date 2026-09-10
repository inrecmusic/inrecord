"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import styles from "./InstructorBioCarousel.module.css";

const SWIPE_THRESHOLD = 50; // px dragged before a slide change commits

// 進場用；待命中的段落直接歸位（不需要動畫）
const GLIDE = { duration: 0.28, ease: "easeOut" };
const INSTANT = { duration: 0 };

/** 環狀待命位置：下一段停右邊（往前翻時從右滑入）、上一段停左邊。 */
function restingX(i, index, count) {
  const rel = (((i - index) % count) + count) % count;
  return rel <= count / 2 ? 28 : -28;
}

/**
 * Manual (no autoplay) carousel for the instructor bio paragraphs — one
 * paragraph per slide. Switched by horizontal swipe / drag (finger on mobile,
 * mouse on desktop), dot tabs, or arrow keys. No side button, so the text gets
 * the full column width. Autoplay is omitted on purpose (reading content).
 *
 * 三段簡歷全部留在 DOM（初始 HTML 就有完整文字，搜尋引擎／讀螢幕軟體讀得到），
 * 非當前段以 hidden（display:none）隱藏：不佔版面高度（維持原本只由當前段撐高）、
 * 也不會被 Tab 聚焦。`slides` is an array of nodes.
 */
export default function InstructorBioCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const count = slides?.length || 0;

  const go = useCallback(
    (to) => setIndex(((to % count) + count) % count),
    [count]
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  if (!count) return null; // empty-data guard, after hooks (hooks-rule safe)

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="講師介紹"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); next(); }
        if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
      }}
    >
      <div className={styles.viewport}>
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <motion.div
              key={i}
              className={styles.slide}
              hidden={!active}
              aria-hidden={!active}
              inert={active ? undefined : ""}
              initial={false}
              animate={
                active
                  ? { opacity: 1, x: 0 }
                  : { opacity: 0, x: restingX(i, index, count) }
              }
              transition={active ? GLIDE : INSTANT}
              drag={active ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => {
                if (info.offset.x < -SWIPE_THRESHOLD) next();
                else if (info.offset.x > SWIPE_THRESHOLD) prev();
              }}
            >
              {s}
            </motion.div>
          );
        })}
      </div>

      {count > 1 && (
        <div className={styles.dots} role="tablist" aria-label="段落導覽">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`第 ${i + 1} 段`}
              className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import styles from "./InstructorBioCarousel.module.css";

const SWIPE_THRESHOLD = 50; // px dragged before a slide change commits

/**
 * Manual (no autoplay) carousel for the instructor bio paragraphs — one
 * paragraph per slide. Switched by horizontal swipe / drag (finger on mobile,
 * mouse on desktop), dot tabs, or arrow keys. No side button, so the text gets
 * the full column width. Autoplay is omitted on purpose (reading content).
 *
 * Each slide is keyed by index and re-mounts on change (fades/slides in) — no
 * AnimatePresence/exit bookkeeping (its mode="wait"+drag combo previously left
 * the next slide unmounted). `slides` is an array of nodes.
 */
export default function InstructorBioCarousel({ slides }) {
  // [activeIndex, direction] — direction sets the enter x offset sign.
  const [[index, dir], setState] = useState([0, 0]);
  const count = slides?.length || 0;

  const go = useCallback(
    (next, direction) => setState([(next + count) % count, direction]),
    [count]
  );
  const next = useCallback(() => go(index + 1, 1), [go, index]);
  const prev = useCallback(() => go(index - 1, -1), [go, index]);

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
        <motion.div
          key={index}
          className={styles.slide}
          initial={{ opacity: 0, x: dir >= 0 ? 28 : -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={(_, info) => {
            if (info.offset.x < -SWIPE_THRESHOLD) next();
            else if (info.offset.x > SWIPE_THRESHOLD) prev();
          }}
        >
          {slides[index]}
        </motion.div>
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
              onClick={() => go(i, i > index ? 1 : -1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PointSlide from "./PointSlide";
import styles from "./PointCarousel.module.css";

const AUTOPLAY_MS = 4000;
const SWIPE_THRESHOLD = 60; // px dragged before a slide change commits

/**
 * Horizontal, auto-playing slide carousel for POINT 1.
 * Each slide is a self-contained 1120×480 SVG (title / progress / footer
 * already baked in), so the carousel only adds chrome: arrows, dots,
 * drag/keyboard navigation and the sliding transition.
 */
export default function PointCarousel({ slides }) {
  // [activeIndex, direction] — direction drives the enter/exit x offset.
  const [[index, dir], setState] = useState([0, 0]);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const go = useCallback(
    (next, direction) => {
      // wrap around for infinite loop
      const wrapped = (next + count) % count;
      setState([wrapped, direction]);
    },
    [count]
  );

  const next = useCallback(() => go(index + 1, 1), [go, index]);
  const prev = useCallback(() => go(index - 1, -1), [go, index]);

  // Autoplay — paused on hover, drag, or when the tab is hidden.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setState(([i]) => [(i + 1) % count, 1]);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  const variants = {
    enter: (d) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="POINT 1 課程亮點"
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
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={index}
            className={styles.slide}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 320, damping: 36 },
              opacity: { duration: 0.25 },
            }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragStart={() => setPaused(true)}
            onDragEnd={(_, info) => {
              setPaused(false);
              if (info.offset.x < -SWIPE_THRESHOLD) next();
              else if (info.offset.x > SWIPE_THRESHOLD) prev();
            }}
          >
            <PointSlide slide={slides[index]} index={index} total={count} />
          </motion.div>
        </AnimatePresence>

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
            onClick={() => go(i, i > index ? 1 : -1)}
          />
        ))}
      </div>
    </div>
  );
}

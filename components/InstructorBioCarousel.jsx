"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import styles from "./InstructorBioCarousel.module.css";

/**
 * Manual (no autoplay) carousel for the instructor bio paragraphs — one
 * paragraph per slide, advanced by a single forward button (loops back to the
 * first) or arrow keys. Autoplay is omitted on purpose: the slides are reading
 * content and flipping mid-sentence would fight the reader.
 *
 * Each slide is rendered in normal flow (auto height across breakpoints) and
 * keyed by index, so changing slide just re-mounts a fresh <motion.div> that
 * fades/slides in. We deliberately avoid `AnimatePresence mode="wait"`: it has
 * to wait for the outgoing slide's exit to fire onExitComplete before mounting
 * the next one, which here left the next paragraph unmounted (stuck on slide 1).
 * `slides` is an array of nodes.
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
        >
          {slides[index]}
        </motion.div>
      </div>

      {count > 1 && (
        <button
          type="button"
          className={styles.next}
          onClick={next}
          aria-label={`下一段（${index + 1}／${count}）`}
        >
          <ChevronRight size={20} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

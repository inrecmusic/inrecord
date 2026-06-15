"use client";

import { ChevronDown } from "lucide-react";
import styles from "./ChordTetris.module.css";

// Bottom row about to clear — the canon progression.
const ROW = ["C", "G", "Am", "Em", "F", "C", "F", "G"];
// Faint blocks still drifting down.
const GHOSTS = [
  { chord: "F", col: 1, top: 6 },
  { chord: "Em", col: 4, top: 0 },
  { chord: "G", col: 6, top: 12 },
];
const isMinor = (c) => c.endsWith("m");

/**
 * POINT 4 和弦俄羅斯 — 和弦方塊往下掉、拼滿一整行就消除，原生 DOM（no <img>）。
 */
export default function ChordTetris({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      <div className={styles.board}>
        {/* ghost blocks drifting down */}
        {GHOSTS.map((g, i) => (
          <span
            key={i}
            className={`${styles.cell} ${styles.ghost} ${isMinor(g.chord) ? styles.minor : ""}`}
            style={{ left: `calc(100% / 8 * ${g.col})`, top: `${g.top}%` }}
          >
            {g.chord}
          </span>
        ))}

        {/* active falling block */}
        <span className={styles.falling} style={{ left: `calc(100% / 8 * 2)` }}>
          <span className={`${styles.cell} ${styles.minor}`}>Am</span>
          <ChevronDown className={styles.arrow} size={16} strokeWidth={2.4} />
        </span>

        {/* completed bottom row (highlighted, about to clear) */}
        <div className={styles.clearRow}>
          {ROW.map((c, i) => (
            <span
              key={i}
              className={`${styles.cell} ${styles.solid} ${isMinor(c) ? styles.minor : ""}`}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <span className={styles.tag}>🧩 拼滿一整行就消除</span>
    </div>
  );
}

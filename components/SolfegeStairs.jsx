"use client";

import { Volume2, Zap, Check, Star } from "lucide-react";
import styles from "./SolfegeStairs.module.css";

// done = already climbed (brand + check); the rest are still ahead (tint).
const STEPS = [
  { label: "Do", done: true }, { label: "Re", done: true },
  { label: "Mi", done: true }, { label: "Fa", done: true },
  { label: "Sol" }, { label: "La" }, { label: "Si" },
];

/**
 * POINT 4 唱名階梯 — 聽音點對唱名、一階一階往上爬，原生 DOM（no <img>）。
 */
export default function SolfegeStairs({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      <div className={styles.head}>
        <span className={styles.q}>
          <Volume2 size={15} strokeWidth={2.2} /> 這是哪個唱名？
        </span>
        <span className={styles.combo}>
          <Zap size={13} strokeWidth={2.4} fill="currentColor" /> 連對 ×8
        </span>
      </div>

      <div className={styles.stairs}>
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            className={`${styles.step} ${s.done ? styles.done : ""}`}
            style={{ "--i": i }}
          >
            {i === STEPS.length - 1 && (
              <Star className={styles.star} size={18} strokeWidth={1.6} fill="currentColor" />
            )}
            <span className={styles.riser}>
              {s.done && <Check className={styles.check} size={12} strokeWidth={3} />}
            </span>
            <span className={styles.label}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

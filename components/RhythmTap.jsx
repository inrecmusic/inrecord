"use client";

import { Timer, Check } from "lucide-react";
import styles from "./RhythmTap.module.css";

// 0–4 beats; index 2 is the centred target ("準 / Perfect").
const BEATS = [
  { hit: true }, { hit: true, label: "搶拍" },
  { target: true, label: "準" },
  { label: "落拍" }, {},
];

/**
 * POINT 4 節奏打點 — 拍子落在正中圈就是 Perfect、不搶不拖，原生 DOM（no <img>）。
 */
export default function RhythmTap({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      <div className={styles.head}>
        <Timer size={15} strokeWidth={2.2} />
        <span>穩定節拍</span>
      </div>

      <div className={styles.track}>
        <span className={styles.line} aria-hidden="true" />
        {BEATS.map((b, i) => (
          <div key={i} className={styles.beat}>
            {b.target ? (
              <span className={styles.target}>
                <span className={styles.perfect}>Perfect！</span>
                <Check className={styles.targetCheck} size={13} strokeWidth={3} />
              </span>
            ) : (
              <span className={`${styles.dot} ${b.hit ? styles.hit : ""}`}>
                {b.hit && <Check size={11} strokeWidth={3} />}
              </span>
            )}
            <span className={`${styles.label} ${b.target ? styles.labelOn : ""}`}>
              {b.label || ""}
            </span>
          </div>
        ))}
      </div>

      <span className={styles.tag}>🎯 落在正中圈＝Perfect，不搶不拖</span>
    </div>
  );
}

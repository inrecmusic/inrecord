"use client";

import { Music } from "lucide-react";
import styles from "./StaffDuet.module.css";

// Right-hand melody — a gently rising/falling line (left%, top% on the staff).
const MELODY = [
  { l: 6, t: 70 }, { l: 19, t: 52 }, { l: 32, t: 60 }, { l: 45, t: 38 },
  { l: 58, t: 46 }, { l: 71, t: 24 }, { l: 84, t: 40 }, { l: 95, t: 30 },
];
// Left-hand chords — four navy triads (left%), each three stacked notes.
const CHORDS = [14, 38, 62, 86];

/**
 * POINT 3 左右手配合 — 右手旋律（藍）＋左手和弦（深藍）兩聲部五線譜，
 * 原生 DOM（no <img>）。圖示性質，傳達「兩手一合」的概念。
 */
export default function StaffDuet({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      <div className={styles.tag}>
        <Music size={14} strokeWidth={2} />
        <span>一小段《卡農》</span>
      </div>

      <div className={styles.voice}>
        <span className={`${styles.hand} ${styles.right}`}>右手 · 旋律</span>
        <div className={styles.staff}>
          {MELODY.map((n, i) => (
            <span
              key={i}
              className={`${styles.note} ${styles.noteRight}`}
              style={{ left: `${n.l}%`, top: `${n.t}%` }}
            />
          ))}
        </div>
      </div>

      <div className={styles.voice}>
        <span className={`${styles.hand} ${styles.left}`}>左手 · 和弦</span>
        <div className={styles.staff}>
          {CHORDS.map((l, i) => (
            <span key={i} className={styles.chordStack} style={{ left: `${l}%` }}>
              <span className={`${styles.note} ${styles.noteLeft}`} />
              <span className={`${styles.note} ${styles.noteLeft}`} />
              <span className={`${styles.note} ${styles.noteLeft}`} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

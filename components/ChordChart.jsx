"use client";

import styles from "./ChordChart.module.css";

// Two song sections; `cur` marks the chord currently being played.
const SECTIONS = [
  { label: "主歌", cells: [{ chord: "C", cur: true }, {}, { chord: "G" }, {}, { chord: "Am" }] },
  { label: "副歌", cells: [{ chord: "F" }, {}, { chord: "C" }, {}, { chord: "G" }] },
];

/**
 * POINT 5 看懂和弦譜 — 和弦標在歌詞上方，看著就能彈，原生 DOM（no <img>）。
 */
export default function ChordChart({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      {SECTIONS.map((s) => (
        <div key={s.label} className={styles.section}>
          <span className={styles.sectionLabel}>{s.label}</span>
          <div className={styles.line}>
            {s.cells.map((c, i) => (
              <div key={i} className={styles.cell}>
                <span className={styles.chordSlot}>
                  {c.chord && (
                    <span className={`${styles.chord} ${c.cur ? styles.cur : ""}`}>
                      {c.chord}
                    </span>
                  )}
                </span>
                <span className={`${styles.lyric} ${c.cur ? styles.lyricCur : ""}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

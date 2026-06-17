"use client";

import { ArrowRight } from "lucide-react";
import { playNote, WHITE_NOTES, BLACK } from "./PianoKeyboard";
import styles from "./HandsLevel.module.css";

const whiteX = (i) => `calc(100% / 7 * ${i + 0.5})`;
const blackX = (a) => `calc(100% / 7 * ${a + 1})`;

function MiniKeys({ dots }) {
  return (
    <div className={styles.keyboard}>
      <div className={styles.whites}>
        {WHITE_NOTES.map((note, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            aria-label={note}
            className={styles.white}
            onPointerDown={() => playNote(note)}
          />
        ))}
      </div>
      <div className={styles.blacks} aria-hidden="true">
        {BLACK.map((b) => (
          <button
            key={b.after}
            type="button"
            tabIndex={-1}
            className={styles.black}
            style={{ left: `calc(${blackX(b.after)} - (100% / 7 * 0.56) / 2)` }}
            onPointerDown={() => playNote(b.note)}
          />
        ))}
      </div>
      <div className={styles.dots} aria-hidden="true">
        {dots.map((d, i) => (
          <span
            key={i}
            className={`${styles.dot} ${d.left ? styles.dotLeft : ""}`}
            style={{ left: whiteX(d.white) }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * POINT 5 完整演奏 — 從單手旋律到雙手完整演奏，原生 DOM（no <img>）。
 */
export default function HandsLevel({ ariaLabel }) {
  return (
    <div className={styles.viz} role="group" aria-label={ariaLabel}>
      <div className={styles.stage}>
        <MiniKeys dots={[{ white: 4 }, { white: 5 }, { white: 6 }]} />
        <span className={styles.stageLabel}>單手</span>
      </div>

      <ArrowRight className={styles.arrow} size={26} strokeWidth={2.4} />

      <div className={styles.stage}>
        <MiniKeys
          dots={[
            { white: 0, left: true }, { white: 1, left: true },
            { white: 4 }, { white: 5 }, { white: 6 },
          ]}
        />
        <span className={styles.stageLabel}>雙手</span>
      </div>
    </div>
  );
}

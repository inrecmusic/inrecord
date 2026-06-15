"use client";

import { Zap, Check } from "lucide-react";
import { playNote, WHITE_NOTES, BLACK } from "./PianoKeyboard";
import styles from "./NoteFlash.module.css";

const blackX = (a) => `calc(100% / 7 * ${a + 1})`;
const ANSWERS = ["C", "D", "E", "F", "G"];

/**
 * POINT 4 音名快閃 — 鍵盤閃一鍵、限時選音名、連對衝連擊，原生 DOM（no <img>）。
 */
export default function NoteFlash({ ariaLabel }) {
  return (
    <div className={styles.viz} role="group" aria-label={ariaLabel}>
      <div className={styles.head}>
        <span className={styles.q}>這是哪個音？</span>
        <span className={styles.combo}>
          <Zap size={13} strokeWidth={2.4} fill="currentColor" /> 連對 ×12
        </span>
      </div>

      <div className={styles.keyboard}>
        <div className={styles.whites}>
          {WHITE_NOTES.map((note, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-label={note}
              className={`${styles.white} ${i === 0 ? styles.flash : ""}`}
              onPointerDown={() => playNote(note)}
            >
              {i === 0 && (
                <Zap className={styles.spark} size={16} strokeWidth={2.4} fill="currentColor" />
              )}
            </button>
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
      </div>

      <div className={styles.answers}>
        {ANSWERS.map((a, i) => (
          <span key={a} className={`${styles.answer} ${i === 0 ? styles.correct : ""}`}>
            {a}
            {i === 0 && <Check className={styles.check} size={13} strokeWidth={3} />}
          </span>
        ))}
      </div>
    </div>
  );
}

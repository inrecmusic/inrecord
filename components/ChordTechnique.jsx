"use client";

import { playNote } from "./PianoKeyboard";
import styles from "./ChordTechnique.module.css";

const CHORD = [
  { note: "C4", label: "C" },
  { note: "E4", label: "E" },
  { note: "G4", label: "G" },
];

/**
 * POINT 3 伴奏技法 — 柱式和弦 vs 分解和弦，原生 DOM（no <img>）。
 *  - mode "stack"  三音同時 → 一根「音柱」
 *  - mode "stairs" 三音逐一 → 上行階梯
 * 左側三顆和弦音可點擊發聲（共用 PianoKeyboard 音訊引擎）。
 */
export default function ChordTechnique({ mode = "stack", ariaLabel }) {
  const isStairs = mode === "stairs";

  return (
    <div className={styles.viz} role="group" aria-label={ariaLabel}>
      <div className={styles.row}>
        {/* 左：和弦三音 */}
        <div className={styles.input}>
          <div className={styles.notes}>
            {CHORD.map((c, i) => (
              <button
                key={c.label}
                type="button"
                tabIndex={-1}
                className={styles.note}
                onPointerDown={() => playNote(c.note)}
              >
                {c.label}
                {isStairs && <span className={styles.finger}>{i + 1}</span>}
              </button>
            ))}
          </div>
          <span className={styles.inputLabel}>
            {isStairs ? "逐音彈出" : "同時按下"}
          </span>
        </div>

        {/* 運算子 */}
        <span className={styles.op}>{isStairs ? "→" : "="}</span>

        {/* 右：音柱 / 階梯 */}
        <div className={styles.output}>
          {isStairs ? (
            <div className={styles.stairs}>
              {["C", "E", "G"].map((l, i) => (
                <span key={l} className={styles.step} style={{ "--i": i }}>
                  {l}
                </span>
              ))}
              <span className={styles.timeAxis}>時間 →</span>
            </div>
          ) : (
            <div className={styles.pillar}>
              <span className={styles.cap} />
              {["G", "E", "C"].map((l) => (
                <span key={l} className={styles.brick}>{l}</span>
              ))}
              <span className={styles.cap} />
            </div>
          )}
          <span className={styles.outputLabel}>
            {isStairs ? "拆成上行階梯" : "一根「音柱」"}
          </span>
        </div>
      </div>
    </div>
  );
}

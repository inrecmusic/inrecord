"use client";

import { playNote, WHITE_NOTES, BLACK } from "./PianoKeyboard";
import styles from "./ChordKeyboard.module.css";

// Centre of white key i (0–6) and of the black key sitting after white key `a`,
// expressed as a % of the keyboard width — mirrors PianoKeyboard's geometry so
// chord markers land exactly on the keys.
const whiteX = (i) => `calc(100% / 7 * ${i + 0.5})`;
const blackX = (a) => `calc(100% / 7 * ${a + 1})`;

/**
 * Interactive one-octave keyboard with chord annotations, rebuilt natively
 * (no <img>) to match POINT 1. Plays real samples on press via the shared
 * PianoKeyboard audio engine.
 *
 * Props:
 *  - variant     'major' | 'minor' | 'switch' — drives the dim overlay
 *  - tintKeys    white indices to highlight behind the chord notes
 *  - markers     [{ white, label, color, big? }] chord-note circles on keys
 *  - intervals   [{ from, to, label }] brackets above the keyboard (white idx)
 *  - badge       { text, color } pill, top-right ("× 12 個")
 *  - float       { after, label, color, target } a note lifted above the
 *                keyboard with a semitone arrow down to white key `target`
 *  - bottomLabels[{ white, text, color, strong? }] captions under the circles
 */
export default function ChordKeyboard({
  variant = "major",
  ariaLabel,
  tintKeys = [],
  markers = [],
  intervals = [],
  badge,
  float,
  bottomLabels = [],
}) {
  return (
    <div className={styles.viz}>
      {/* Top zone: interval brackets / floating note / count badge */}
      <div className={styles.top}>
        {intervals.map((iv, i) => {
          const left = whiteX(iv.from);
          const right = whiteX(iv.to);
          return (
            <div
              key={i}
              className={styles.bracket}
              style={{ left, width: `calc(${right} - ${left})` }}
            >
              <span className={styles.bracketLabel}>{iv.label}</span>
            </div>
          );
        })}

        {float && (
          <div
            className={styles.floatNote}
            style={{ left: blackX(float.after) }}
          >
            <span className={styles.floatTag} style={{ color: float.color }}>
              {float.tag}
            </span>
            <span
              className={styles.floatChip}
              style={{ background: float.color }}
            >
              {float.label}
            </span>
            <span className={styles.semitone}>半音</span>
          </div>
        )}

        {badge && (
          <span className={styles.badge} style={{ background: badge.color }}>
            {badge.text}
          </span>
        )}
      </div>

      {/* Keyboard + chord markers */}
      <div className={styles.kbWrap}>
        <div
          className={`${styles.keyboard} ${variant === "minor" ? styles.dim : ""}`}
          role="group"
          aria-label={ariaLabel}
        >
          <div className={styles.whites}>
            {WHITE_NOTES.map((note, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                aria-label={note}
                className={`${styles.white} ${tintKeys.includes(i) ? styles.tint : ""}`}
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
        </div>

        {/* dashed arrow from the floating note down to its target key */}
        {float && (
          <span
            className={styles.arrow}
            style={{ left: blackX(float.after) }}
            aria-hidden="true"
          />
        )}

        {/* chord-note circles sitting on the keys */}
        <div className={styles.markers} aria-hidden="true">
          {markers.map((m, i) => (
            <span
              key={i}
              className={`${styles.marker} ${m.big ? styles.markerBig : ""}`}
              style={{ left: whiteX(m.white), background: m.color }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom labels under the chord notes */}
      {bottomLabels.length > 0 && (
        <div className={styles.bottom} aria-hidden="true">
          {bottomLabels.map((b, i) => (
            <span
              key={i}
              className={`${styles.bottomLabel} ${b.strong ? styles.bottomStrong : ""}`}
              style={{ left: whiteX(b.white), color: b.color }}
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

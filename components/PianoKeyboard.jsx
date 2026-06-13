"use client";

import styles from "./PianoKeyboard.module.css";

// Real acoustic-grand-piano samples (FluidR3_GM, MIT). One octave, C4 → B4.
// White keys by position; black keys sit after white indices 0,1,3,4,5.
const WHITE_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"];
const BLACK = [
  { after: 0, note: "Db4" },
  { after: 1, note: "Eb4" },
  { after: 3, note: "Gb4" },
  { after: 4, note: "Ab4" },
  { after: 5, note: "Bb4" },
];
const ALL_NOTES = ["C4", "Db4", "D4", "Eb4", "E4", "F4", "Gb4", "G4", "Ab4", "A4", "Bb4", "B4"];
const SAMPLE_BASE = "/points/piano/";

// All audio state lives at module scope and is created lazily on the first
// user interaction — the page never fetches a sample or opens an AudioContext
// on load.
let audioCtx;
const buffers = new Map(); // note -> decoded AudioBuffer
const loading = new Map(); // note -> in-flight Promise (dedupe)
let prefetched = false;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = audioCtx || new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function loadNote(note) {
  if (buffers.has(note)) return Promise.resolve(buffers.get(note));
  if (loading.has(note)) return loading.get(note);
  const ctx = getCtx();
  if (!ctx) return Promise.reject(new Error("no audio"));
  const p = fetch(SAMPLE_BASE + note + ".mp3")
    .then((r) => r.arrayBuffer())
    .then((buf) => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
    .then((decoded) => {
      buffers.set(note, decoded);
      loading.delete(note);
      return decoded;
    })
    .catch((e) => {
      loading.delete(note);
      throw e;
    });
  loading.set(note, p);
  return p;
}

// After the first press, quietly warm the cache for the rest during idle time
// so subsequent keys play with zero latency without blocking anything.
function prefetchAll() {
  if (prefetched) return;
  prefetched = true;
  const run = () => ALL_NOTES.forEach((n) => loadNote(n).catch(() => {}));
  if (typeof window !== "undefined" && window.requestIdleCallback) {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 300);
  }
}

function playNote(note) {
  if (!note) return;
  const ctx = getCtx();
  if (!ctx) return;
  prefetchAll();
  loadNote(note)
    .then((buffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
    })
    .catch(() => {
      /* audio is a nice-to-have; never block interaction */
    });
}

/**
 * Interactive one-octave keyboard rebuilt natively (no <img>).
 * `keys` is 7 white keys: { label, active?, tint? }.
 * Press animation is pure CSS (:active) so playing keys never re-renders React.
 */
export default function PianoKeyboard({ keys, ariaLabel }) {
  return (
    <div className={styles.keyboard} role="group" aria-label={ariaLabel}>
      <div className={styles.whites}>
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            aria-label={k.label}
            className={`${styles.white} ${k.tint ? styles.tint : ""}`}
            onPointerDown={() => playNote(WHITE_NOTES[i])}
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
            style={{ left: `calc(100% / 7 * ${b.after + 1} - (100% / 7 * 0.56) / 2)` }}
            onPointerDown={() => playNote(b.note)}
          />
        ))}
      </div>

      <div className={styles.labels} aria-hidden="true">
        {keys.map((k, i) => (
          <span
            key={i}
            className={`${styles.badge} ${k.active ? styles.badgeActive : ""}`}
            style={{ left: `calc(100% / 7 * ${i + 0.5})` }}
          >
            {k.label}
          </span>
        ))}
      </div>
    </div>
  );
}

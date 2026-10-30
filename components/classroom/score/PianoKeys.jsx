"use client";
// components/classroom/score/PianoKeys.jsx — 螢幕虛擬鋼琴＋和弦辨識（照原型的鍵盤區與「和弦辨識」卡）
// 點按出聲（由 onNote 交給上層播放）；「用滑鼠點選組和弦」時點一下按住、再點一下放開；電腦鍵盤依 KEYMAP 彈奏。
// 播放中正在響的音由 activeMidis 亮鍵。輔助工具，不參與任何完成判定。
import { useEffect, useMemo, useState } from "react";
import { KEYMAP } from "@/lib/score/keymap";
import { recognizeChord, noteName } from "@/lib/score/chords";

const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const Ic = ({ d }) => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const IC_POINTER = '<path d="M6 3.5l12 7-5.3 1.6L9.8 17.5z"/>';
const IC_X = '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>';

export default function PianoKeys({ low = 36, high = 84, activeMidis, activeLH, onNote }) {
  const [latch, setLatch] = useState(false);
  const [held, setHeld] = useState(() => new Set());

  const keys = useMemo(() => {
    const whites = [];
    for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
    const w = 100 / whites.length;
    const out = [];
    let wi = 0;
    for (let m = low; m <= high; m++) {
      if (isBlack(m)) out.push({ m, black: true, left: wi * w - w * 0.32, width: w * 0.64 });
      else out.push({ m, black: false, left: wi++ * w, width: w });
    }
    return out;
  }, [low, high]);

  const press = (m) => {
    setHeld((s) => new Set(s).add(m));
    onNote?.(m);
  };
  const release = (m) =>
    setHeld((s) => {
      if (!s.has(m)) return s;
      const n = new Set(s);
      n.delete(m);
      return n;
    });

  const down = (m) => {
    if (latch) {
      if (held.has(m)) release(m);
      else press(m);
    } else press(m);
  };
  const up = (m) => {
    if (!latch) release(m);
  };

  useEffect(() => {
    const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const kd = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const m = KEYMAP[(e.key || "").toLowerCase()];
      if (m == null) return;
      e.preventDefault?.();
      press(m);
    };
    const ku = (e) => {
      const m = KEYMAP[(e.key || "").toLowerCase()];
      if (m != null && !latch) release(m);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // press/release 只用 setState 與 onNote
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latch, onNote]);

  const notes = [...held].sort((a, b) => a - b);
  const r = notes.length >= 3 ? recognizeChord(notes) : null;
  const big = !notes.length ? "—" : notes.length === 1 ? noteName(notes[0]) : r ? r.name : "?";
  const sub = !notes.length
    ? "按下鍵盤上的和弦，這裡會顯示是哪個和弦。"
    : notes.length === 1 ? "單音"
    : r ? `${r.zh} · ${r.inv}`
    : notes.length === 2 ? "再加一個音就能組成和弦" : "這組音不是常見的三和弦或七和弦";
  const active = activeMidis instanceof Set ? activeMidis : new Set(activeMidis || []);

  return (
    <section className="sv2-kbdzone">
      <div className="sv2-kbd-wrap">
        <div className="sv2-kbd" aria-label="虛擬鋼琴鍵盤" onPointerLeave={() => !latch && setHeld(new Set())}>
          {keys.map((k) => (
            <div
              key={k.m}
              data-m={k.m}
              className={`sv2-key ${k.black ? "b" : "w"}${held.has(k.m) ? " press" : ""}${active.has(k.m) ? (activeLH?.has(k.m) ? " is-now lh" : " is-now") : ""}`}
              style={{ left: `${k.left}%`, width: `${k.width}%` }}
              onPointerDown={(e) => {
                e.preventDefault?.();
                down(k.m);
              }}
              onPointerUp={() => up(k.m)}
            >
              {!k.black && k.m % 12 === 0 && <span className="lab">C{k.m / 12 - 1}</span>}
            </div>
          ))}
        </div>
      </div>
      <aside className="sv2-detect" aria-live="polite">
        <div className="lbl">和弦辨識</div>
        <div className="pk-big">{big}</div>
        <div className="sub">{sub}</div>
        <div className="tones">{notes.map((m) => noteName(m)).join(" ")}</div>
        <div className="row">
          <button type="button" className="tog" aria-pressed={latch} onClick={() => { setLatch((v) => !v); setHeld(new Set()); }}>
            <Ic d={IC_POINTER} />用滑鼠點選組和弦
          </button>
          <button type="button" className="btn" onClick={() => setHeld(new Set())}>
            <Ic d={IC_X} />清除
          </button>
        </div>
      </aside>
    </section>
  );
}

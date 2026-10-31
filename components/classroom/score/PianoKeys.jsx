"use client";
// components/classroom/score/PianoKeys.jsx — 螢幕虛擬鋼琴＋和弦辨識（照原型的鍵盤區與「和弦辨識」卡）
// 點按出聲（由 onNote 交給上層播放）；「用滑鼠點選組和弦」時點一下按住、再點一下放開；電腦鍵盤依 KEYMAP 彈奏。
// 播放中正在響的音由 activeMidis 亮鍵；滑過樂譜上的音或和弦時，對應的琴鍵由 hoverMidis 加外框。
// 滑過琴鍵顯示提示框（onKeyHover）；窄螢幕時鍵盤一開始捲到中央 C 一帶。輔助工具，不參與任何完成判定。
import { useEffect, useMemo, useRef, useState } from "react";
import { KEYMAP } from "@/lib/score/keymap";
import { recognizeChord } from "@/lib/score/chords";
import { detectText } from "@/lib/score/tip-content";

const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const Ic = ({ d }) => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const IC_POINTER = '<path d="M6 3.5l12 7-5.3 1.6L9.8 17.5z"/>';
const IC_X = '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>';

export default function PianoKeys({ low = 36, high = 84, activeMidis, activeLH, hoverMidis, onNote, onKeyHover }) {
  const [latch, setLatch] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const w = wrapRef.current;
    if (w) w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; // 原型：窄螢幕時中央 C 置中
  }, []);
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
  const { big, sub, tones } = detectText(notes, notes.length >= 3 ? recognizeChord(notes) : null);
  const active = activeMidis instanceof Set ? activeMidis : new Set(activeMidis || []);
  const hov = hoverMidis instanceof Set ? hoverMidis : new Set(hoverMidis || []);

  return (
    <section className="sv2-kbdzone">
      <div className="sv2-kbd-wrap" ref={wrapRef}>
        <div
          className="sv2-kbd"
          aria-label="虛擬鋼琴鍵盤"
          onPointerLeave={() => {
            if (!latch) setHeld(new Set());
            onKeyHover?.(null, null);
          }}
        >
          {keys.map((k) => (
            <div
              key={k.m}
              data-m={k.m}
              className={`sv2-key ${k.black ? "b" : "w"}${held.has(k.m) ? " press" : ""}${active.has(k.m) ? (activeLH?.has(k.m) ? " is-now lh" : " is-now") : ""}${hov.has(k.m) ? " hov" : ""}`}
              onPointerEnter={(e) => onKeyHover?.(k.m, e.currentTarget.getBoundingClientRect())}
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
        <div className="tones">{tones}</div>
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

"use client";
// components/classroom/score/ScoreTip.jsx — 音符／和弦提示框（照原型 .tip；和弦附兩個八度的小鍵盤圖，原型 chordTip）
// target：{ kind:'note', note, chord, key, rect } | { kind:'chord', chord, key, rect } | null
import { pitchName, jianpuDigit, chordZh, romanOf, chordTones, noteName } from "@/lib/score/chords";
import { durationLabel } from "@/lib/score/keymap";

const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const oct = (n) => (Math.abs(n) > 1 ? Math.abs(n) : "");
const jpText = (d) => `${d.acc}${d.digit}${d.octave > 0 ? `（高${oct(d.octave)}八度）` : d.octave < 0 ? `（低${oct(d.octave)}八度）` : ""}`;

function ChordDiagram({ tones, bassMidi }) {
  const on = new Set(tones);
  const kw = 17, h = 74, bh = 44, w = kw * 14;
  const whites = [], blacks = [];
  let wi = 0;
  for (let m = 60; m < 84; m++) {
    if (isBlack(m)) blacks.push([m, wi]);
    else whites.push([m, wi++]);
  }
  return (
    <svg width={w + 2} height={h + 2} viewBox={`-1 -1 ${w + 2} ${h + 2}`} aria-hidden="true" className="diag">
      {whites.map(([m, i]) => (
        <g key={m}>
          <rect className="wk" x={i * kw} y="0" width={kw} height={h} rx="2" />
          {on.has(m) && <circle className={m === bassMidi ? "bs" : "on"} cx={i * kw + kw / 2} cy={h - 12} r="6" />}
        </g>
      ))}
      {blacks.map(([m, i]) => (
        <g key={m}>
          <rect className="bk" x={i * kw - kw * 0.32} y="0" width={kw * 0.64} height={bh} rx="1.5" />
          {on.has(m) && <circle className={m === bassMidi ? "bs" : "on"} cx={i * kw} cy={bh - 8} r="4.6" />}
        </g>
      ))}
    </svg>
  );
}

export function chordLine(chord, key) {
  return `${chord.name}（${romanOf(chord, key)}）`;
}

export default function ScoreTip({ target }) {
  if (!target?.rect) return null;
  const { rect } = target;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const below = rect.bottom + 150 < vh;
  const style = {
    left: Math.min(Math.max(rect.left + rect.width / 2, 130), vw - 130),
    top: below ? rect.bottom + 8 : rect.top - 8,
    transform: below ? "translateX(-50%)" : "translate(-50%, -100%)",
  };

  if (target.kind === "chord") {
    const { chord, key } = target;
    // 原位組成音放在 C4 一帶；slash 和弦的低音以橘色標出
    const raw = chordTones(chord);
    const hasBass = chord.bass && raw.length > 0 && raw[0] < 48;
    const upper = (hasBass ? raw.slice(1) : raw).map((m) => m + 12);
    const bassMidi = hasBass ? 60 + (raw[0] % 12) : null;
    const shown = hasBass ? [bassMidi, ...upper] : upper;
    return (
      <div className="sv2-tip" role="tooltip" style={style}>
        <div className="tn">{chord.name} {chordZh(chord)} · {romanOf(chord, key)}</div>
        <ChordDiagram tones={shown} bassMidi={bassMidi} />
        <div className="ts">組成音：{raw.map((m) => noteName(m, key)).join(" ")}{hasBass ? "　橘色＝低音" : ""}</div>
      </div>
    );
  }

  const { note, chord, key } = target;
  return (
    <div className="sv2-tip" role="tooltip" style={style}>
      {note.rest ? (
        <div className="tn">休止符</div>
      ) : (
        <div className="tn">{pitchName(note.pitch)} · 簡譜 {jpText(jianpuDigit(note.pitch, key))}</div>
      )}
      <div className="ts">{note.staff === 1 ? "右手" : "左手"} · {durationLabel(note)}</div>
      {chord && <div className="ts">這一拍的和弦：{chordLine(chord, key)}</div>}
    </div>
  );
}

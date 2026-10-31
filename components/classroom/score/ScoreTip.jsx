"use client";
// components/classroom/score/ScoreTip.jsx — 提示框（照原型 .tip）
// 音符／琴鍵：迷你五線譜＋迷你簡譜，標題「G4 · Sol · 5」、副標「右手 · 四分音符」（原型 evTip／tipHTML）；
// 和弦：兩個八度的小鍵盤，根音橘色、白鍵圈上寫簡譜數字，底下「原位：… · 簡譜 … ● 根音」（原型 chordTip）。
// target：{ kind:'note', note, key, rect } | { kind:'key', midi, rect } | { kind:'chord', chord, key, rect } | null
import { noteTip, keyTip, chordTip, miniStaffSvg, miniJianpuSvg } from "@/lib/score/tip-content";

const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

function ChordDiagram({ tones, root, digits }) {
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
          {on.has(m) && (
            <>
              <circle className={m === root ? "bs" : "on"} cx={i * kw + kw / 2} cy={h - 12} r="6" />
              <text x={i * kw + kw / 2} y={h - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{(digits.get(m) || "").replace(/[♯♭]/g, "")}</text>
            </>
          )}
        </g>
      ))}
      {blacks.map(([m, i]) => (
        <g key={m}>
          <rect className="bk" x={i * kw - kw * 0.32} y="0" width={kw * 0.64} height={bh} rx="1.5" />
          {on.has(m) && <circle className={m === root ? "bs" : "on"} cx={i * kw} cy={bh - 8} r="4.6" />}
        </g>
      ))}
    </svg>
  );
}

function Pair({ pitch, clef, keySig }) {
  return (
    <>
      <div className="pair">
        <span dangerouslySetInnerHTML={{ __html: miniStaffSvg(pitch, clef) }} />
        <span dangerouslySetInnerHTML={{ __html: miniJianpuSvg(pitch, keySig) }} />
      </div>
      <div className="lbls"><span>五線譜</span><span>簡譜</span></div>
    </>
  );
}

export default function ScoreTip({ target }) {
  if (!target?.rect) return null;
  const { rect } = target;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  // 原型：優先放在上方，上面放不下才放下方
  const above = rect.top > 190 || rect.bottom + 190 > vh;
  const style = {
    left: Math.min(Math.max(rect.left + rect.width / 2, 130), vw - 130),
    top: above ? rect.top - 10 : rect.bottom + 10,
    transform: above ? "translate(-50%, -100%)" : "translateX(-50%)",
  };

  if (target.kind === "chord") {
    const t = chordTip(target.chord, target.key);
    return (
      <div className="sv2-tip" role="tooltip" style={style}>
        <div className="tn">{t.title}</div>
        {t.tones.length > 0 && <ChordDiagram tones={t.tones} root={t.root} digits={t.digits} />}
        <div className="ts">{t.foot}{t.tones.length > 0 && <>　<span style={{ color: "var(--lh)" }}>●</span> 根音</>}</div>
      </div>
    );
  }

  const t = target.kind === "key" ? keyTip(target.midi) : noteTip(target.note, target.key);
  const clef = target.kind === "key" ? (target.midi >= 60 ? "T" : "B") : target.note.staff === 2 ? "B" : "T";
  const keySig = target.kind === "key" ? { fifths: 0 } : target.key;
  return (
    <div className="sv2-tip" role="tooltip" style={style}>
      {t.pitch && <Pair pitch={t.pitch} clef={clef} keySig={keySig} />}
      <div className="tn">{t.title}</div>
      <div className="ts">{t.sub}</div>
    </div>
  );
}

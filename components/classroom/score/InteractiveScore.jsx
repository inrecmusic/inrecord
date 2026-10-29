"use client";
// components/classroom/score/InteractiveScore.jsx — 互動樂譜 v2（雙手 MusicXML）：學員播放頁「樂譜」分頁與後台預覽共用
//
// 單一來源：parseMusicXml 出的模型同時餵給五線譜（OSMD）、雙行簡譜、播放時間軸，三處共用音符 id，
// 播放時 activeIdsAt 算出的 id 同時亮五線譜、簡譜與鍵盤。版面、控制列分組、圖示照原型
// （docs/superpowers/specs/assets/2026-10-29-score-prototype.html）；拿掉「左手伴奏」「節奏斜線」，
// 「顯示左手」改成「只看右手」。任何設定改變都先停止播放，聲音與畫面才不會對不上。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseMusicXml } from "@/lib/score/musicxml";
import { buildPlayback, DEFAULT_BPM } from "@/lib/score/timeline";
import { chordAt } from "@/lib/score/chords";
import StaffView from "./StaffView";
import JianpuView from "./JianpuView";
import ScoreTip from "./ScoreTip";
import PianoKeys from "./PianoKeys";
import { createPianoSampler } from "./pianoSampler";
import { createGrandPlayer } from "./grandPlayer";
import { SCORE_V2_CSS } from "./score-css";

const VIEW_KEY = "inrec-score2-view";
const KEY_NAMES = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];

const F = 'fill="currentColor" stroke="none"';
const ICONS = {
  staff: `<path d="M3 5.5h18M3 9.5h18M3 13.5h18M3 17.5h18"/><ellipse cx="14" cy="15.5" rx="2.7" ry="2" ${F}/><path d="M16.6 15.3V4"/>`,
  jianpu: `<text x="12" y="16.3" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="-0.5" font-family="-apple-system,system-ui,sans-serif" ${F}>123</text>`,
  both: '<rect x="4" y="3.5" width="16" height="7" rx="2"/><rect x="4" y="13.5" width="16" height="7" rx="2"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  cname: `<text x="12" y="18.5" text-anchor="middle" font-size="19" font-weight="700" font-family="-apple-system,system-ui,sans-serif" ${F}>C</text>`,
  roman: `<text x="12" y="17.5" text-anchor="middle" font-size="15" font-weight="700" font-family="Georgia,serif" ${F}>IV</text>`,
  cboth: `<text x="12" y="16.5" text-anchor="middle" font-size="12" letter-spacing="-0.5" font-weight="700" font-family="-apple-system,system-ui,sans-serif" ${F}>C·I</text>`,
  play: `<path d="M7.5 4.5v15l12-7.5z" ${F}/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="2.5" ${F}/>`,
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
  metro: '<path d="M8.5 3h7l3.5 18H5z"/><path d="M12 15l5-9"/><path d="M6.5 16h11"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  repeat: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19l-3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5l3 3"/>',
  print: '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7 13.5h10v7H7z"/>',
};
const Ic = ({ n }) => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[n] || "" }} />
);
const Seg = ({ items, value, onChange }) => (
  <div className="seg">
    {items.map(([v, label, icon]) => (
      <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
        <Ic n={icon} />{label}
      </button>
    ))}
  </div>
);
const Tog = ({ on, onClick, icon, className = "", children }) => (
  <button type="button" className={`tog ${className}`} aria-pressed={!!on} onClick={onClick}>
    <Ic n={icon} />{children}
  </button>
);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export default function InteractiveScore({ xml, title, subtitle }) {
  const parsed = useMemo(() => {
    try {
      return { model: parseMusicXml(xml), error: null };
    } catch (e) {
      return { model: null, error: e };
    }
  }, [xml]);
  const model = parsed.model;

  const [view, setView] = useState("staff");
  const [rightHandOnly, setRightHandOnly] = useState(false);
  const [chordMode, setChordMode] = useState("name");
  const [showChords, setShowChords] = useState(true);
  const [bpm, setBpm] = useState(() => Math.max(40, Math.min(160, Math.round(model?.tempo ?? DEFAULT_BPM))));
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);
  const [hands, setHands] = useState({ rh: true, lh: true });
  const [loopOn, setLoopOn] = useState(false);
  const [loopFrom, setLoopFrom] = useState(0);
  const [loopTo, setLoopTo] = useState(Math.max(0, (model?.measures.length || 1) - 1));
  const [playing, setPlaying] = useState(false);
  const [activeIds, setActiveIds] = useState(() => new Set());
  const [tip, setTip] = useState(null);
  const [msg, setMsg] = useState("");
  const [width, setWidth] = useState(760);

  const paperRef = useRef(null);
  const samplerRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "staff" || v === "jianpu" || v === "both") setView(v);
    } catch {
      /* 無痕模式等 */
    }
  }, []);
  const setViewPersist = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 無痕模式等 */
    }
  };

  // 換曲時速度與循環範圍回到該曲預設
  useEffect(() => {
    if (!model) return;
    setBpm(Math.max(40, Math.min(160, Math.round(model.tempo ?? DEFAULT_BPM))));
    setLoopFrom(0);
    setLoopTo(Math.max(0, model.measures.length - 1));
  }, [model]);

  useEffect(() => {
    const el = paperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 760));
    ro.observe(el);
    setWidth(el.clientWidth || 760);
    return () => ro.disconnect();
  }, [model]);

  // 播放器（一個元件一組；卸載時釋放）
  useEffect(() => {
    const sampler = createPianoSampler();
    const player = createGrandPlayer(sampler);
    samplerRef.current = sampler;
    playerRef.current = player;
    const offTick = player.onTick((ids) => setActiveIds((prev) => (sameSet(prev, ids) ? prev : ids)));
    const offEnd = player.onEnd(() => {
      setPlaying(false);
      setActiveIds(new Set());
    });
    return () => {
      offTick?.();
      offEnd?.();
      player.dispose();
    };
  }, []);

  const playback = useMemo(
    () =>
      model
        ? buildPlayback(model, {
            bpm, hands, countIn, metronome,
            loop: loopOn ? { from: Math.min(loopFrom, loopTo), to: Math.max(loopFrom, loopTo) } : null,
          })
        : null,
    [model, bpm, hands, countIn, metronome, loopOn, loopFrom, loopTo],
  );

  // 任何設定改變（速度、手、循環、譜面…）先停止
  useEffect(() => {
    playerRef.current?.stop();
    setPlaying(false);
    setActiveIds(new Set());
  }, [playback, view, rightHandOnly]);

  const togglePlay = useCallback(async () => {
    const p = playerRef.current;
    if (!p || !playback) return;
    if (playing) {
      p.stop();
      setPlaying(false);
      setActiveIds(new Set());
      return;
    }
    p.load(playback, { repeat: loopOn });
    setMsg("");
    const ok = await p.play();
    if (!ok) {
      setMsg("這個瀏覽器不支援播放，樂譜仍可正常觀看");
      return;
    }
    setPlaying(true);
  }, [playback, playing, loopOn]);

  const noteById = useMemo(() => new Map((model?.notes || []).map((n) => [n.id, n])), [model]);
  const chordById = useMemo(() => new Map((model?.chords || []).map((c) => [c.id, c])), [model]);
  const activeMidis = useMemo(() => {
    const s = new Set();
    for (const id of activeIds) {
      const n = noteById.get(id);
      if (n?.midi != null) s.add(n.midi);
    }
    return s;
  }, [activeIds, noteById]);

  const onNoteHover = useCallback(
    (id, rect) => {
      const note = id && noteById.get(id);
      if (!note || !rect) return setTip(null);
      setTip({ kind: "note", note, chord: chordAt(model, note.measure, note.onset), key: model.measures[note.measure].key, rect });
    },
    [noteById, model],
  );
  const onChordHover = useCallback(
    (id, rect) => {
      const chord = id && chordById.get(id);
      if (!chord || !rect) return setTip((t) => (t?.kind === "chord" ? null : t));
      setTip({ kind: "chord", chord, key: model.measures[chord.measure].key, rect });
    },
    [chordById, model],
  );

  const playNote = useCallback((m) => {
    const s = samplerRef.current;
    const ctx = s?.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    s.load([m]);
    s.play(m, ctx.currentTime + 0.01, 0.9);
  }, []);

  if (!model) {
    console.error("[InteractiveScore] 解析失敗", parsed.error);
    return (
      <div className="score-v2">
        <style dangerouslySetInnerHTML={{ __html: SCORE_V2_CSS }} />
        <div className="sv2-paper">
          <p className="sv2-msg err">這份樂譜讀不出來，請通知客服。</p>
        </div>
      </div>
    );
  }

  const first = model.measures[0];
  const firstFull = model.measures.find((m) => !m.implicit) || first;
  const keyLabel = `1=${KEY_NAMES[first.key.fifths + 7]}　${firstFull.time.beats}/${firstFull.time.beatType}`;
  const credit = subtitle || model.composer || "";
  const chordProps = { rightHandOnly, chordMode, showChords: model.hasChords && showChords, activeIds };
  const measureOptions = model.measures.map((m) => (
    <option key={m.index} value={m.index}>
      {m.implicit && m.index === 0 ? "弱起小節" : `第 ${m.number} 小節`}
    </option>
  ));

  return (
    <div className="score-v2">
      <style dangerouslySetInnerHTML={{ __html: SCORE_V2_CSS }} />

      <section className="sv2-controls" aria-label="琴譜設定">
        <div className="group">
          <span className="glabel">譜面</span>
          <Seg value={view} onChange={setViewPersist} items={[["staff", "五線譜", "staff"], ["jianpu", "簡譜", "jianpu"], ["both", "對照", "both"]]} />
          <Tog on={rightHandOnly} onClick={() => setRightHandOnly((v) => !v)} icon="eye">只看右手</Tog>
        </div>
        {model.hasChords && (
          <div className="group">
            <span className="glabel">和弦標示</span>
            <Seg value={chordMode} onChange={setChordMode} items={[["name", "和弦名", "cname"], ["roman", "級數", "roman"], ["both", "兩者", "cboth"]]} />
            <Tog on={showChords} onClick={() => setShowChords((v) => !v)} icon="eye">顯示</Tog>
          </div>
        )}
        <div className="group">
          <span className="glabel">播放</span>
          <button type="button" className="play" onClick={togglePlay}>
            <Ic n={playing ? "stop" : "play"} />
            {playing ? "停止" : "播放"}
          </button>
          <label className="tempo">
            <Ic n="gauge" />速度
            <input type="range" min="40" max="160" step="2" value={bpm} aria-label="速度" onChange={(e) => setBpm(Number(e.target.value))} />
            <span>{bpm}</span>
          </label>
          <Tog on={metronome} onClick={() => setMetronome((v) => !v)} icon="metro">節拍器</Tog>
          <Tog on={countIn} onClick={() => setCountIn((v) => !v)} icon="timer">預備拍</Tog>
          <Tog on={hands.rh} className="rh" onClick={() => setHands((h) => ({ ...h, rh: !h.rh }))} icon="speaker">右手</Tog>
          <Tog on={hands.lh} className="lh" onClick={() => setHands((h) => ({ ...h, lh: !h.lh }))} icon="speaker">左手</Tog>
        </div>
        <div className="group">
          <span className="glabel">A-B 循環</span>
          <Tog on={loopOn} onClick={() => setLoopOn((v) => !v)} icon="repeat">循環</Tog>
          <select aria-label="循環起點小節" value={loopFrom} onChange={(e) => { const v = Number(e.target.value); setLoopFrom(v); if (v > loopTo) setLoopTo(v); }}>
            {measureOptions}
          </select>
          <span>到</span>
          <select aria-label="循環終點小節" value={loopTo} onChange={(e) => { const v = Number(e.target.value); setLoopTo(v); if (v < loopFrom) setLoopFrom(v); }}>
            {measureOptions}
          </select>
        </div>
        <div className="group">
          <button type="button" className="btn" onClick={() => window.print()}>
            <Ic n="print" />列印
          </button>
        </div>
      </section>

      <section className="sv2-paper" aria-label="琴譜" ref={paperRef}>
        <div className="sv2-head">
          <div className="sh-left">
            <div className="keysig">{keyLabel}</div>
            <div className="bpm">♩ = {model.tempo ? Math.round(model.tempo) : DEFAULT_BPM}</div>
          </div>
          <h2>{title || model.title}</h2>
          <div className="sh-right">{credit}</div>
        </div>
        <div className={`sv2-msg${msg ? " err" : ""}`} aria-live="polite">{msg}</div>
        {(view === "staff" || view === "both") && (
          <div className="sv2-section">
            <StaffView xml={xml} model={model} {...chordProps} onNoteHover={onNoteHover} />
          </div>
        )}
        {(view === "jianpu" || view === "both") && (
          <div className="sv2-section">
            <JianpuView model={model} width={width - 36} {...chordProps} onNoteHover={onNoteHover} onChordHover={onChordHover} />
          </div>
        )}
        <p className="sv2-credit">鋼琴音色：FluidR3_GM（Frank Wen），CC BY 3.0</p>
      </section>

      <PianoKeys low={36} high={84} activeMidis={activeMidis} onNote={playNote} />
      <ScoreTip target={tip} />
    </div>
  );
}

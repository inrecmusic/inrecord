"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseAbc } from "@/lib/score/abc";
import { renderJianpu } from "@/lib/score/jianpu";
import { buildTimeline, noteAt } from "@/lib/score/playback";
import { createScorePlayer } from "./scorePlayer";

const F = `var(--type-body)`;
const VIEW_KEY = "inrec-score-view";
const RATES = [0.6, 0.8, 1];

// 和弦關掉時，五線譜也要跟著不顯示 → 把 ABC 裡的和弦記號拿掉再交給 abcjs
// （^ _ @ < > 開頭的引號內容是註記位置，不是和弦，保留）
const stripChords = (abc) => String(abc || "").replace(/"(?![\^_@<>])[^"\n]*"/g, "");

export default function ScoreTab({ token, video }) {
  const [scores, setScores] = useState(null);   // null=載入中、[]=這個單元沒有樂譜
  const [pick, setPick] = useState(0);
  const [view, setView] = useState("staff");
  const [chords, setChords] = useState(true);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [width, setWidth] = useState(720);
  const [abcReady, setAbcReady] = useState(false);
  const [err, setErr] = useState("");

  const boxRef = useRef(null);
  const staffRef = useRef(null);
  const abcjsRef = useRef(null);
  const playerRef = useRef(null);

  /* 讀取這個單元的樂譜 */
  useEffect(() => {
    if (!token || !video?.id) return;
    let alive = true;
    setScores(null); setPick(0); setErr("");
    fetch(`/api/classroom/scores?video_id=${video.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { scores: [] }))
      .then((d) => { if (alive) setScores(d.scores || []); })
      .catch(() => { if (alive) setScores([]); });
    return () => { alive = false; };
  }, [token, video?.id]);

  /* 記住上次選的譜別；abcjs 只在真的要畫五線譜時才載入（約 0.5MB，不進首屏） */
  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "jianpu" || v === "staff") setView(v); } catch {}
  }, []);
  useEffect(() => {
    let alive = true;
    import("abcjs").then((m) => { if (alive) { abcjsRef.current = m.default || m; setAbcReady(true); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  /* 容器寬度（簡譜每行幾小節、五線譜換行都靠它） */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 720));
    ro.observe(el);
    setWidth(el.clientWidth || 720);
    return () => ro.disconnect();
  }, [scores]);

  const current = scores?.[pick] || null;
  const model = useMemo(() => {
    if (!current) return null;
    try { return parseAbc(current.abc); } catch (e) { setErr(e.message || "樂譜讀取失敗"); return null; }
  }, [current]);

  const timeline = useMemo(() => (model ? buildTimeline(model, { rate }) : null), [model, rate]);
  const jianpu = useMemo(
    () => (model && view === "jianpu" ? renderJianpu(model, { width: Math.max(280, width - 8), showChords: chords }) : null),
    [model, view, width, chords]
  );

  /* 五線譜：同一份 ABC 交給 abcjs 畫 */
  useEffect(() => {
    if (view !== "staff" || !abcReady || !current || !staffRef.current) return;
    try {
      abcjsRef.current.renderAbc(staffRef.current, chords ? current.abc : stripChords(current.abc), {
        responsive: "resize", staffwidth: Math.max(260, width - 20), paddingleft: 0, paddingright: 0, paddingtop: 4,
      });
    } catch { setErr("五線譜繪製失敗，可以先切到簡譜"); }
  }, [view, abcReady, current, chords, width]);

  /* 播放器 */
  useEffect(() => {
    const p = createScorePlayer();
    playerRef.current = p;
    p.onTick((t) => setCursor(noteAt(p._evs || [], t)));
    return () => p.dispose();
  }, []);
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !timeline) return;
    p.load(timeline);
    p._evs = timeline.events;
    p.onTick((t) => setCursor(noteAt(timeline.events, t)));
    p.onEnd(() => { setPlaying(false); setCursor(-1); });
  }, [timeline]);
  // 換譜、換檢視、換速度都先停下來，不然聲音會和畫面對不上
  useEffect(() => { playerRef.current?.stop(); setPlaying(false); setCursor(-1); }, [pick, rate]);

  const togglePlay = useCallback(async () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) { p.stop(); setPlaying(false); setCursor(-1); return; }
    const ok = await p.play(0);
    if (!ok) { setErr("這個瀏覽器不支援播放，樂譜仍可正常觀看"); return; }
    setPlaying(true);
  }, [playing]);

  /* 高亮：兩種譜共用同一組音符編號 */
  useEffect(() => {
    const root = boxRef.current;
    if (!root) return;
    root.querySelectorAll(".is-now").forEach((el) => el.classList.remove("is-now"));
    if (cursor < 0) return;
    if (view === "jianpu") root.querySelector(`[data-idx="${cursor}"]`)?.classList.add("is-now");
    else {
      const notes = root.querySelectorAll("#score-staff .abcjs-note");
      notes[cursor]?.classList.add("is-now");
    }
  }, [cursor, view]);

  const setViewPersist = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} };

  if (scores === null) return <p style={{ color: "#64748b", fontSize: 14, fontFamily: F }}>樂譜載入中…</p>;
  if (!scores.length) return <p style={{ color: "#64748b", fontSize: 14, fontFamily: F }}>這個單元還沒有樂譜。</p>;

  return (
    <div style={{ fontFamily: F }} className="score-tab">
      <style>{SCORE_CSS}</style>

      {scores.length > 1 && (
        <div className="sc-pickers">
          {scores.map((s, i) => (
            <button key={s.id} type="button" onClick={() => setPick(i)} className={"sc-pick" + (i === pick ? " on" : "")}>{s.title}</button>
          ))}
        </div>
      )}

      <div className="sc-bar">
        <div className="sc-title">
          {current?.title}
          {current?.subtitle && <small>{current.subtitle}</small>}
        </div>
        <div className="sc-tabs" role="tablist" aria-label="樂譜種類">
          <button role="tab" aria-selected={view === "staff"} onClick={() => setViewPersist("staff")}>五線譜</button>
          <button role="tab" aria-selected={view === "jianpu"} onClick={() => setViewPersist("jianpu")}>簡譜</button>
        </div>
        <label className="sc-check"><input type="checkbox" checked={chords} onChange={(e) => setChords(e.target.checked)} />顯示和弦</label>
      </div>

      <div className="sc-play">
        <button type="button" className={"sc-btn" + (playing ? " on" : "")} onClick={togglePlay} aria-label={playing ? "停止跟奏" : "播放跟奏"}>
          {playing ? "■ 停止" : "▶ 跟奏"}
        </button>
        <div className="sc-rates" role="group" aria-label="播放速度">
          {RATES.map((r) => (
            <button key={r} type="button" className={r === rate ? "on" : ""} onClick={() => setRate(r)}>{Math.round(r * 100)}%</button>
          ))}
        </div>
        <span className="sc-hint">只有右手旋律，左手請照和弦自己配伴奏。</span>
        <button type="button" className="sc-print" onClick={() => window.print()}>列印</button>
      </div>

      {err && <p className="sc-err">{err}</p>}

      <div className="sc-paper" ref={boxRef}>
        <div id="score-staff" ref={staffRef} hidden={view !== "staff"} />
        {view === "jianpu" && <div className="sc-jp" dangerouslySetInnerHTML={{ __html: jianpu?.svg || "" }} />}
        {view === "staff" && !abcReady && <p style={{ color: "#94a3b8", fontSize: 13 }}>五線譜載入中…</p>}
      </div>
    </div>
  );
}

const SCORE_CSS = `
.score-tab{--sc-ink:#0f172a;--sc-line:#e2e8f0;--sc-accent:#2563eb;--score-chord:#1e3a8a;--score-finger:#9a5b00}
.score-tab .sc-pickers{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.score-tab .sc-pick{border:1px solid var(--sc-line);background:#fff;color:#475569;font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;cursor:pointer}
.score-tab .sc-pick.on{background:var(--sc-accent);border-color:var(--sc-accent);color:#fff;font-weight:700}
.score-tab .sc-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.score-tab .sc-title{font-size:16px;font-weight:700;color:var(--sc-ink);margin-right:auto}
.score-tab .sc-title small{font-weight:400;color:#64748b;font-size:13px;margin-left:8px}
.score-tab .sc-tabs{display:inline-flex;background:#eef1f6;border-radius:999px;padding:3px}
.score-tab .sc-tabs button{border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:#475569;padding:7px 16px;border-radius:999px;cursor:pointer;min-height:38px}
.score-tab .sc-tabs button[aria-selected="true"]{background:var(--sc-accent);color:#fff}
.score-tab .sc-check{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#475569;cursor:pointer}
.score-tab .sc-play{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.score-tab .sc-btn{border:1px solid var(--sc-accent);background:var(--sc-accent);color:#fff;font:inherit;font-size:14px;font-weight:700;padding:8px 18px;border-radius:999px;cursor:pointer;min-height:40px}
.score-tab .sc-btn.on{background:#0f172a;border-color:#0f172a}
.score-tab .sc-rates{display:inline-flex;border:1px solid var(--sc-line);border-radius:999px;overflow:hidden}
.score-tab .sc-rates button{border:0;background:#fff;font:inherit;font-size:13px;color:#475569;padding:7px 12px;cursor:pointer;min-height:38px}
.score-tab .sc-rates button.on{background:#eef2ff;color:var(--sc-accent);font-weight:700}
.score-tab .sc-hint{font-size:12.5px;color:#94a3b8}
.score-tab .sc-print{margin-left:auto;border:1px solid var(--sc-line);background:#fff;color:#475569;font:inherit;font-size:13px;padding:7px 14px;border-radius:8px;cursor:pointer}
.score-tab .sc-err{color:#b45309;font-size:13px;margin:0 0 10px}
.score-tab .sc-paper{background:#fff;border:1px solid var(--sc-line);border-radius:12px;padding:14px 10px;overflow-x:auto;color:var(--sc-ink)}
.score-tab .sc-jp svg{display:block;max-width:100%}
.score-tab .abcjs-note.is-now path,.score-tab .abcjs-note.is-now{fill:var(--sc-accent)}
.score-tab .jp-note.is-now text{fill:var(--sc-accent)}
.score-tab .jp-note.is-now circle,.score-tab .jp-note.is-now line{stroke:var(--sc-accent);fill:var(--sc-accent)}
@media print{
  body *{visibility:hidden}
  .score-tab .sc-paper,.score-tab .sc-paper *{visibility:visible}
  .score-tab .sc-paper{position:absolute;inset:0;border:0;padding:0}
}
@media (max-width:640px){
  .score-tab .sc-title{width:100%;margin-right:0}
  .score-tab .sc-hint{display:none}
  .score-tab .sc-print{margin-left:0}
}
`;

"use client";
// components/classroom/score/StaffView.jsx — 雙手五線譜（OpenSheetMusicDisplay）
//
// OSMD 動態 import（不進首屏、自家打包，不必改 CSP）。畫之前先用 prepareStaffXml 處理「只看右手」（含節奏斜線）與和弦文字；
// 畫完用 collectOsmdNotes＋matchStaffNotes 建「模型 id → SVG 元素」對照表，高亮與提示框都靠它。
// 關掉 OSMD 自己的 autoResize：寬度改變（手機旋轉、側欄開合）時由這裡重畫並「每次重建對照表」，
// 否則重畫後舊元素已不在畫面上，高亮會亮錯或不亮。
// paged：A4 分頁（OSMD pageFormat A4_P，每頁一張 SVG＝一張紙）；各頁位移存在 geom.offs，曲名列 pageHeader 疊在第一頁上方。
// 每次畫完也用 osmdGeometry 算出各小節位置：底下一層畫 A-B 循環底色與游標，上面一層疊可點的小節號與和弦（OSMD 的和弦文字本身點不到）。
import { useEffect, useRef, useState } from "react";
import { prepareStaffXml, matchStaffNotes } from "@/lib/score/staff-xml";
import { collectOsmdNotes, osmdGeometry, OSMD_OPTIONS, applyEngravingRules, liftChordLabels } from "./osmd-notes";

export default function StaffView({
  xml, model, rightHandOnly = false, slashes = false, chordMode = "name", showChords = true, activeIds,
  loop = null, cursorBus = null, follow = false, paged = false, pageHeader = null,
  onNoteHover, onChordHover, onNoteClick, onChordClick, onBarClick,
}) {
  const hostRef = useRef(null);
  const osmdRef = useRef(null);
  const idToEls = useRef(new Map());
  const elToId = useRef(new Map());
  const lit = useRef(new Set());
  const lhIds = useRef(new Set());
  const warned = useRef(false);
  const lastWidth = useRef(0);
  const [status, setStatus] = useState("loading");
  const [geom, setGeom] = useState(null); // { bars, chords, offs:[{ox,oy,w}]（每頁一組）, k }
  const geomRef = useRef(null);
  const curRef = useRef(null);
  const activeRef = useRef(activeIds);
  activeRef.current = activeIds;

  function paint(ids) {
    const next = new Set();
    for (const id of ids || []) for (const el of idToEls.current.get(id) || []) if (el) next.add(el);
    for (const el of lit.current) if (!next.has(el)) el.classList.remove("is-now");
    for (const el of next) if (!lit.current.has(el)) el.classList.add("is-now");
    // 原型：右手紫、左手橘（節奏斜線也算左手）
    for (const id of ids || []) for (const el of idToEls.current.get(id) || []) el?.classList.toggle("lh", lhIds.current.has(id));
    lit.current = next;
  }

  function renderAndMap() {
    const osmd = osmdRef.current;
    if (!osmd || !hostRef.current) return;
    lastWidth.current = hostRef.current.clientWidth;
    applyEngravingRules(osmd.EngravingRules, lastWidth.current, { paged });
    osmd.render();
    lhIds.current = new Set(model.notes.filter((n) => n.staff === 2).map((n) => n.id));
    const map = matchStaffNotes(model, collectOsmdNotes(osmd.GraphicSheet), { slashes: rightHandOnly && slashes });
    idToEls.current = map;
    const rev = new Map();
    for (const [id, els] of map) for (const el of els) if (el && !rev.has(el)) rev.set(el, id);
    elToId.current = rev;
    lit.current = new Set(); // 重畫後舊元素都不在了
    const svgs = [...hostRef.current.querySelectorAll("svg")];
    if (svgs.length) {
      const hr = hostRef.current.getBoundingClientRect();
      const rects = svgs.map((el) => el.getBoundingClientRect());
      const k = svgs[0].width?.baseVal?.value ? rects[0].width / svgs[0].width.baseVal.value : 1;
      const offs = rects.map((sr) => ({ ox: sr.left - hr.left, oy: sr.top - hr.top, w: sr.width }));
      const g = { ...osmdGeometry(osmd.GraphicSheet, model, osmd.zoom || 1), offs, k };
      // 和弦字太貼音符就往上抬，可點範圍跟著移（以抬之前的字框對位）
      svgs.forEach((svg, page) => {
        const sr = rects[page];
        for (const { rect, dy } of liftChordLabels(svg, k)) {
          const cx = (rect.left + rect.right) / 2 - sr.left, cy = (rect.top + rect.bottom) / 2 - sr.top;
          const c = g.chords.find((c) => (c.page || 0) === page && cx >= c.x * k && cx <= (c.x + c.w) * k && cy >= c.y * k && cy <= (c.y + c.h) * k);
          if (c) c.y += dy / k;
        }
      });
      geomRef.current = g;
      setGeom(g);
    }
    if (map.unmatched > 0 && !warned.current) {
      warned.current = true;
      console.warn(`[StaffView] ${map.unmatched} 個五線譜音符對不回模型（裝飾音屬正常）`);
    }
    paint(activeRef.current);
  }

  useEffect(() => {
    if (!xml || !model) return undefined;
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled || !hostRef.current) return;
        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(hostRef.current, paged ? { ...OSMD_OPTIONS, pageFormat: "A4_P", pageBackgroundColor: "#FFFFFF" } : OSMD_OPTIONS);
        }
        await osmdRef.current.load(prepareStaffXml(xml, model, { rightHandOnly, slashes, chordMode, showChords }));
        if (cancelled) return;
        renderAndMap();
        setStatus("ready");
      } catch (e) {
        console.error("[StaffView] 五線譜繪製失敗", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // renderAndMap 讀 ref，不放進依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml, model, rightHandOnly, slashes, chordMode, showChords]);

  // 寬度改變 → 重畫＋重建對照表（200ms 防抖）
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return undefined;
    let t = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (status !== "ready" || !host.clientWidth || Math.abs(host.clientWidth - lastWidth.current) < 2) return;
        try {
          renderAndMap();
        } catch (e) {
          console.error("[StaffView] 重畫失敗", e);
        }
      }, 200);
    });
    ro.observe(host);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status === "ready") paint(activeIds);
  }, [activeIds, status]);

  // 游標：由 cursorBus 直接改位置，不經 React 重畫（原型 showCursor）
  useEffect(() => {
    if (!cursorBus) return undefined;
    let lastRow = null;
    return cursorBus.subscribe((p) => {
      const el = curRef.current;
      const g = geomRef.current;
      const b = p && g?.bars[p.measure];
      if (!el) return;
      if (!b) {
        el.style.visibility = "hidden";
        lastRow = null;
        return;
      }
      const o = g.offs[b.page || 0] || g.offs[0];
      el.style.left = `${o.ox + (Math.min(b.xAt(p.pos), b.x1 - 16) - 8) * g.k}px`;
      el.style.top = `${o.oy + (b.top - 14) * g.k}px`;
      el.style.width = `${16 * g.k}px`;
      el.style.height = `${(b.bottom - b.top + 28) * g.k}px`;
      el.style.visibility = "visible";
      if (follow && b.row !== lastRow) {
        lastRow = b.row;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          el.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        }
      }
    });
  }, [cursorBus, follow]);

  function noteAt(target) {
    for (let n = target; n && n !== hostRef.current; n = n.parentNode) {
      const id = elToId.current.get(n);
      if (id) return { id, el: n };
    }
    return null;
  }
  const hover = (e) => {
    if (!onNoteHover) return;
    const hit = noteAt(e.target);
    onNoteHover(hit ? hit.id : null, hit ? hit.el.getBoundingClientRect() : null);
  };

  const click = (e) => {
    hover(e); // 手機沒有滑過，點一下也顯示提示框
    const hit = noteAt(e.target);
    if (hit) onNoteClick?.(hit.id);
  };
  const off = (page) => geom.offs[page || 0] || geom.offs[0];
  const box = (page, x, y, w, h) => (geom ? { left: off(page).ox + x * geom.k, top: off(page).oy + y * geom.k, width: w * geom.k, height: h * geom.k } : null);
  const lo = loop ? Math.min(loop.from, loop.to) : null;
  const hi = loop ? Math.max(loop.from, loop.to) : null;
  const ready = status === "ready" && geom;

  return (
    <div className={`sv2-staff-wrap${paged ? " sv2-paged" : ""}`}>
      {status === "loading" && <div className="sv2-status">五線譜載入中…</div>}
      {status === "error" && <div className="sv2-status sv2-err">五線譜畫不出來，請改看簡譜，或通知客服。</div>}
      <div className="sv2-layer">
        <div className="sv2-under" aria-hidden="true">
          {ready && loop && geom.bars.map((b, i) => (b && i >= lo && i <= hi ? <div key={i} className="sv2-band" style={box(b.page, b.x0, b.top - 30, b.x1 - b.x0, b.bottom - b.top + 40)} /> : null))}
          <div ref={curRef} className="sv2-cur" style={{ visibility: "hidden" }} />
        </div>
        <div
          ref={hostRef}
          className="sv2-staff"
          onMouseOver={hover}
          onClick={click}
          onMouseLeave={() => onNoteHover?.(null, null)}
        />
        {ready && (
          <div className="sv2-over">
            {paged && pageHeader && (
              <div className="sv2-pagehead" style={{ left: geom.offs[0].ox, top: geom.offs[0].oy, width: geom.offs[0].w }}>{pageHeader}</div>
            )}
            {paged && geom.offs.length > 1 && geom.offs.map((o, i) => (
              <span key={`pg${i}`} className="sv2-pageno" style={{ left: o.ox, top: o.oy + (o.w * 297) / 210 - 30, width: o.w }} aria-hidden="true">{i + 1} / {geom.offs.length}</span>
            ))}
            {geom.bars.map((b, i) =>
              b ? (
                <button key={i} type="button" className="sv2-barno" style={{ left: off(b.page).ox + (b.x0 + 2) * geom.k, top: off(b.page).oy + (b.top - 12) * geom.k }}
                  aria-label={`從第 ${model.measures[i]?.number ?? i + 1} 小節開始播`} onClick={() => onBarClick?.(i)}>
                  {model.measures[i]?.implicit && i === 0 ? "弱" : model.measures[i]?.number ?? i + 1}
                </button>
              ) : null,
            )}
            {showChords && geom.chords.map((c) => (
              <span key={c.id} className="sv2-chordhit" style={box(c.page, c.x - 2, c.y - 2, c.w + 4, c.h + 4)}
                onMouseOver={(e) => onChordHover?.(c.id, e.currentTarget.getBoundingClientRect())}
                onMouseOut={() => onChordHover?.(null, null)}
                onClick={(e) => { onChordHover?.(c.id, e.currentTarget.getBoundingClientRect()); onChordClick?.(c.id); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

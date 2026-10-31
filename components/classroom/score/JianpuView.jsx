"use client";
// components/classroom/score/JianpuView.jsx — 雙行簡譜（lib/score/jianpu-grand.js 產生 SVG）
// 高亮：依 activeIds 對 [data-id] 加 is-now；提示框：以 data-id／data-chord 委派 hover 與點按（手機）。
// 點音符／和弦發聲、點小節號（data-barno）從那一小節開始播。
// 游標與 A-B 循環底色畫在簡譜底下的另一層 SVG（同一個 viewBox 才會對齊）；游標由 cursorBus 直接改 DOM，不經 React 重畫。
import { useEffect, useMemo, useRef } from "react";
import { renderGrandJianpu } from "@/lib/score/jianpu-grand";

export default function JianpuView({
  model, width = 760, chordMode = "name", showChords = true, rightHandOnly = false, slashes = false, activeIds,
  loop = null, cursorBus = null, follow = false,
  onNoteHover, onChordHover, onNoteClick, onChordClick, onBarClick,
}) {
  const ref = useRef(null);
  const curRef = useRef(null);
  const lit = useRef([]);
  const W = Math.max(300, Math.round(width));
  const { svg, bars, height } = useMemo(
    () => renderGrandJianpu(model, { width: W, chordMode, showChords, rightHandOnly, slashes }),
    [model, W, chordMode, showChords, rightHandOnly, slashes],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const el of lit.current) el.classList.remove("is-now");
    const next = [];
    for (const id of activeIds || []) {
      const el = root.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.classList.add("is-now");
        next.push(el);
      }
    }
    lit.current = next;
  }, [activeIds, svg]);

  // 游標：跟著目前位置移動；換行時若那一行不在畫面上就捲過去（原型 showCursor）
  useEffect(() => {
    if (!cursorBus) return undefined;
    let lastRow = -1;
    return cursorBus.subscribe((p) => {
      const el = curRef.current;
      if (!el) return;
      const b = p && bars?.[p.measure];
      if (!b) {
        el.setAttribute("visibility", "hidden");
        lastRow = -1;
        return;
      }
      el.setAttribute("x", Math.min(b.xAt(p.pos), b.x1 - 16) - 8);
      el.setAttribute("y", b.top - 4);
      el.setAttribute("height", b.bottom - b.top + 8);
      el.setAttribute("visibility", "visible");
      if (follow && b.row !== lastRow) {
        lastRow = b.row;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          el.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        }
      }
    });
  }, [cursorBus, bars, follow]);

  const hover = (e) => {
    const t = e.target;
    const n = t.closest?.("[data-id]");
    const c = !n && t.closest?.("[data-chord]");
    onNoteHover?.(n ? n.getAttribute("data-id") : null, n ? n.getBoundingClientRect() : null);
    onChordHover?.(c ? c.getAttribute("data-chord") : null, c ? c.getBoundingClientRect() : null);
  };
  const click = (e) => {
    hover(e); // 手機沒有滑過，點一下也顯示提示框
    const t = e.target;
    const n = t.closest?.("[data-id]");
    if (n) return onNoteClick?.(n.getAttribute("data-id"));
    const c = t.closest?.("[data-chord]");
    if (c) return onChordClick?.(c.getAttribute("data-chord"));
    const b = t.closest?.("[data-barno]");
    if (b) onBarClick?.(Number(b.getAttribute("data-barno")));
  };
  const leave = () => {
    onNoteHover?.(null, null);
    onChordHover?.(null, null);
  };

  const lo = loop ? Math.min(loop.from, loop.to) : null;
  const hi = loop ? Math.max(loop.from, loop.to) : null;
  return (
    <div className="sv2-layer">
      <svg className="sv2-under" viewBox={`0 0 ${W} ${height}`} width="100%" height={height} aria-hidden="true">
        {loop && (bars || []).map((b, i) => (b && i >= lo && i <= hi ? <rect key={i} className="sv2-band" x={b.x0} y={b.top - 14} width={b.x1 - b.x0} height={b.bottom - b.top + 18} /> : null))}
        <rect ref={curRef} className="sv2-cur" x="-50" y="0" width="16" height="10" rx="4" visibility="hidden" />
      </svg>
      <div ref={ref} className="sv2-jianpu" onMouseOver={hover} onClick={click} onMouseLeave={leave} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

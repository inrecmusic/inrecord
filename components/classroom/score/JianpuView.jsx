"use client";
// components/classroom/score/JianpuView.jsx — 雙行簡譜（lib/score/jianpu-grand.js 產生 SVG）
// 高亮：依 activeIds 對 [data-id] 加 is-now；提示框：以 data-id／data-chord 委派 hover 與點按（手機）。
import { useEffect, useMemo, useRef } from "react";
import { renderGrandJianpu } from "@/lib/score/jianpu-grand";

export default function JianpuView({ model, width = 760, chordMode = "name", showChords = true, rightHandOnly = false, slashes = false, activeIds, onNoteHover, onChordHover }) {
  const ref = useRef(null);
  const lit = useRef([]);
  const { svg } = useMemo(
    () => renderGrandJianpu(model, { width: Math.max(300, Math.round(width)), chordMode, showChords, rightHandOnly, slashes }),
    [model, width, chordMode, showChords, rightHandOnly, slashes],
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

  const hover = (e) => {
    const t = e.target;
    const n = t.closest?.("[data-id]");
    const c = !n && t.closest?.("[data-chord]");
    onNoteHover?.(n ? n.getAttribute("data-id") : null, n ? n.getBoundingClientRect() : null);
    onChordHover?.(c ? c.getAttribute("data-chord") : null, c ? c.getBoundingClientRect() : null);
  };
  const leave = () => {
    onNoteHover?.(null, null);
    onChordHover?.(null, null);
  };

  return <div ref={ref} className="sv2-jianpu" onMouseOver={hover} onClick={hover} onMouseLeave={leave} dangerouslySetInnerHTML={{ __html: svg }} />;
}

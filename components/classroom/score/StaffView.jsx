"use client";
// components/classroom/score/StaffView.jsx — 雙手五線譜（OpenSheetMusicDisplay）
//
// OSMD 動態 import（不進首屏、自家打包，不必改 CSP）。畫之前先用 prepareStaffXml 處理「只看右手」與和弦文字；
// 畫完用 collectOsmdNotes＋matchStaffNotes 建「模型 id → SVG 元素」對照表，高亮與提示框都靠它。
// 關掉 OSMD 自己的 autoResize：寬度改變（手機旋轉、側欄開合）時由這裡重畫並「每次重建對照表」，
// 否則重畫後舊元素已不在畫面上，高亮會亮錯或不亮。
import { useEffect, useRef, useState } from "react";
import { prepareStaffXml, matchStaffNotes } from "@/lib/score/staff-xml";
import { collectOsmdNotes } from "./osmd-notes";

export default function StaffView({ xml, model, rightHandOnly = false, chordMode = "name", showChords = true, activeIds, onNoteHover }) {
  const hostRef = useRef(null);
  const osmdRef = useRef(null);
  const idToEls = useRef(new Map());
  const elToId = useRef(new Map());
  const lit = useRef(new Set());
  const warned = useRef(false);
  const lastWidth = useRef(0);
  const [status, setStatus] = useState("loading");
  const activeRef = useRef(activeIds);
  activeRef.current = activeIds;

  function paint(ids) {
    const next = new Set();
    for (const id of ids || []) for (const el of idToEls.current.get(id) || []) if (el) next.add(el);
    for (const el of lit.current) if (!next.has(el)) el.classList.remove("is-now");
    for (const el of next) if (!lit.current.has(el)) el.classList.add("is-now");
    lit.current = next;
  }

  function renderAndMap() {
    const osmd = osmdRef.current;
    if (!osmd || !hostRef.current) return;
    lastWidth.current = hostRef.current.clientWidth;
    osmd.render();
    const map = matchStaffNotes(model, collectOsmdNotes(osmd.GraphicSheet));
    idToEls.current = map;
    const rev = new Map();
    for (const [id, els] of map) for (const el of els) if (el && !rev.has(el)) rev.set(el, id);
    elToId.current = rev;
    lit.current = new Set(); // 重畫後舊元素都不在了
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
          osmdRef.current = new OpenSheetMusicDisplay(hostRef.current, {
            backend: "svg",
            autoResize: false,
            drawTitle: false,
            drawSubtitle: false,
            drawComposer: false,
            drawLyricist: false,
            drawPartNames: false,
            drawingParameters: "compacttight",
          });
        }
        await osmdRef.current.load(prepareStaffXml(xml, model, { rightHandOnly, chordMode, showChords }));
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
  }, [xml, model, rightHandOnly, chordMode, showChords]);

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

  return (
    <div className="sv2-staff-wrap">
      {status === "loading" && <div className="sv2-status">五線譜載入中…</div>}
      {status === "error" && <div className="sv2-status sv2-err">五線譜畫不出來，請改看簡譜，或通知客服。</div>}
      <div
        ref={hostRef}
        className="sv2-staff"
        onMouseOver={hover}
        onClick={hover}
        onMouseLeave={() => onNoteHover?.(null, null)}
      />
    </div>
  );
}

"use client";
// 點互動樂譜時的選擇視窗：「在影片下方看」或「整頁開啟（A4）」；勾「記住我的選擇」之後不再問
// （記在這台瀏覽器；影片下方分頁的「整頁開啟」鈕一直都在，選了下方也還能隨時換整頁）
import { useEffect, useState } from "react";
import { F } from "@/components/classroom/shared";

export default function ScoreOpenDialog({ open, onChoose, onClose, onRemember }) {
  const [remember, setRemember] = useState(false);
  useEffect(() => { if (open) setRemember(false); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const kd = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [open, onClose]);
  if (!open) return null;

  const pick = (how) => { if (remember) onRemember(how); onChoose(how); };
  const btn = (primary) => ({
    display: "block", width: "100%", textAlign: "left", border: primary ? "1px solid #2563eb" : "1px solid #cbd5e1",
    background: primary ? "#2563eb" : "#fff", color: primary ? "#fff" : "#0f172a", borderRadius: 14,
    padding: "12px 16px", cursor: "pointer", fontFamily: F, fontSize: 15, fontWeight: 600,
  });
  const sub = (primary) => ({ display: "block", fontSize: 12, fontWeight: 400, marginTop: 2, color: primary ? "rgba(255,255,255,.85)" : "#64748b" });

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="score-open-title" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 22, fontFamily: F, boxShadow: "0 20px 50px rgba(0,0,0,.25)" }}>
        <h3 id="score-open-title" style={{ margin: "0 0 14px", fontSize: 17, color: "#0f172a" }}>要怎麼看這份樂譜？</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" style={btn(true)} onClick={() => pick("page")} autoFocus>
            📄 整頁開啟（A4）<span style={sub(true)}>換到樂譜頁，像紙本一樣一頁頁看</span>
          </button>
          <button type="button" style={btn(false)} onClick={() => pick("inline")}>
            🎬 在影片下方看<span style={sub(false)}>邊看影片邊對照樂譜</span>
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          記住我的選擇，下次不再問
        </label>
      </div>
    </div>
  );
}

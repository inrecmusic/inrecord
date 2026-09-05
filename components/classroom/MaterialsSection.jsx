"use client";
import { useState, useEffect } from "react";
import { freshToken, openMaterialById, F } from "./shared";

/* ── MaterialsSection ─────────────────────────────────────────────────────────── */
export default function MaterialsSection({ token, video }) {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!token) { setItems([]); return; }
    let cancelled = false;
    const qs = video?.id ? `?video_id=${video.id}` : "";
    freshToken(token)
      .then(tk => fetch(`/api/classroom/materials${qs}`, { headers: { Authorization: `Bearer ${tk}` } }))
      .then(r => (r.ok ? r.json() : { materials: [] }))
      .then(d => { if (!cancelled) setItems(d.materials || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [token, video?.id]);

  async function openMaterial(id) {
    if (!token || busyId) return;
    setErr(""); setBusyId(id);
    const ok = await openMaterialById(token, id);
    if (!ok) setErr("檔案暫時無法下載，請稍後再試");
    setBusyId(null);
  }

  if (!items.length) return null;

  const groups = [
    { kind: "handout", id: "unit-handouts", label: "📎 講義下載" },
    { kind: "score",   id: "unit-scores",   label: "🎼 樂譜下載" },
  ].map(g => ({ ...g, list: items.filter(m => (m.kind === "score" ? "score" : "handout") === g.kind) }))
   .filter(g => g.list.length);

  return (
    <>
      {groups.map(g => (
        <div key={g.id} id={g.id} style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {g.list.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => openMaterial(m.id)}
                disabled={busyId === m.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  fontSize: 13, color: "#1d4ed8",
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  borderRadius: 8, padding: "7px 12px", fontFamily: F,
                  cursor: busyId === m.id ? "default" : "pointer",
                  opacity: busyId === m.id ? 0.6 : 1,
                }}
              >
                <span style={{ color: "#dc2626", fontWeight: 700 }}>PDF</span>
                {m.title}{m.video_id ? "" : "（通用）"}
              </button>
            ))}
          </div>
        </div>
      ))}
      {/* 錯誤訊息只出現一次：兩組共用同一個 err state，放進 map 會重複顯示 */}
      {err && (
        <div style={{ padding: "0 20px 12px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 12, color: "#b45309" }}>
          {err}
        </div>
      )}
    </>
  );
}

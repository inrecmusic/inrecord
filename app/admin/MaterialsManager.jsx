"use client";
import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import styles from "./admin.module.css";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");

export default function MaterialsManager({ videoId, title, onClose, showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("handout");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const qs = videoId ? `?video_id=${videoId}` : "";

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/materials${qs}`, { headers: { Authorization: `Bearer ${pw()}` } });
      const d = await r.json();
      setItems(d.materials || []);
    } catch { showToast("❌ 載入失敗"); setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [videoId]);

  async function upload(e) {
    e.preventDefault();
    if (!file) { showToast("請選擇 PDF 檔"); return; }
    if (!name.trim()) { showToast(kind === "score" ? "請輸入樂譜名稱" : "請輸入講義名稱"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", name.trim());
      fd.append("kind", kind);
      if (videoId) fd.append("video_id", videoId);
      const r = await fetch("/api/admin/materials", { method: "POST", headers: { Authorization: `Bearer ${pw()}` }, body: fd });
      let d = {};
      try { d = await r.json(); } catch {}
      if (!r.ok) {
        if (r.status === 413) {
          showToast("❌ 檔案過大（伺服器上限約 4.5MB），請壓縮後再上傳");
        } else {
          const msg = { too_large: "檔案超過 4MB", bad_type: "僅接受 PDF", bad_magic: "檔案不是有效的 PDF" }[d.error] || d.error || "上傳失敗";
          showToast("❌ " + msg);
        }
      } else {
        showToast("✅ 已上傳");
        setFile(null); setName(""); setKind("handout");
        if (fileRef.current) fileRef.current.value = "";
        load();
      }
    } catch { showToast("❌ 上傳失敗"); }
    setBusy(false);
  }

  async function remove(id) {
    if (!window.confirm("確定要刪除此講義嗎？刪除後無法復原。")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/materials?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${pw()}` } });
      if (r.ok) { showToast("✅ 已刪除"); load(); } else showToast("❌ 刪除失敗");
    } catch { showToast("❌ 刪除失敗"); }
    setBusy(false);
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>講義／樂譜 — {title}</h3>
          <button className={styles.iconBtn} onClick={onClose} aria-label="關閉"><X size={18} /></button>
        </div>

        <form onSubmit={upload} style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          <select className={styles.input} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="handout">講義</option>
            <option value="score">樂譜</option>
          </select>
          <input className={styles.input} placeholder={kind === "score" ? "樂譜名稱（例：小星星 簡易版）" : "講義名稱（例：第 1 課 和弦表）"} value={name} onChange={e => setName(e.target.value)} />
          <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} ref={fileRef} style={{ display: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" className={styles.btnSmall} onClick={() => fileRef.current?.click()} style={{ flexShrink: 0 }}>選擇 PDF 檔案</button>
            <span style={{ fontSize: 13, color: file ? "#0f172a" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{file ? file.name : "尚未選擇檔案"}</span>
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>{busy ? "上傳中…" : "上傳 PDF"}</button>
        </form>

        {loading ? <p style={{ color: "#94a3b8", fontSize: 14 }}>載入中…</p> : items.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>尚無講義或樂譜</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <span style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                  background: m.kind === "score" ? "#fef3c7" : "#e0f2fe",
                  color: m.kind === "score" ? "#92400e" : "#075985",
                }}>{m.kind === "score" ? "樂譜" : "講義"}</span>
                <span style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{m.title}</span>
                <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => remove(m.id)} disabled={busy}>刪除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

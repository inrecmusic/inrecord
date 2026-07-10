"use client";
import { useEffect, useState } from "react";
import { X, Upload, Trash2, FileText } from "lucide-react";
import styles from "./admin.module.css";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");

export default function MaterialsManager({ videoId, title, onClose, showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const qs = videoId ? `?video_id=${videoId}` : "";

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/materials${qs}`, { headers: { Authorization: `Bearer ${pw()}` } });
      const d = await r.json();
      setItems(d.materials || []);
    } catch { setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [videoId]);

  async function upload(e) {
    e.preventDefault();
    if (!file) { showToast("請選擇 PDF 檔"); return; }
    if (!name.trim()) { showToast("請輸入講義名稱"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", name.trim());
      if (videoId) fd.append("video_id", videoId);
      const r = await fetch("/api/admin/materials", { method: "POST", headers: { Authorization: `Bearer ${pw()}` }, body: fd });
      const d = await r.json();
      if (!r.ok) {
        const msg = { too_large: "檔案超過 20MB", bad_type: "僅接受 PDF", bad_magic: "檔案不是有效的 PDF" }[d.error] || d.error || "上傳失敗";
        showToast("❌ " + msg);
      } else {
        showToast("✅ 講義已上傳");
        setFile(null); setName("");
        load();
      }
    } catch { showToast("❌ 上傳失敗"); }
    setBusy(false);
  }

  async function remove(id) {
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
          <h3 style={{ margin: 0, fontSize: 18 }}>講義管理 — {title}</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={upload} style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          <input className={styles.input} placeholder="講義名稱（例：第 1 課 和弦表）" value={name} onChange={e => setName(e.target.value)} />
          <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button type="submit" className={styles.btnPrimary} disabled={busy}><Upload size={14} /> {busy ? "上傳中…" : "上傳 PDF"}</button>
        </form>

        {loading ? <p style={{ color: "#94a3b8", fontSize: 14 }}>載入中…</p> : items.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>尚無講義</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <FileText size={16} color="#dc2626" />
                <span style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{m.title}</span>
                <button className={styles.iconBtn} onClick={() => remove(m.id)} disabled={busy}><Trash2 size={15} color="#dc2626" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

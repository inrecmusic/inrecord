"use client";
import { useEffect, useState } from "react";
import { Pin } from "lucide-react";
import styles from "./admin.module.css";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

const EMPTY = { title: "", body: "", pinned: false, published: true };

export default function AnnouncementsPage({ showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api("/api/admin/announcements");
      const d = await r.json();
      setItems(d.announcements || []);
    } catch { showToast("❌ 載入失敗"); setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() { setForm(EMPTY); setEditingId(null); }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { showToast("請輸入標題"); return; }
    if (!form.body.trim()) { showToast("請輸入內容"); return; }
    setBusy(true);
    try {
      let r;
      if (editingId) {
        r = await api("/api/admin/announcements", { method: "PATCH", body: JSON.stringify({ id: editingId, ...form }) });
      } else {
        r = await api("/api/admin/announcements", { method: "POST", body: JSON.stringify(form) });
      }
      if (r.ok) { showToast(editingId ? "✅ 已更新" : "✅ 已發布"); resetForm(); load(); }
      else showToast("❌ 儲存失敗");
    } catch { showToast("❌ 儲存失敗"); }
    setBusy(false);
  }

  function edit(a) {
    setEditingId(a.id);
    setForm({ title: a.title, body: a.body, pinned: !!a.pinned, published: !!a.published });
  }

  async function remove(id) {
    if (!window.confirm("確定要刪除此公告嗎？刪除後無法復原。")) return;
    setBusy(true);
    try {
      const r = await api(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
      if (r.ok) { showToast("✅ 已刪除"); if (editingId === id) resetForm(); load(); }
      else showToast("❌ 刪除失敗");
    } catch { showToast("❌ 刪除失敗"); }
    setBusy(false);
  }

  async function togglePublish(a) {
    setBusy(true);
    try {
      const r = await api("/api/admin/announcements", { method: "PATCH", body: JSON.stringify({ id: a.id, published: !a.published }) });
      if (r.ok) load(); else showToast("❌ 更新失敗");
    } catch { showToast("❌ 更新失敗"); }
    setBusy(false);
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>公告</h1><p>發布課程公告，學員在教室頂部可見</p></div>
      </div>

      <form onSubmit={submit} className={styles.panel} style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{editingId ? "編輯公告" : "新增公告"}</h3>
        <input className={styles.input} placeholder="公告標題" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        <textarea className={styles.input} rows={4} placeholder="公告內容" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(p => ({ ...p, pinned: e.target.checked }))} /> 置頂
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.published} onChange={e => setForm(p => ({ ...p, published: e.target.checked }))} /> 發布（學員可見）
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {editingId && <button type="button" className={styles.btnSmall} onClick={resetForm}>取消</button>}
            <button type="submit" className={styles.btnPrimary} disabled={busy}>{editingId ? "更新" : "發布"}</button>
          </div>
        </div>
      </form>

      {loading ? <p style={{ color: "#94a3b8" }}>載入中…</p> : items.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>尚無公告</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map(a => (
            <div key={a.id} className={styles.panel} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {a.pinned && <Pin size={14} color="#2563eb" />}
                  <strong style={{ fontSize: 15, color: "#0f172a" }}>{a.title}</strong>
                  {!a.published && <span style={{ fontSize: 11, color: "#991b1b", background: "#fee2e2", borderRadius: 6, padding: "2px 8px" }}>未發布</span>}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", whiteSpace: "pre-wrap" }}>{a.body}</p>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button className={styles.btnSmall} title={a.published ? "設為未發布" : "發布"} onClick={() => togglePublish(a)} disabled={busy} aria-label={a.published ? "設為未發布" : "發布"}>
                  {a.published ? "設為未發布" : "發布"}
                </button>
                <button className={styles.btnSmall} onClick={() => edit(a)}>編輯</button>
                <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => remove(a.id)} disabled={busy} aria-label="刪除公告">刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

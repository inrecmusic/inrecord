"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "./admin.module.css";
import { Plus, GripVertical, Edit2, Trash2, X, Check, ChevronDown, ChevronRight, Video } from "lucide-react";


const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

export default function ChaptersUnitsPage({ showToast }) {
  const [chapters, setChapters] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // expanded state per chapter
  const [expanded, setExpanded] = useState({});

  // inline chapter add
  const [addingChap, setAddingChap] = useState(false);
  const [newChapTitle, setNewChapTitle] = useState("");

  // inline chapter edit
  const [editingChapId, setEditingChapId] = useState(null);
  const [editChapTitle, setEditChapTitle] = useState("");

  // delete confirms
  const [deleteChapId, setDeleteChapId] = useState(null);
  const [deleteVideoId, setDeleteVideoId] = useState(null);

  // drag
  const [dragChapIdx, setDragChapIdx] = useState(null);
  const [dragVideoKey, setDragVideoKey] = useState(null); // { chapId, idx }

  // unit modal
  const [videoModal, setVideoModal] = useState(null); // null | "create:{chapId}" | video object
  const [videoForm, setVideoForm] = useState({ chapter_id: "", title: "", bunny_video_id: "", vimeo_url: "", vimeo_id: "", duration: "", assignment_desc: "", published: false });
  const [videoFormErr, setVideoFormErr] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, vr] = await Promise.all([api("/api/admin/chapters"), api("/api/admin/videos")]);
      const chaps = (await cr.json()).data || [];
      const vids = (await vr.json()).data || [];
      setChapters(chaps);
      setVideos(vids);
      // auto-expand all chapters on first load
      setExpanded(prev => {
        const next = { ...prev };
        chaps.forEach(c => { if (next[c.id] === undefined) next[c.id] = true; });
        return next;
      });
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Chapter CRUD ── */
  async function addChapter() {
    if (!newChapTitle.trim()) return;
    setSaving(true);
    try {
      const sort_order = chapters.length ? Math.max(...chapters.map(c => c.sort_order ?? 0)) + 1 : 0;
      const r = await api("/api/admin/chapters", { method: "POST", body: JSON.stringify({ title: newChapTitle.trim(), sort_order }) });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 章節已新增"); setNewChapTitle(""); setAddingChap(false); fetchAll();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSaving(false); }
  }

  async function saveChapter(id) {
    if (!editChapTitle.trim()) return;
    setSaving(true);
    try {
      const r = await api("/api/admin/chapters", { method: "PATCH", body: JSON.stringify({ id, title: editChapTitle.trim() }) });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 章節已更新"); setEditingChapId(null); fetchAll();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSaving(false); }
  }

  async function deleteChapter(id) {
    setSaving(true);
    try {
      const r = await api(`/api/admin/chapters?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 章節已刪除"); fetchAll();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSaving(false); setDeleteChapId(null); }
  }

  async function reorderChapters(arr) {
    setChapters(arr);
    try { await Promise.all(arr.map((c, i) => api("/api/admin/chapters", { method: "PATCH", body: JSON.stringify({ id: c.id, sort_order: i }) }))); } catch {}
  }

  /* ── Video CRUD ── */
  function openVideoCreate(chapId) {
    setVideoForm({ chapter_id: chapId, title: "", bunny_video_id: "", vimeo_url: "", vimeo_id: "", duration: "", assignment_desc: "", published: false });
    setVideoFormErr(""); setVideoModal("create");
  }

  function openVideoEdit(v) {
    setVideoForm({ chapter_id: v.chapter_id || "", title: v.title || "", bunny_video_id: v.bunny_video_id || "", vimeo_url: v.vimeo_id ? `https://vimeo.com/${v.vimeo_id}` : "", vimeo_id: v.vimeo_id || "", duration: v.duration || "", assignment_desc: v.assignment_desc || "", published: v.published || false });
    setVideoFormErr(""); setVideoModal(v);
  }

  async function saveVideo(e) {
    e.preventDefault(); setVideoFormErr("");
    if (!videoForm.title.trim()) { setVideoFormErr("請輸入單元名稱"); return; }
    if (!videoForm.chapter_id) { setVideoFormErr("請選擇所屬章節"); return; }
    setSaving(true);
    try {
      const isEdit = videoModal && videoModal !== "create";
      const vimeo_id = videoForm.vimeo_url.match(/vimeo\.com\/(\d+)/)?.[1] || videoForm.vimeo_id;
      const body = { chapter_id: videoForm.chapter_id, title: videoForm.title.trim(), bunny_video_id: videoForm.bunny_video_id.trim() || null, vimeo_id: vimeo_id || null, duration: videoForm.duration, assignment_desc: videoForm.assignment_desc, published: videoForm.published };
      if (isEdit) body.id = videoModal.id;
      else body.sort_order = videos.filter(v => v.chapter_id === videoForm.chapter_id).length;
      const r = await api("/api/admin/videos", { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast(isEdit ? "✅ 單元已更新" : "✅ 單元已新增"); setVideoModal(null); fetchAll();
    } catch (e) { setVideoFormErr(e.message); }
    finally { setSaving(false); }
  }

  async function deleteVideo(id) {
    setSaving(true);
    try {
      const r = await api(`/api/admin/videos?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 單元已刪除"); fetchAll();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSaving(false); setDeleteVideoId(null); }
  }

  /* ── Drag: chapters ── */
  function onChapDragStart(i) { setDragChapIdx(i); }
  function onChapDragOver(e, i) {
    e.preventDefault();
    if (dragChapIdx === null || dragChapIdx === i) return;
    const arr = [...chapters]; const [m] = arr.splice(dragChapIdx, 1); arr.splice(i, 0, m);
    setDragChapIdx(i); reorderChapters(arr);
  }

  /* ── Drag: videos within a chapter ── */
  function onVideoDragStart(chapId, idx) { setDragVideoKey({ chapId, idx }); }
  function onVideoDragOver(e, chapId, idx) {
    e.preventDefault();
    if (!dragVideoKey || dragVideoKey.chapId !== chapId || dragVideoKey.idx === idx) return;
    const chapVids = videos.filter(v => v.chapter_id === chapId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const [m] = chapVids.splice(dragVideoKey.idx, 1); chapVids.splice(idx, 0, m);
    const updated = chapVids.map((v, i) => ({ ...v, sort_order: i }));
    setDragVideoKey({ chapId, idx });
    setVideos(prev => { const rest = prev.filter(v => v.chapter_id !== chapId); return [...rest, ...updated]; });
    try { updated.forEach(v => api("/api/admin/videos", { method: "PATCH", body: JSON.stringify({ id: v.id, sort_order: v.sort_order }) })); } catch {}
  }

  const chapVideos = (chapId) => videos.filter(v => v.chapter_id === chapId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>章節與單元管理</h1><p>管理課程章節架構與影片單元</p></div>
        <button className={styles.btnPrimary} onClick={() => { setAddingChap(true); setNewChapTitle(""); }}>
          <Plus size={14} /> 新增章節
        </button>
      </div>

      <div className={styles.panel}>
        {loading ? (
          <div className={styles.empty} style={{ padding: "40px 0" }}>載入中…</div>
        ) : !chapters.length && !addingChap ? (
          <div className={styles.empty} style={{ padding: "40px 0" }}>尚無章節，請點擊右上角「新增章節」</div>
        ) : (
          <div style={{ padding: "8px 0" }}>
            {chapters.map((chap, ci) => {
              const vids = chapVideos(chap.id);
              const isOpen = expanded[chap.id] !== false;
              return (
                <div
                  key={chap.id}
                  draggable
                  onDragStart={() => onChapDragStart(ci)}
                  onDragOver={e => onChapDragOver(e, ci)}
                  onDragEnd={() => setDragChapIdx(null)}
                  style={{ opacity: dragChapIdx === ci ? 0.4 : 1, marginBottom: 2 }}
                >
                  {/* Chapter row */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 16px", background: "#f8fafc",
                    borderRadius: isOpen && vids.length ? "10px 10px 0 0" : 10,
                    border: "1px solid #e8ecf0",
                    borderBottom: isOpen && vids.length ? "none" : undefined,
                  }}>
                    <span style={{ color: "#cbd5e1", cursor: "grab", flexShrink: 0 }}><GripVertical size={15} /></span>
                    <button
                      onClick={() => setExpanded(p => ({ ...p, [chap.id]: !isOpen }))}
                      style={{ border: 0, background: "none", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", padding: 2, flexShrink: 0 }}
                    >
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>

                    {editingChapId === chap.id ? (
                      <div style={{ display: "flex", gap: 7, alignItems: "center", flex: 1 }}>
                        <input className={styles.input} value={editChapTitle} onChange={e => setEditChapTitle(e.target.value)} style={{ maxWidth: 280 }} onKeyDown={e => e.key === "Enter" && saveChapter(chap.id)} autoFocus />
                        <button className={styles.btnPrimary} style={{ padding: "5px 9px" }} onClick={() => saveChapter(chap.id)} disabled={saving}><Check size={13} /></button>
                        <button className={styles.iconBtn} onClick={() => setEditingChapId(null)}><X size={13} /></button>
                      </div>
                    ) : (
                      <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", flex: 1 }}>{chap.title}</span>
                    )}

                    <span style={{ fontSize: 12, color: "#94a3b8", marginRight: 8, flexShrink: 0 }}>{vids.length} 個單元</span>

                    {editingChapId !== chap.id && (
                      <div className={styles.rowActions} style={{ flexShrink: 0 }}>
                        <button className={styles.btnSmall} onClick={() => openVideoCreate(chap.id)}><Plus size={12} /> 新增單元</button>
                        <button className={styles.btnSmall} onClick={() => { setEditingChapId(chap.id); setEditChapTitle(chap.title); }}><Edit2 size={12} /></button>
                        <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => setDeleteChapId(chap.id)}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>

                  {/* Unit rows */}
                  {isOpen && vids.length > 0 && (
                    <div style={{ border: "1px solid #e8ecf0", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                      {vids.map((v, vi) => (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => onVideoDragStart(chap.id, vi)}
                          onDragOver={e => onVideoDragOver(e, chap.id, vi)}
                          onDragEnd={() => setDragVideoKey(null)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "9px 16px 9px 44px",
                            background: dragVideoKey?.chapId === chap.id && dragVideoKey?.idx === vi ? "#eff6ff" : "#fff",
                            borderTop: "1px solid #f1f5f9",
                            opacity: dragVideoKey?.chapId === chap.id && dragVideoKey?.idx === vi ? 0.5 : 1,
                          }}
                        >
                          <span style={{ color: "#e2e8f0", cursor: "grab", flexShrink: 0 }}><GripVertical size={14} /></span>
                          <Video size={13} color="#7c3aed" style={{ flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</span>
                          {v.bunny_video_id && (
                            <span style={{ fontSize: 11, color: "#ea580c", fontWeight: 700, background: "#fff7ed", padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>Bunny</span>
                          )}
                          {v.vimeo_id && (
                            <a href={`https://vimeo.com/${v.vimeo_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563eb", fontWeight: 700, background: "#eff6ff", padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>{v.vimeo_id}</a>
                          )}
                          {v.duration && <span style={{ fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>{v.duration}</span>}
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, flexShrink: 0, background: v.published ? "#dcfce7" : "#f1f5f9", color: v.published ? "#166534" : "#475569" }}>
                            {v.published ? "已發布" : "草稿"}
                          </span>
                          <div className={styles.rowActions} style={{ flexShrink: 0 }}>
                            <button className={styles.btnSmall} onClick={() => openVideoEdit(v)}><Edit2 size={12} /></button>
                            <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => setDeleteVideoId(v.id)}><Trash2 size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty chapter placeholder */}
                  {isOpen && vids.length === 0 && (
                    <div style={{
                      padding: "14px 44px", border: "1px solid #e8ecf0", borderTop: "none",
                      borderRadius: "0 0 10px 10px", color: "#94a3b8", fontSize: 13,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span>尚無單元</span>
                      <button className={styles.btnSmall} style={{ fontSize: 12 }} onClick={() => openVideoCreate(chap.id)}><Plus size={11} /> 新增第一個單元</button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Inline new chapter row */}
            {addingChap && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#f0f7ff", borderRadius: 10, border: "1px dashed #93c5fd", marginTop: 8 }}>
                <span style={{ color: "#cbd5e1", flexShrink: 0 }}><GripVertical size={15} /></span>
                <ChevronDown size={15} color="#94a3b8" />
                <input
                  className={styles.input}
                  value={newChapTitle}
                  onChange={e => setNewChapTitle(e.target.value)}
                  placeholder="輸入章節名稱…"
                  style={{ maxWidth: 280 }}
                  onKeyDown={e => e.key === "Enter" && addChapter()}
                  autoFocus
                />
                <button className={styles.btnPrimary} style={{ padding: "5px 9px" }} onClick={addChapter} disabled={saving}><Check size={13} /></button>
                <button className={styles.iconBtn} onClick={() => setAddingChap(false)}><X size={13} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unit modal */}
      {videoModal && (
        <div className={styles.modalOverlay} onClick={() => setVideoModal(null)}>
          <div className={styles.modalCard} style={{ width: "min(560px,100%)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{videoModal === "create" ? "新增單元" : "編輯單元"}</h3>
              <button className={styles.iconBtn} onClick={() => setVideoModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveVideo} style={{ display: "grid", gap: 14 }}>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>所屬章節 *</label>
                  <select className={styles.selectInput} style={{ width: "100%" }} value={videoForm.chapter_id} onChange={e => setVideoForm(p => ({ ...p, chapter_id: e.target.value }))}>
                    <option value="">請選擇章節</option>
                    {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup} style={{ flex: 2 }}>
                  <label>單元名稱 *</label>
                  <input className={styles.input} value={videoForm.title} onChange={e => setVideoForm(p => ({ ...p, title: e.target.value }))} placeholder="例：第 1 課：認識鍵盤" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Bunny Stream Video ID（主要）</label>
                <input
                  className={styles.input}
                  value={videoForm.bunny_video_id}
                  onChange={e => setVideoForm(p => ({ ...p, bunny_video_id: e.target.value.trim() }))}
                  placeholder="例：a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                />
                {videoForm.bunny_video_id && <span style={{ fontSize: 12, color: "#16a34a", marginTop: 3, display: "block" }}>✓ Bunny Video ID 已設定</span>}
              </div>
              <div className={styles.formGroup}>
                <label>Vimeo 影片連結（備用）</label>
                <input
                  className={styles.input}
                  value={videoForm.vimeo_url}
                  onChange={e => { const u = e.target.value; setVideoForm(p => ({ ...p, vimeo_url: u, vimeo_id: u.match(/vimeo\.com\/(\d+)/)?.[1] || "" })); }}
                  placeholder="https://vimeo.com/123456789"
                />
                {videoForm.vimeo_id && <span style={{ fontSize: 12, color: "#16a34a", marginTop: 3, display: "block" }}>✓ 解析 Video ID：{videoForm.vimeo_id}</span>}
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>時長</label>
                  <input className={styles.input} value={videoForm.duration} onChange={e => setVideoForm(p => ({ ...p, duration: e.target.value }))} placeholder="12:40" />
                </div>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>發布狀態</label>
                  <select className={styles.selectInput} style={{ width: "100%" }} value={videoForm.published ? "1" : "0"} onChange={e => setVideoForm(p => ({ ...p, published: e.target.value === "1" }))}>
                    <option value="0">草稿</option>
                    <option value="1">已發布</option>
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>作業說明（選填）</label>
                <textarea className={styles.replyTextarea} rows={3} value={videoForm.assignment_desc} onChange={e => setVideoForm(p => ({ ...p, assignment_desc: e.target.value }))} placeholder="描述本單元的作業要求…" />
              </div>
              {videoFormErr && <p style={{ color: "#dc2626", fontSize: 13, margin: 0, fontWeight: 700 }}>{videoFormErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={() => setVideoModal(null)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? "儲存中…" : videoModal === "create" ? "新增單元" : "儲存變更"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete chapter confirm */}
      {deleteChapId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteChapId(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>確認刪除章節</h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
              {videos.some(v => v.chapter_id === deleteChapId) ? "⚠️ 此章節下有單元，請先移除所有單元後再刪除章節。" : "刪除後無法復原，確定要刪除嗎？"}
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnSmall} onClick={() => setDeleteChapId(null)}>取消</button>
              {!videos.some(v => v.chapter_id === deleteChapId) && (
                <button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={() => deleteChapter(deleteChapId)} disabled={saving}>確認刪除</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete unit confirm */}
      {deleteVideoId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteVideoId(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>確認刪除單元</h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>刪除後無法復原，確定要刪除此單元嗎？</p>
            <div className={styles.modalActions}>
              <button className={styles.btnSmall} onClick={() => setDeleteVideoId(null)}>取消</button>
              <button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={() => deleteVideo(deleteVideoId)} disabled={saving}>確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

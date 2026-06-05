"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import styles from "./admin.module.css";
import { X, Eye, CheckCircle2, ClipboardList } from "lucide-react";

const PER_PAGE = 20;

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");

function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

function Pagination({ page, total, perPage, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  return (
    <div className={styles.pagination}>
      <button className={styles.pageBtn} disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

export default function AssignmentsPage({ showToast }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [drawerVideo, setDrawerVideo] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [subLoading, setSubLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [feedbackMap, setFeedbackMap] = useState({});

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api("/api/admin/videos");
      const { data } = await r.json();
      setVideos((data || []).filter(v => v.assignment_desc));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  async function fetchSubmissions(videoId) {
    setSubLoading(true);
    try {
      const r = await api(`/api/admin/submissions?video_id=${videoId}`);
      const { data } = await r.json();
      const subs = data || [];
      setSubmissions(subs);
      const map = {};
      subs.forEach(s => { map[s.id] = s.feedback || ""; });
      setFeedbackMap(map);
    } catch {}
    finally { setSubLoading(false); }
  }

  function openDrawer(v) { setDrawerVideo(v); fetchSubmissions(v.id); }
  function closeDrawer() { setDrawerVideo(null); setSubmissions([]); }

  async function markReviewed(sub) {
    setSavingId(sub.id);
    try {
      const r = await api("/api/admin/submissions", {
        method: "PATCH",
        body: JSON.stringify({ id: sub.id, reviewed: true, feedback: feedbackMap[sub.id] || "" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已標記批改完成");
      fetchSubmissions(drawerVideo.id);
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSavingId(null); }
  }

  const paged = useMemo(() => videos.slice((page - 1) * PER_PAGE, page * PER_PAGE), [videos, page]);

  const subCount = useMemo(() => {
    const m = {};
    submissions.forEach(s => { m[s.video_id] = (m[s.video_id] || 0) + 1; });
    return m;
  }, [submissions]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>作業設定</h1><p>查看各單元作業繳交情況與批改</p></div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 7 }}><ClipboardList size={16} color="#2563eb" /> 有作業的單元</h2>
          <span className={styles.dim}>{videos.length} 個單元有作業</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>對應單元</th><th>作業說明</th><th>截止日期</th><th>繳交數量</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className={styles.empty}>載入中…</td></tr>
                : !paged.length ? <tr><td colSpan={6} className={styles.empty}>尚無設定作業的單元<br /><span style={{ fontSize: 12, color: "#94a3b8" }}>請在「單元管理」編輯單元時填寫作業說明</span></td></tr>
                : paged.map(v => (
                  <tr key={v.id}>
                    <td><strong style={{ fontSize: 13 }}>{v.title}</strong></td>
                    <td className={styles.dim} style={{ maxWidth: 220 }}>
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.assignment_desc}</span>
                    </td>
                    <td className={styles.dim}>{v.assignment_due || "—"}</td>
                    <td>
                      <span className={styles.courseBadge}>{subCount[v.id] ?? "—"}</span>
                    </td>
                    <td>
                      <span className={styles.pill} style={{ background: v.published ? "#dcfce7" : "#f1f5f9", color: v.published ? "#166534" : "#475569" }}>
                        {v.published ? "已發布" : "草稿"}
                      </span>
                    </td>
                    <td>
                      <button className={styles.btnSmall} onClick={() => openDrawer(v)}><Eye size={12} /> 批改</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={videos.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* Submissions drawer */}
      {drawerVideo && (
        <>
          <div className={styles.drawerOverlay} onClick={closeDrawer} />
          <div className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>作業批改</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{drawerVideo.title}</div>
              </div>
              <button className={styles.iconBtn} onClick={closeDrawer}><X size={18} /></button>
            </div>
            <div className={styles.drawerBody}>
              {subLoading ? (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: 32 }}>載入中…</p>
              ) : !submissions.length ? (
                <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>
                  <ClipboardList size={36} style={{ display: "block", margin: "0 auto 12px" }} />
                  <p style={{ margin: 0 }}>尚無學員繳交</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {submissions.map(s => (
                    <div key={s.id} style={{ border: "1px solid #e8ecf0", borderRadius: 12, padding: 16, background: s.reviewed ? "#f8fafc" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>{s.user_email}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                            繳交時間：{s.submitted_at ? new Date(s.submitted_at).toLocaleString("zh-TW") : "—"}
                          </div>
                        </div>
                        {s.reviewed
                          ? <span className={styles.pill} style={{ background: "#dcfce7", color: "#166534" }}><CheckCircle2 size={11} style={{ marginRight: 3 }} />已批改</span>
                          : <span className={styles.pill} style={{ background: "#fef3c7", color: "#92400e" }}>待批改</span>}
                      </div>
                      {s.file_url && (
                        <a href={s.file_url} target="_blank" rel="noreferrer" className={styles.btnSmall} style={{ display: "inline-flex", marginBottom: 10 }}>
                          <Eye size={12} /> 查看檔案
                        </a>
                      )}
                      <div className={styles.formGroup}>
                        <label>批改備註</label>
                        <textarea
                          className={styles.replyTextarea}
                          rows={2}
                          value={feedbackMap[s.id] || ""}
                          onChange={e => setFeedbackMap(m => ({ ...m, [s.id]: e.target.value }))}
                          placeholder="輸入批改意見…"
                        />
                      </div>
                      {!s.reviewed && (
                        <button
                          className={styles.btnPrimary}
                          style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
                          onClick={() => markReviewed(s)}
                          disabled={savingId === s.id}
                        >
                          {savingId === s.id ? "儲存中…" : "標記已批改"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

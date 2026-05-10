"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import styles from "./admin.module.css";
import { MessageSquare, Trash2, X } from "lucide-react";

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

export default function UnitCommentsPage({ showToast, onUnreadChange }) {
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState([]);
  const [chapters, setChapters] = useState([]);

  const [videoFilter, setVideoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (videoFilter !== "all") params.set("video_id", videoFilter);
      const r = await api(`/api/admin/unit-comments?${params}`);
      const { data, total: t } = await r.json();
      setComments(data || []);
      setTotal(t || 0);
      const unread = (data || []).filter(c => c.status === "pending").length;
      onUnreadChange?.(unread);
    } catch {}
    finally { setLoading(false); }
  }, [page, statusFilter, videoFilter, onUnreadChange]);

  const fetchMeta = useCallback(async () => {
    try {
      const [rv, rc] = await Promise.all([api("/api/admin/videos"), api("/api/admin/chapters")]);
      setVideos((await rv.json()).data || []);
      setChapters((await rc.json()).data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchComments(); }, [fetchComments]);

  async function submitReply(commentId) {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const r = await api("/api/admin/comment-replies", {
        method: "POST",
        body: JSON.stringify({ comment_id: commentId, admin_content: replyText.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 回覆已送出");
      setReplyingId(null); setReplyText("");
      fetchComments();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setReplying(false); }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const r = await api(`/api/admin/unit-comments?id=${deleteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 留言已刪除");
      setDeleteId(null); fetchComments();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setDeleting(false); }
  }

  function openReply(c) {
    if (replyingId === c.id) { setReplyingId(null); return; }
    setReplyingId(c.id); setReplyText("");
  }

  const pendingCount = useMemo(() => comments.filter(c => c.status === "pending").length, [comments]);
  const repliedCount = useMemo(() => comments.filter(c => c.status === "replied").length, [comments]);
  const videoName = id => videos.find(v => v.id === id)?.title || id;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>單元評論</h1><p>管理學員在單元下方的留言</p></div>
      </div>

      <div className={styles.statsGrid4} style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {[["全部留言", total, "則"], ["待回覆", pendingCount, "則待處理"], ["已回覆", repliedCount, "則"]].map(([l, v, s]) => (
          <div key={l} className={styles.statCard}>
            <div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div>
            <strong className={styles.statValue}>{v}</strong>
            <div className={styles.statSub}>{s}</div>
          </div>
        ))}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead} style={{ flexWrap: "wrap", gap: 10 }}>
          <div className={styles.tabGroup}>
            {[["all", "全部"], ["pending", "待回覆"], ["replied", "已回覆"]].map(([key, label]) => (
              <button key={key} className={`${styles.tab} ${statusFilter === key ? styles.tabActive : ""}`} onClick={() => { setStatusFilter(key); setPage(1); }}>
                {label}
                {key === "pending" && pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}
              </button>
            ))}
          </div>
          <select className={styles.selectInput} value={videoFilter} onChange={e => { setVideoFilter(e.target.value); setPage(1); }}>
            <option value="all">全部單元</option>
            {chapters.map(c => (
              <optgroup key={c.id} label={c.title}>
                {videos.filter(v => v.chapter_id === c.id).map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>學員</th><th>所屬單元</th><th>留言內容</th><th>時間</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className={styles.empty}>載入中…</td></tr>
                : !comments.length ? <tr><td colSpan={6} className={styles.empty}>暫無留言</td></tr>
                : comments.map(c => (
                  <Fragment key={c.id}>
                    <tr className={replyingId === c.id ? styles.commentRowActive : ""}>
                      <td style={{ minWidth: 130 }}>
                        <div className={styles.commenterCell}>
                          <div className={styles.commenterAvatar}>{(c.user_name || c.user_email || "?")[0].toUpperCase()}</div>
                          <div>
                            <div className={styles.commenterName}>{c.user_name || "匿名"}</div>
                            <div className={styles.realIdentity}>{c.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ minWidth: 130 }}><span className={styles.unitTag}>{c.videos?.title || videoName(c.video_id)}</span></td>
                      <td>
                        <div className={styles.commentContent} style={{ maxWidth: 260 }}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.content}</span>
                        </div>
                      </td>
                      <td className={styles.dim} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                        {c.created_at ? new Date(c.created_at).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td>
                        <span className={styles.pill} style={{ background: c.status === "replied" ? "#dcfce7" : "#fef3c7", color: c.status === "replied" ? "#166534" : "#92400e" }}>
                          {c.status === "replied" ? "已回覆" : "待回覆"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button className={styles.btnSmall} onClick={() => openReply(c)}>
                            <MessageSquare size={12} /> {replyingId === c.id ? "收起" : "回覆"}
                          </button>
                          <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => setDeleteId(c.id)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                    {replyingId === c.id && (
                      <tr className={styles.replyRow}>
                        <td colSpan={6}>
                          <div className={styles.replyBox}>
                            <textarea className={styles.replyTextarea} rows={3} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="輸入回覆內容…" autoFocus />
                            <div className={styles.replyActions}>
                              <button className={styles.btnPrimary} onClick={() => submitReply(c.id)} disabled={replying}>{replying ? "送出中…" : "送出回覆"}</button>
                              <button className={styles.btnSmall} onClick={() => setReplyingId(null)}>取消</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {deleteId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>確認刪除留言</h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>此操作無法復原，確定要刪除這則留言嗎？</p>
            <div className={styles.modalActions}>
              <button className={styles.btnSmall} onClick={() => setDeleteId(null)}>取消</button>
              <button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete} disabled={deleting}>確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

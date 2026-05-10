"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import styles from "./admin.module.css";
import { Star, Eye, EyeOff, MessageSquare, Trash2 } from "lucide-react";

const PER_PAGE = 20;

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");

function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

function Stars({ rating, size = 14 }) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= rating ? "#f59e0b" : "none"} color={i <= rating ? "#f59e0b" : "#e2e8f0"} />
      ))}
    </span>
  );
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

export default function CourseRatingsPage({ showToast }) {
  const [ratings, setRatings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const fetchRatings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await api(`/api/admin/ratings?${params}`);
      const { data, total: t } = await r.json();
      setRatings(data || []);
      setTotal(t || 0);
    } catch {}
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { fetchRatings(); }, [fetchRatings]);

  async function submitReply(ratingId) {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const r = await api("/api/admin/rating-replies", {
        method: "POST",
        body: JSON.stringify({ rating_id: ratingId, admin_content: replyText.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 回覆已送出");
      setReplyingId(null); setReplyText(""); fetchRatings();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setReplying(false); }
  }

  async function toggleHidden(rating) {
    setSavingId(rating.id);
    try {
      const r = await api("/api/admin/ratings", {
        method: "PATCH",
        body: JSON.stringify({ id: rating.id, hidden: !rating.hidden }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast(rating.hidden ? "✅ 評價已顯示" : "✅ 評價已隱藏");
      fetchRatings();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSavingId(null); }
  }

  function openReply(r) {
    if (replyingId === r.id) { setReplyingId(null); return; }
    setReplyingId(r.id); setReplyText("");
  }

  const avg = useMemo(() => {
    const shown = ratings.filter(r => !r.hidden);
    if (!shown.length) return 0;
    return (shown.reduce((s, r) => s + (r.score || 0), 0) / shown.length).toFixed(1);
  }, [ratings]);

  const starCounts = useMemo(() => {
    const m = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratings.forEach(r => { if (m[r.score] !== undefined) m[r.score]++; });
    return m;
  }, [ratings]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>課程評價</h1><p>查看與管理學員對課程的評分與評論</p></div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid4}>
        <div className={styles.statCard}>
          <div className={styles.statHead}><span className={styles.statLabel}>平均評分</span></div>
          <strong className={styles.statValue}>{avg}</strong>
          <div style={{ marginTop: 6 }}><Stars rating={Math.round(Number(avg))} size={13} /></div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}><span className={styles.statLabel}>總評價數</span></div>
          <strong className={styles.statValue}>{total}</strong>
          <div className={styles.statSub}>則</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}><span className={styles.statLabel}>5 星評價</span></div>
          <strong className={styles.statValue}>{starCounts[5]}</strong>
          <div style={{ marginTop: 6 }}><Stars rating={5} size={12} /></div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}><span className={styles.statLabel}>4 星評價</span></div>
          <strong className={styles.statValue}>{starCounts[4]}</strong>
          <div style={{ marginTop: 6 }}><Stars rating={4} size={12} /></div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.tabGroup}>
            {[["all", "全部"], ["pending", "待回覆"], ["replied", "已回覆"]].map(([key, label]) => (
              <button key={key} className={`${styles.tab} ${statusFilter === key ? styles.tabActive : ""}`} onClick={() => { setStatusFilter(key); setPage(1); }}>
                {label}
              </button>
            ))}
          </div>
          <span className={styles.dim}>{total} 則評價</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>學員</th><th>評分</th><th>評價內容</th><th>時間</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className={styles.empty}>載入中…</td></tr>
                : !ratings.length ? <tr><td colSpan={6} className={styles.empty}>暫無評價</td></tr>
                : ratings.map(r => (
                  <Fragment key={r.id}>
                    <tr style={{ opacity: r.hidden ? 0.5 : 1 }} className={replyingId === r.id ? styles.commentRowActive : ""}>
                      <td style={{ minWidth: 130 }}>
                        <div className={styles.commenterCell}>
                          <div className={styles.commenterAvatar}>{(r.user_name || r.user_email || "?")[0].toUpperCase()}</div>
                          <div>
                            <div className={styles.commenterName}>{r.user_name || "匿名"}</div>
                            <div className={styles.realIdentity}>{r.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td><Stars rating={r.score} /></td>
                      <td>
                        <div style={{ maxWidth: 240 }}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13, color: "#334155" }}>{r.content || "—"}</span>
                          {r.rating_replies?.length > 0 && (
                            <div className={styles.replyPreview}><span className={styles.replyLabel}>已回覆：</span>{r.rating_replies[0].admin_content}</div>
                          )}
                        </div>
                      </td>
                      <td className={styles.dim} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <span className={styles.pill} style={{ background: r.status === "replied" ? "#dcfce7" : "#fef3c7", color: r.status === "replied" ? "#166534" : "#92400e" }}>
                            {r.status === "replied" ? "已回覆" : "待回覆"}
                          </span>
                          {r.hidden && <span className={styles.pill} style={{ background: "#fee2e2", color: "#991b1b" }}>已隱藏</span>}
                        </div>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button className={styles.btnSmall} onClick={() => openReply(r)}>
                            <MessageSquare size={12} /> {replyingId === r.id ? "收起" : "回覆"}
                          </button>
                          <button
                            className={`${styles.btnSmall} ${r.hidden ? "" : styles.btnDanger}`}
                            style={r.hidden ? { background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" } : {}}
                            onClick={() => toggleHidden(r)}
                            disabled={savingId === r.id}
                          >
                            {r.hidden ? <><Eye size={12} /> 顯示</> : <><EyeOff size={12} /> 隱藏</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {replyingId === r.id && (
                      <tr className={styles.replyRow}>
                        <td colSpan={6}>
                          <div className={styles.replyBox}>
                            <textarea className={styles.replyTextarea} rows={3} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="輸入回覆內容…" autoFocus />
                            <div className={styles.replyActions}>
                              <button className={styles.btnPrimary} onClick={() => submitReply(r.id)} disabled={replying}>{replying ? "送出中…" : "送出回覆"}</button>
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
    </div>
  );
}

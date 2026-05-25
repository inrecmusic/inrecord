"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "./admin.module.css";
import { Plus, Edit2, Trash2, X, Eye, EyeOff, RefreshCw, Maximize2, Globe, Code2 } from "lucide-react";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

const EMPTY_FORM = {
  title: "", description: "", chapter_id: "", video_id: "",
  game_type: "html", html_content: "", external_url: "", is_active: true,
};

export default function GamesManagePage({ showToast }) {
  const [games, setGames]       = useState([]);
  const [chapters, setChapters] = useState([]);
  const [videos, setVideos]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const [modal, setModal]             = useState(null); // null | "create" | game-object
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formErr, setFormErr]         = useState("");
  const [previewModal, setPreviewModal] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteId, setDeleteId]       = useState(null);
  const [testingUrl, setTestingUrl]   = useState(false);
  const [urlStatus, setUrlStatus]     = useState(null); // null | "ok" | "fail"

  /* ── fetch all ── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gr, cr, vr] = await Promise.all([
        api("/api/admin/games"),
        api("/api/admin/chapters"),
        api("/api/admin/videos"),
      ]);
      setGames((await gr.json()).data || []);
      setChapters((await cr.json()).data || []);
      setVideos((await vr.json()).data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── filtered videos by chapter ── */
  const filteredVideos = form.chapter_id
    ? videos.filter(v => v.chapter_id === form.chapter_id)
    : videos;

  /* ── open create ── */
  function openCreate() {
    setForm(EMPTY_FORM); setFormErr(""); setUrlStatus(null); setModal("create");
  }

  /* ── open edit ── */
  function openEdit(game) {
    setFormErr(""); setUrlStatus(null);
    setForm({
      title:        game.title || "",
      description:  game.description || "",
      chapter_id:   game.chapter_id || "",
      video_id:     game.video_id || "",
      game_type:    game.game_type || "html",
      html_content: game.html_content || "",
      external_url: game.external_url || "",
      is_active:    game.is_active ?? true,
    });
    setModal(game);
  }

  /* ── open preview (load html_content if needed) ── */
  async function openPreview(game) {
    if (game.game_type === "url") { setPreviewModal(game); return; }
    if (game.html_content != null) { setPreviewModal(game); return; }
    setPreviewLoading(true);
    try {
      const r = await api(`/api/admin/games?id=${game.id}&html=1`);
      const { data } = await r.json();
      setPreviewModal(data || game);
    } catch { setPreviewModal(game); }
    finally { setPreviewLoading(false); }
  }

  /* ── test URL ── */
  async function testUrl() {
    if (!form.external_url.trim()) return;
    setTestingUrl(true); setUrlStatus(null);
    try {
      await fetch(form.external_url, { mode: "no-cors" });
      setUrlStatus("ok");
    } catch { setUrlStatus("fail"); }
    finally { setTestingUrl(false); }
  }

  /* ── save ── */
  async function saveGame(e) {
    e.preventDefault(); setFormErr("");
    if (!form.title.trim()) { setFormErr("請輸入遊戲名稱"); return; }
    if (form.game_type === "url" && !form.external_url.trim()) { setFormErr("請輸入外部網址"); return; }

    setSaving(true);
    try {
      const isEdit = modal && modal !== "create";
      const body = {
        title:        form.title.trim(),
        description:  form.description.trim() || null,
        chapter_id:   form.chapter_id || null,
        video_id:     form.video_id || null,
        game_type:    form.game_type,
        html_content: form.game_type === "html" ? form.html_content : null,
        external_url: form.game_type === "url"  ? form.external_url.trim() : null,
        is_active:    form.is_active,
      };
      if (isEdit) body.id = modal.id;

      const r = await api("/api/admin/games", {
        method: isEdit ? "PATCH" : "POST",
        body:   JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast(isEdit ? "✅ 遊戲已更新" : "✅ 遊戲已新增");
      setModal(null); fetchAll();
    } catch (err) { setFormErr(err.message || "儲存失敗"); }
    finally { setSaving(false); }
  }

  /* ── delete ── */
  async function confirmDelete() {
    setSaving(true);
    try {
      const r = await api(`/api/admin/games?id=${deleteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 遊戲已刪除"); setDeleteId(null); fetchAll();
    } catch (err) { showToast("❌ " + (err.message || "刪除失敗")); }
    finally { setSaving(false); }
  }

  /* ── toggle active ── */
  async function toggleActive(game) {
    try {
      await api("/api/admin/games", {
        method: "PATCH",
        body:   JSON.stringify({ id: game.id, is_active: !game.is_active }),
      });
      fetchAll();
    } catch { showToast("❌ 操作失敗"); }
  }

  const chapMap  = Object.fromEntries(chapters.map(c => [c.id, c.title]));
  const videoMap = Object.fromEntries(videos.map(v => [v.id, v.title]));

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>AI 遊戲管理</h1>
          <p>管理各單元的 AI 互動遊戲</p>
        </div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchAll}><RefreshCw size={13} /> 重新整理</button>
          <button className={styles.btnPrimary} onClick={openCreate}><Plus size={14} /> 新增遊戲</button>
        </div>
      </div>

      <div className={styles.panel}>
        {loading ? (
          <div className={styles.empty} style={{ padding: "40px 0" }}>載入中…</div>
        ) : !games.length ? (
          <div className={styles.empty} style={{ padding: "56px 0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎮</div>
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "#1e293b" }}>還沒有任何 AI 遊戲</p>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>點擊右上角「+ 新增遊戲」開始建立</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  {["遊戲名稱", "對應章節", "對應單元", "類型", "狀態", "操作"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.map(game => (
                  <tr key={game.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >
                    <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                      <div style={{ fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.title}</div>
                      {game.description && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.description}</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#475569", whiteSpace: "nowrap" }}>
                      {chapMap[game.chapter_id] || <span style={{ color: "#cbd5e1" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#475569", maxWidth: 180 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {videoMap[game.video_id] || <span style={{ color: "#cbd5e1" }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: game.game_type === "html" ? "#ede9fe" : "#dbeafe",
                        color: game.game_type === "html" ? "#5b21b6" : "#1d4ed8",
                      }}>
                        {game.game_type === "html" ? <><Code2 size={10} /> HTML</> : <><Globe size={10} /> URL</>}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: game.is_active ? "#dcfce7" : "#f1f5f9",
                        color: game.is_active ? "#166534" : "#475569",
                      }}>
                        {game.is_active ? <><Eye size={10} /> 啟用</> : <><EyeOff size={10} /> 停用</>}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button className={styles.btnSmall} onClick={() => openPreview(game)} disabled={previewLoading}>
                          <Eye size={12} /> 預覽
                        </button>
                        <button className={styles.btnSmall} onClick={() => openEdit(game)}><Edit2 size={12} /> 編輯</button>
                        <button className={styles.btnSmall} onClick={() => toggleActive(game)} style={{ minWidth: 56 }}>
                          {game.is_active ? <><EyeOff size={12} /> 停用</> : <><Eye size={12} /> 啟用</>}
                        </button>
                        <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => setDeleteId(game.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(null)}>
          <div
            className={styles.modalCard}
            style={{ width: "min(720px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>{modal === "create" ? "新增遊戲" : `編輯遊戲：${modal.title}`}</h3>
              <button className={styles.iconBtn} onClick={() => setModal(null)}><X size={18} /></button>
            </div>

            <form onSubmit={saveGame} style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, overflowY: "auto", paddingRight: 2 }}>
              {/* 名稱 */}
              <div className={styles.formGroup}>
                <label>遊戲名稱 *</label>
                <input className={styles.input} value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="例：音名快閃" />
              </div>

              {/* 說明 */}
              <div className={styles.formGroup}>
                <label>說明（選填）</label>
                <input className={styles.input} value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="遊戲的簡短說明" />
              </div>

              {/* 章節 + 單元 */}
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>對應章節</label>
                  <select className={styles.selectInput} style={{ width: "100%" }} value={form.chapter_id}
                    onChange={e => setForm(p => ({ ...p, chapter_id: e.target.value, video_id: "" }))}>
                    <option value="">— 不指定 —</option>
                    {chapters.map((c, i) => <option key={c.id} value={c.id}>Ch{i + 1}　{c.title}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>對應單元</label>
                  <select className={styles.selectInput} style={{ width: "100%" }} value={form.video_id}
                    onChange={e => setForm(p => ({ ...p, video_id: e.target.value }))}>
                    <option value="">— 不指定 —</option>
                    {filteredVideos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                  </select>
                </div>
              </div>

              {/* 遊戲類型 tabs */}
              <div className={styles.formGroup}>
                <label>遊戲類型</label>
                <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 10, width: "fit-content" }}>
                  {[{ id: "html", label: "貼上 HTML" }, { id: "url", label: "外部網址" }].map(t => (
                    <button key={t.id} type="button"
                      onClick={() => setForm(p => ({ ...p, game_type: t.id }))}
                      style={{
                        padding: "7px 20px", border: 0, cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: form.game_type === t.id ? "#7c3aed" : "#f8fafc",
                        color: form.game_type === t.id ? "#fff" : "#64748b",
                        transition: "background .15s, color .15s",
                      }}
                    >{t.label}</button>
                  ))}
                </div>

                {form.game_type === "html" ? (
                  <div style={{ position: "relative" }}>
                    <textarea
                      value={form.html_content}
                      onChange={e => setForm(p => ({ ...p, html_content: e.target.value }))}
                      placeholder={"將 AI 生成的完整 HTML 遊戲代碼貼在這裡..."}
                      spellCheck={false}
                      style={{
                        width: "100%", minHeight: 320, resize: "vertical",
                        fontFamily: "monospace", fontSize: 12, lineHeight: 1.6,
                        background: "#0f172a", color: "#e2e8f0",
                        border: "1px solid #1e293b", borderRadius: 8, padding: "12px 14px",
                        outline: "none", boxSizing: "border-box",
                      }}
                    />
                    {form.html_content && (
                      <button type="button"
                        onClick={() => setForm(p => ({ ...p, html_content: "" }))}
                        style={{
                          position: "absolute", top: 8, right: 8,
                          background: "rgba(255,255,255,0.12)", border: 0, cursor: "pointer",
                          color: "#94a3b8", fontSize: 11, padding: "3px 8px", borderRadius: 4,
                        }}
                      >清除</button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className={styles.input}
                        style={{ flex: 1 }}
                        value={form.external_url}
                        onChange={e => { setForm(p => ({ ...p, external_url: e.target.value })); setUrlStatus(null); }}
                        placeholder="https://..."
                      />
                      <button type="button" className={styles.btnSmall} onClick={testUrl}
                        disabled={testingUrl || !form.external_url.trim()}>
                        {testingUrl ? "測試中…" : "測試連線"}
                      </button>
                    </div>
                    {urlStatus === "ok"   && <p style={{ color: "#16a34a", fontSize: 12, margin: "6px 0 0" }}>✅ 連線成功</p>}
                    {urlStatus === "fail" && <p style={{ color: "#dc2626", fontSize: 12, margin: "6px 0 0" }}>❌ 無法連線，請確認網址</p>}
                  </div>
                )}
              </div>

              {/* 是否啟用 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>是否啟用</span>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                  style={{
                    width: 44, height: 24, borderRadius: 999, border: 0, cursor: "pointer",
                    background: form.is_active ? "#7c3aed" : "#d1d5db",
                    position: "relative", transition: "background .2s", flexShrink: 0,
                  }}
                >
                  <span style={{
                    display: "block", width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, left: form.is_active ? 23 : 3,
                    transition: "left .2s",
                  }} />
                </button>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {form.is_active ? "啟用（學員可遊玩）" : "停用（學員不可見）"}
                </span>
              </div>

              {formErr && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{formErr}</p>}

              <div className={styles.modalActions} style={{ flexShrink: 0, paddingTop: 4 }}>
                <button type="button" className={styles.btnSmall} onClick={() => setModal(null)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? "儲存中…" : modal === "create" ? "新增遊戲" : "儲存變更"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewModal && (
        <div className={styles.modalOverlay} onClick={() => setPreviewModal(null)}>
          <div
            style={{
              width: "min(860px, 96vw)", height: "min(560px, 90vh)",
              background: "#fff", borderRadius: 16, overflow: "hidden",
              display: "flex", flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>🎮 {previewModal.title}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={styles.btnSmall}
                  onClick={() => {
                    if (previewModal.game_type === "url") {
                      window.open(previewModal.external_url, "_blank");
                    } else {
                      const w = window.open("", "_blank");
                      w.document.write(previewModal.html_content || "");
                      w.document.close();
                    }
                  }}
                ><Maximize2 size={12} /> 全螢幕</button>
                <button className={styles.iconBtn} onClick={() => setPreviewModal(null)}><X size={18} /></button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {previewModal.game_type === "url" ? (
                <iframe
                  src={previewModal.external_url}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  referrerPolicy="no-referrer"
                  style={{ border: 0, width: "100%", height: "100%" }}
                  title={previewModal.title}
                />
              ) : (
                <iframe
                  srcDoc={previewModal.html_content || "<div style='display:grid;place-items:center;height:100%;font-family:system-ui;color:#94a3b8;font-size:14px'>尚無 HTML 內容</div>"}
                  sandbox="allow-scripts allow-forms"
                  referrerPolicy="no-referrer"
                  style={{ border: 0, width: "100%", height: "100%" }}
                  title={previewModal.title}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>確認刪除遊戲</h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>刪除後無法復原，確定要刪除此遊戲嗎？</p>
            <div className={styles.modalActions}>
              <button className={styles.btnSmall} onClick={() => setDeleteId(null)}>取消</button>
              <button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete} disabled={saving}>確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

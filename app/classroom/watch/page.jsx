"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { pickBanner } from "@/lib/announcements-view";
import { formatSeconds, sortNotes } from "@/lib/notes-format";
import { isProfileCoreComplete, isValidMobile, LEVELS } from "@/lib/student-profile";
import ProfileFields from "@/components/ProfileFields";

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function fmtDur(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const F = `var(--type-body)`;

// Bunny Stream 影片進度追蹤需要 player.js（Bunny CDN 提供）。注入一次、快取 Promise；
// 載入失敗就放棄（不擋影片播放）。用 window.playerjs.Player(iframe) 監聽 timeupdate。
let _playerJsPromise = null;
function loadPlayerJs() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.playerjs) return Promise.resolve();
  if (_playerJsPromise) return _playerJsPromise;
  _playerJsPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return _playerJsPromise;
}

function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("inrec_device_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("inrec_device_id", id); }
  return id;
}

// 送出前取「當下最新」的 access_token（getSession 會在過期時自動刷新），避免用到頁面
// 載入時抓的過期 token 而 401。取不到就退回傳入的 fallback token。
async function freshToken(fallback) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || fallback || "";
  } catch { return fallback || ""; }
}

/* ── CommentsSection ─────────────────────────────────────────────────────────── */
function CommentsSection({ token, video, chapters }) {
  const [filter, setFilter]   = useState("unit");
  const [comments, setComments] = useState([]);
  const [text, setText]       = useState("");
  const [posting, setPosting] = useState(false);
  const [msg, setMsg]         = useState("");

  useEffect(() => { setFilter("unit"); setComments([]); }, [video?.id]);

  const load = useCallback(async () => {
    if (!token) return;
    const url = filter === "unit" && video
      ? `/api/classroom/comments?video_id=${video.id}`
      : "/api/classroom/comments";
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const { data } = await r.json();
      setComments(data || []);
    } catch {}
  }, [token, video?.id, filter]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!text.trim() || !video) return;
    setPosting(true);
    try {
      const tk = await freshToken(token);
      const r = await fetch("/api/classroom/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ video_id: video.id, chapter_id: video.chapter_id, content: text.trim() }),
      });
      if (!r.ok) throw new Error("send_failed"); // 失敗不清空輸入、不顯示假成功
      setText(""); setMsg("留言已送出");
      setTimeout(() => setMsg(""), 2500);
      load();
    } catch { setMsg("送出失敗，請稍後再試"); setTimeout(() => setMsg(""), 2500); }
    finally { setPosting(false); }
  }

  const chapMap = Object.fromEntries((chapters || []).map(c => [c.id, c.title]));

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.07)", padding: "16px 20px" }}>
      {/* Header + filter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>學員留言</div>
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 2 }}>
          {[{ id: "unit", label: "此單元" }, { id: "all", label: "不分單元" }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: "4px 12px", fontSize: 12, fontWeight: filter === f.id ? 600 : 400,
                border: 0, cursor: "pointer", fontFamily: F, borderRadius: 6,
                background: filter === f.id ? "#fff" : "transparent",
                color: filter === f.id ? "#0f172a" : "#64748b",
                boxShadow: filter === f.id ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                transition: "all .12s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comment list */}
      <div style={{ marginBottom: 14 }}>
        {!comments.length ? (
          <p style={{ color: "#64748b", fontSize: 13.5, textAlign: "center", padding: "20px 0", margin: 0 }}>
            {!video
              ? "請先選擇課程單元"
              : filter === "unit"
              ? "此單元尚無留言，成為第一個留言的人！"
              : "尚無留言"}
          </p>
        ) : comments.map(c => (
          <div key={c.id} style={{
            padding: "12px 14px", borderRadius: 12, marginBottom: 8,
            background: "#f1f5f9", border: "1px solid rgba(0,0,0,0.05)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "#2563eb", color: "#fff",
                display: "grid", placeItems: "center",
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>
                {(c.user_name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{c.user_name || "學員"}</div>
                {chapMap[c.chapter_id] && (
                  <span style={{ fontSize: 11, color: "#2563eb", background: "rgba(37,99,235,0.08)", padding: "1px 8px", borderRadius: 20 }}>
                    {chapMap[c.chapter_id]}
                  </span>
                )}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>{c.content}</p>
            {c.comment_replies?.length > 0 && (
              <div style={{ marginTop: 9, paddingLeft: 12, borderLeft: "2px solid #2563eb" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", marginBottom: 3 }}>老師回覆</div>
                <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>{c.comment_replies[0].admin_content}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={video ? "輸入你的留言或問題…" : "請先選擇課程單元"}
          disabled={!video}
          rows={2}
          style={{
            width: "100%", background: "#f1f5f9",
            border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
            padding: "10px 12px", color: "#0f172a", fontSize: 13.5,
            fontFamily: F, resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />
        {msg && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#16a34a" }}>{msg}</p>}
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} disabled={posting || !text.trim() || !video}
            style={{
              background: "#2563eb", color: "#fff", border: 0, borderRadius: 980,
              padding: "7px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer",
              fontFamily: F, opacity: (!text.trim() || !video) ? 0.35 : 1,
              transition: "opacity .15s",
            }}
          >
            {posting ? "送出中…" : "送出"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── AnnouncementsBanner ───────────────────────────────────────────────────────── */
const DISMISS_KEY = "inrec_dismissed_announcement";

function AnnouncementsBanner({ token }) {
  const [list, setList] = useState([]);
  const [dismissedId, setDismissedId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setDismissedId(localStorage.getItem(DISMISS_KEY));
  }, []);

  useEffect(() => {
    if (!token) { setList([]); return; }
    let cancelled = false;
    fetch("/api/classroom/announcements", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { announcements: [] }))
      .then(d => { if (!cancelled) setList(d.announcements || []); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, [token]);

  const banner = pickBanner(list, dismissedId);

  function dismiss() {
    if (banner && typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, banner.id);
      setDismissedId(banner.id);
    }
  }

  if (!list.length) return null;

  return (
    <>
      {banner && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 20px", background: "#eff6ff",
          borderBottom: "1px solid #bfdbfe", fontFamily: F,
        }}>
          <span style={{ fontSize: 16 }}>📢</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a" }}>{banner.title}</span>
            <span style={{ fontSize: 13, color: "#1d4ed8", marginLeft: 8 }}>
              {banner.body.length > 60 ? banner.body.slice(0, 60) + "…" : banner.body}
            </span>
          </div>
          <button onClick={() => setShowAll(true)} style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F, flexShrink: 0 }}>全部公告</button>
          <button onClick={dismiss} aria-label="關閉公告" style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, lineHeight: 1, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>
      )}
      {!banner && (
        <div style={{ padding: "6px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontFamily: F }}>
          <button onClick={() => setShowAll(true)} style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>📢 查看公告（{list.length}）</button>
        </div>
      )}

      {showAll && (
        <div onClick={() => setShowAll(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "auto", padding: "22px 24px", fontFamily: F }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>📢 課程公告</h3>
              <button onClick={() => setShowAll(false)} aria-label="關閉" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {list.map(a => (
                <div key={a.id} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {a.pinned && <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 700 }}>置頂</span>}
                    <strong style={{ fontSize: 14, color: "#0f172a" }}>{a.title}</strong>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── MaterialsSection ─────────────────────────────────────────────────────────── */
function MaterialsSection({ token, video }) {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!token) { setItems([]); return; }
    let cancelled = false;
    const qs = video?.id ? `?video_id=${video.id}` : "";
    fetch(`/api/classroom/materials${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { materials: [] }))
      .then(d => { if (!cancelled) setItems(d.materials || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [token, video?.id]);

  async function openMaterial(id) {
    if (!token || busyId) return;
    setErr(""); setBusyId(id);
    // 下載當下才向後端要新鮮簽名 URL（僅 5 分鐘有效）。先在點擊的同步脈絡下開空白分頁，
    // 避免 await 之後再 window.open 被瀏覽器彈窗攔截。
    const w = typeof window !== "undefined" ? window.open("", "_blank", "noopener,noreferrer") : null;
    try {
      const r = await fetch(`/api/classroom/materials?id=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { if (w) w.location.href = d.url; else window.location.href = d.url; }
      else { if (w) w.close(); setErr("講義暫時無法下載，請稍後再試"); }
    } catch { if (w) w.close(); setErr("講義暫時無法下載，請稍後再試"); }
    setBusyId(null);
  }

  if (!items.length) return null;

  return (
    <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>📎 講義下載</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map(m => (
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
      {err && <div style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* ── RatingTab ───────────────────────────────────────────────────────────────── */
function RatingTab({ token }) {
  const [hover, setHover]       = useState(0);
  const [selected, setSelected] = useState(0);
  const [content, setContent]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [err, setErr]           = useState("");

  async function submit() {
    if (!selected) return;
    setSubmitting(true); setErr("");
    try {
      const tk = await freshToken(token);
      const r = await fetch("/api/classroom/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ score: selected, content }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok && json.error !== "already_rated") throw new Error(json.error || "送出失敗");
      setDone(true);
    } catch (e) { setErr(e.message === "unauthorized" ? "登入狀態逾時，請重新整理頁面再送一次" : (e.message || "送出失敗，請稍後再試")); }
    finally { setSubmitting(false); }
  }

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>⭐</div>
      <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 18, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: "0 0 14px" }}>你對這堂課的評分是？</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setSelected(i)}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 30, padding: 2, lineHeight: 1 }}
          >
            {(hover || selected) >= i ? "⭐" : "☆"}
          </button>
        ))}
      </div>
      {selected > 0 && (
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
          {["", "有點失望", "普通", "還不錯", "很好", "非常推薦！"][selected]}
        </p>
      )}
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="分享你的學習心得（選填）" rows={3}
        style={{
          width: "100%", background: "#f1f5f9",
          border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
          padding: "10px 12px", color: "#0f172a", fontSize: 13.5,
          fontFamily: F, resize: "vertical", outline: "none",
          boxSizing: "border-box", marginBottom: 14,
        }}
      />
      {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <button onClick={submit} disabled={!selected || submitting}
        style={{
          background: "#2563eb", color: "#fff", border: 0, borderRadius: 980,
          padding: "8px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          fontFamily: F, opacity: !selected ? 0.35 : 1, transition: "opacity .15s",
        }}
      >
        {submitting ? "送出中…" : "送出評分"}
      </button>
    </div>
  );
}

/* ── AssignmentTab ───────────────────────────────────────────────────────────── */
function AssignmentTab({ video, token }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone]           = useState(false);
  const [err, setErr]             = useState("");
  const [dragging, setDragging]   = useState(false);
  const inputRef = useRef(null);

  if (!video?.assignment_desc) return (
    <p style={{ color: "#64748b", fontSize: 13.5, textAlign: "center", paddingTop: 32, margin: 0, lineHeight: 1.6 }}>
      {video ? "此單元沒有作業" : "請先選擇課程單元"}
    </p>
  );

  async function handleFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErr("目前僅支援 JPG / PNG 格式的作業圖片上傳"); return;
    }
    setErr(""); setUploading(true);
    try {
      const tk = await freshToken(token); // 取最新 token，避免頁面開久後上傳/繳交 401
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload-proof", { method: "POST", body: fd, headers: { Authorization: `Bearer ${tk}` } });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || "上傳失敗，請確認 Supabase Storage 已設定");
      const url = uploadData.url;
      const subRes = await fetch("/api/classroom/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ video_id: video.id, file_name: file.name, file_url: url }),
      });
      if (!subRes.ok) throw new Error((await subRes.json().catch(() => ({}))).error || "提交失敗");
      setDone(true);
    } catch (e) { setErr(e.message || "繳交失敗，請稍後再試"); }
    finally { setUploading(false); }
  }

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
      <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 16, margin: "0 0 6px" }}>作業已成功繳交！</p>
      <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>老師會批改後回覆，請留意通知</p>
      <button onClick={() => setDone(false)}
        style={{ marginTop: 18, background: "none", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 980,
          padding: "6px 18px", fontSize: 13, cursor: "pointer", color: "#334155" }}>
        再次繳交
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ background: "#f1f5f9", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>
          作業說明
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "#0f172a", lineHeight: 1.65 }}>{video.assignment_desc}</p>
        {video.assignment_due && (
          <p style={{ fontSize: 12, color: "#64748b", margin: "6px 0 0" }}>截止日期：{video.assignment_due}</p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" style={{ display: "none" }}
        onChange={e => handleFile(e.target.files?.[0])} />
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!uploading) handleFile(e.dataTransfer.files?.[0]); }}
        style={{
          border: `1.5px dashed ${dragging ? "#2563eb" : "rgba(0,0,0,0.13)"}`,
          borderRadius: 12, padding: "36px 20px", textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          background: dragging ? "rgba(37,99,235,0.04)" : "transparent",
          transition: "background .15s, border-color .15s",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>{uploading ? "⏳" : "📎"}</div>
        <div style={{ fontSize: 13.5, color: "#475569" }}>
          {uploading ? "上傳中，請稍候…" : "點擊或拖曳圖片上傳作業"}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>支援 JPG、PNG 格式</div>
      </div>
      {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0 0", textAlign: "center" }}>{err}</p>}
    </div>
  );
}

/* ── GamesTab ────────────────────────────────────────────────────────────────── */
function GamesTab({ token, hasSubscription, video, gameCache }) {
  const [games, setGames]               = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameContent, setGameContent]   = useState(null);
  const [gameLoading, setGameLoading]   = useState(false);
  const [gameError, setGameError]       = useState("");
  const [listLoading, setListLoading]   = useState(false);

  const videoId = video?.id;

  useEffect(() => {
    setSelectedGame(null); setGameContent(null); setGames([]);
    if (!hasSubscription || !token || !videoId) return;
    const cacheKey = `list:${videoId}`;
    if (gameCache?.current[cacheKey]) {
      setGames(gameCache.current[cacheKey]);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    (async () => {
      try {
        const tk = await freshToken(token); // 取當下最新 token，避免頁面開久後 401 導致誤判「此單元暫無遊戲」
        const r = await fetch(`/api/classroom/games?video_id=${videoId}`, { headers: { Authorization: `Bearer ${tk}` } });
        const { games } = await r.json();
        const list = games || [];
        if (gameCache) gameCache.current[cacheKey] = list;
        if (!cancelled) setGames(list);
      } catch {}
      finally { if (!cancelled) setListLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [hasSubscription, token, videoId]);

  useEffect(() => {
    if (!selectedGame) return;
    if (selectedGame.game_type === "url") { setGameError(""); setGameContent(selectedGame); return; }
    if (gameCache?.current[selectedGame.id]) {
      setGameError("");
      setGameContent(gameCache.current[selectedGame.id]);
      return;
    }
    let cancelled = false; // 避免快速切換遊戲時，較慢回來的舊請求覆蓋新選遊戲的內容
    setGameLoading(true);
    setGameContent(null);
    setGameError("");
    freshToken(token).then(tk => fetch(`/api/classroom/games?id=${selectedGame.id}&device_id=${getDeviceId()}`, {
      headers: { Authorization: `Bearer ${tk}` },
    }))
      .then(async r => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}));
          if (d.error === "device_limit") {
            if (!cancelled) setGameError(`已達裝置上限（${d.limit} 台）。請在其他常用裝置登出遊戲，或聯繫客服。`);
          }
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        const game = data.game;
        if (game && gameCache) gameCache.current[selectedGame.id] = game;
        if (!cancelled) setGameContent(game || null);
      })
      .catch(() => { if (!cancelled) setGameContent(null); })
      .finally(() => { if (!cancelled) setGameLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGame, token]);

  if (!hasSubscription) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <h3 style={{ margin: "0 0 8px", fontFamily: "var(--type-display)", fontSize: 22, fontWeight: 500, color: "#0f172a", letterSpacing: "-.01em" }}>
          尚未開通遊戲
        </h3>
        <p style={{ color: "#475569", margin: "0 0 24px", fontSize: 14, lineHeight: 1.6 }}>
          購買「學琴全攻略」即可永久暢玩
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <a href="/#pricing"
            style={{
              background: "#2563eb", color: "#fff", padding: "10px 22px",
              borderRadius: 980, textDecoration: "none", fontWeight: 600, fontSize: 14,
              fontFamily: F,
            }}
          >
            前往購買
          </a>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>
          一次買斷・永久使用・無訂閱月費
        </p>
      </div>
    );
  }

  if (selectedGame) {
    const isUrlGame = selectedGame.game_type === "url";
    const closeGame = () => { setSelectedGame(null); setGameContent(null); };
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "#000", display: "flex", flexDirection: "column",
      }}>
        {/* Title bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          padding: "10px 16px", background: "#1c1c1e",
        }}>
          <button
            onClick={closeGame}
            style={{
              background: "rgba(255,255,255,0.12)", border: 0, cursor: "pointer",
              color: "#fff", fontSize: 13, fontWeight: 500, padding: "6px 14px",
              borderRadius: 980, fontFamily: F, lineHeight: 1,
            }}
          >
            ← 返回
          </button>
          <span style={{ color: "#f5f5f7", fontSize: 14, fontWeight: 600, fontFamily: F }}>
            🎮 {selectedGame.title}
          </span>
          {selectedGame.game_type === "url" && (
            <span style={{ marginLeft: 8, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 980, fontWeight: 600 }}>試玩</span>
          )}
        </div>
        {/* Game content */}
        {gameError ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 20px", textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
              <p style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: 320 }}>{gameError}</p>
            </div>
          </div>
        ) : isUrlGame ? (
          <iframe
            src={selectedGame.external_url}
            allow="autoplay; fullscreen"
            style={{ flex: 1, border: 0, display: "block", width: "100%" }}
            title={selectedGame.title}
          />
        ) : gameLoading ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <div style={{
              width: 28, height: 28, border: "2.5px solid rgba(255,255,255,0.15)",
              borderTopColor: "#2563eb", borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }} />
          </div>
        ) : (
          <iframe
            srcDoc={gameContent?.html_content || "<div style='display:grid;place-items:center;height:100vh;font-family:system-ui;color:#64748b'>遊戲內容即將上線</div>"}
            sandbox="allow-scripts allow-forms"
            style={{ flex: 1, border: 0, display: "block", width: "100%" }}
            title={selectedGame.title}
          />
        )}
      </div>
    );
  }

  if (listLoading) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: 48 }}>
        <div style={{
          width: 24, height: 24, border: "2.5px solid rgba(0,0,0,0.08)",
          borderTopColor: "#2563eb", borderRadius: "50%",
          animation: "spin .7s linear infinite",
        }} />
      </div>
    );
  }

  if (!games.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🎮</div>
        <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 16, margin: "0 0 6px" }}>此單元暫無遊戲</p>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>已開通，更多遊戲陸續上線中</p>
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: 12,
    }}>
      {games.map(game => (
        <button key={game.id} onClick={() => setSelectedGame(game)}
          style={{
            border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "18px 12px",
            background: "#f1f5f9", cursor: "pointer", textAlign: "center", fontFamily: F,
            transition: "background .12s, box-shadow .12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.06)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(37,99,235,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>{game.title}</div>
          {game.game_type === "url" && (
            <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 980, fontWeight: 600 }}>試玩</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── NotesTab ────────────────────────────────────────────────────────────────── */
function NotesTab({ token, video, playerCtrl }) {
  const [notes, setNotes]   = useState([]);
  const [body, setBody]     = useState("");
  const [busy, setBusy]     = useState(false);
  const [noteErr, setNoteErr] = useState("");
  const [editId, setEditId] = useState(null);   // 編輯中的筆記 id
  const [editText, setEditText] = useState("");
  const pausedRef = useRef(false);               // 是否因記筆記而暫停（供結束後恢復播放）
  const vidRef = useRef(video?.id);

  // 此單元筆記
  useEffect(() => {
    vidRef.current = video?.id;
    if (!token || !video?.id) { setNotes([]); return; }
    let cancelled = false;
    fetch(`/api/classroom/notes?video_id=${video.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { notes: [] }))
      .then(d => { if (!cancelled) setNotes(sortNotes(d.notes || [])); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [token, video?.id]);

  // 自動暫停：聚焦輸入框時暫停影片，方便記筆記
  function onFocusNote() {
    if (playerCtrl?.current?.pause) { try { playerCtrl.current.pause(); pausedRef.current = true; } catch {} }
  }
  function resumeIfPaused() {
    if (pausedRef.current && playerCtrl?.current?.play) { try { playerCtrl.current.play(); } catch {} }
    pausedRef.current = false;
  }

  async function add() {
    const text = body.trim();
    if (!text || !video?.id) return;
    const vid = video.id;
    setBusy(true);
    let seconds = 0;
    try {
      const s = playerCtrl?.current?.getSeconds ? await playerCtrl.current.getSeconds() : 0;
      seconds = Math.max(0, Math.floor(Number(s) || 0));
    } catch { seconds = 0; }
    try {
      const tk = await freshToken(token);
      const r = await fetch("/api/classroom/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ video_id: vid, seconds, body: text }),
      });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        setBody(""); setNoteErr("");
        if (d.id && vidRef.current === vid) {
          setNotes(prev => sortNotes([...prev, { id: d.id, video_id: vid, seconds, body: text }]));
        }
        resumeIfPaused(); // 記完自動繼續播放
      } else {
        setNoteErr(r.status === 401 ? "登入狀態逾時，請重新整理頁面再試" : "筆記儲存失敗，請稍後再試");
      }
    } catch { setNoteErr("筆記儲存失敗，請稍後再試"); }
    setBusy(false);
  }

  async function saveEdit(id) {
    const text = editText.trim();
    if (!text) return;
    setBusy(true);
    try {
      const tk = await freshToken(token);
      const r = await fetch("/api/classroom/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ id, body: text }),
      });
      if (r.ok) {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, body: text } : n));
        setEditId(null); setEditText(""); resumeIfPaused();
      } else { setNoteErr("筆記更新失敗，請稍後再試"); }
    } catch { setNoteErr("筆記更新失敗，請稍後再試"); }
    setBusy(false);
  }

  async function remove(id) {
    setBusy(true);
    try {
      const tk = await freshToken(token);
      const r = await fetch(`/api/classroom/notes?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok) setNotes(prev => prev.filter(n => n.id !== id));
    } catch {}
    setBusy(false);
  }

  function seek(sec) {
    if (playerCtrl?.current?.seek) { try { playerCtrl.current.seek(sec); } catch {} }
  }

  // ⚠️ 用「render 函式」而非巢狀 <NoteRow> 元件——巢狀元件每次父重繪都被當新元件整個
  // 卸載重掛，會導致編輯 textarea 一打字就失焦。函式回傳 JSX 則只是內聯、不建立元件邊界。
  function renderRow(n) {
    const editing = editId === n.id;
    return (
      <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", border: "1px solid #eef2f7", borderRadius: 10 }}>
        <button onClick={() => seek(n.seconds)} title="跳到此時間點" style={{
          flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#1d4ed8",
          background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "3px 8px", cursor: "pointer", fontFamily: F,
        }}>{formatSeconds(n.seconds)}</button>
        {editing ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea value={editText} onChange={e => setEditText(e.target.value)} onFocus={onFocusNote} autoFocus rows={2}
              style={{ width: "100%", padding: "7px 10px", fontSize: 14, border: "1px solid #d5dce6", borderRadius: 8, outline: "none", fontFamily: F, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => saveEdit(n.id)} disabled={busy || !editText.trim()} style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: busy || !editText.trim() ? "#94a3b8" : "#2563eb", border: 0, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontFamily: F }}>儲存</button>
              <button onClick={() => { setEditId(null); setEditText(""); resumeIfPaused(); }} style={{ fontSize: 12, color: "#64748b", background: "none", border: 0, cursor: "pointer", fontFamily: F }}>取消</button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14, color: "#0f172a", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.body}</span>
          </div>
        )}
        {!editing && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setEditId(n.id); setEditText(n.body); }} aria-label="編輯筆記" title="編輯" style={{ background: "none", border: "none", color: "#64748b", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>✎</button>
            <button onClick={() => remove(n.id)} disabled={busy} aria-label="刪除筆記" title="刪除" style={{ background: "none", border: "none", color: "#dc2626", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        )}
      </div>
    );
  }

  if (!video) return (
    <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 14, padding: "28px 0", fontFamily: F }}>請先選擇課程單元</div>
  );

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          onFocus={onFocusNote}
          placeholder="在目前播放位置記筆記…（點這裡會自動暫停影片）"
          rows={2}
          style={{ flex: 1, padding: "9px 12px", fontSize: 14, border: "1px solid #d5dce6", borderRadius: 10, outline: "none", fontFamily: F, resize: "vertical" }}
        />
        <button onClick={add} disabled={busy || !body.trim()} style={{
          alignSelf: "stretch", padding: "0 16px", fontSize: 13, fontWeight: 600,
          color: "#fff", background: busy || !body.trim() ? "#94a3b8" : "#2563eb",
          border: "none", borderRadius: 10, cursor: busy || !body.trim() ? "default" : "pointer", fontFamily: F, flexShrink: 0,
        }}>＋ 在此刻加筆記</button>
      </div>
      <p style={{ fontSize: 11.5, color: "#94a3b8", margin: "0 0 14px" }}>記完會自動繼續播放。</p>
      {noteErr && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{noteErr}</p>}

      {notes.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "18px 0" }}>此單元尚無筆記</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>{sortNotes(notes).map(n => renderRow(n))}</div>
      )}
    </div>
  );
}

/* ── QuizTab ─────────────────────────────────────────────────────────────────── */
function QuizTab({ token, video }) {
  const [quizzes, setQuizzes] = useState([]);
  const [active, setActive] = useState(null); // { quiz, questions }
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const chapterId = video?.chapter_id;

  useEffect(() => {
    setActive(null); setResult(null); setAnswers({});
    if (!token || !chapterId) { setQuizzes([]); return; }
    let cancelled = false;
    fetch(`/api/classroom/quizzes?chapter_id=${chapterId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { quizzes: [] }))
      .then(d => { if (!cancelled) setQuizzes(d.quizzes || []); })
      .catch(() => { if (!cancelled) setQuizzes([]); });
    return () => { cancelled = true; };
  }, [token, chapterId]);

  async function openQuiz(id) {
    setBusy(true); setResult(null); setAnswers({});
    try {
      const r = await fetch(`/api/classroom/quiz?id=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setActive(await r.json());
    } catch {}
    setBusy(false);
  }

  async function submit() {
    if (!active) return;
    const ans = active.questions.map((q, i) => (answers[i] ?? -1));
    setBusy(true);
    try {
      const r = await fetch("/api/classroom/quiz-attempt", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quiz_id: active.quiz.id, answers: ans }),
      });
      if (r.ok) {
        const rr = await r.json();
        setResult(rr);
        // 用計分回應在本地更新該筆徽章（最佳分/是否通過），不重新抓整份清單：省一次往返，
        // 且函式式更新＋比對 quiz id → 切換章節時 prev 已是新章節、找不到此 id 即不動，無競態。
        setQuizzes(prev => prev.map(qz => qz.id === active.quiz.id
          ? { ...qz, best_score: Math.max(Number(qz.best_score) || 0, Number(rr.score) || 0), passed: qz.passed || !!rr.passed }
          : qz));
      }
    } catch {}
    setBusy(false);
  }

  if (!video) return <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 14, padding: "28px 0", fontFamily: F }}>請先選擇課程單元</div>;

  // 作答視圖
  if (active) {
    return (
      <div style={{ fontFamily: F }}>
        <button onClick={() => { setActive(null); setResult(null); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: 13, cursor: "pointer", marginBottom: 12, fontFamily: F }}>← 返回測驗列表</button>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#0f172a" }}>{active.quiz.title}</h3>
        {active.questions.map((q, i) => {
          // 後端只回每題對錯 boolean（不含正解索引），只能對「學員選的那項」上色，無法標出正解在哪。
          const answeredCorrectly = result?.results?.[i];
          return (
            <div key={q.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>{i + 1}. {q.question}</div>
              {(q.options || []).map((o, j) => {
                const chosen = answers[i] === j;
                const showCorrect = result && chosen && answeredCorrectly === true;
                const showWrong = result && chosen && answeredCorrectly === false;
                return (
                  <label key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, marginBottom: 4, cursor: result ? "default" : "pointer",
                    background: showCorrect ? "#dcfce7" : showWrong ? "#fee2e2" : chosen ? "#eff6ff" : "#f8fafc", fontSize: 14, color: "#0f172a" }}>
                    <input type="radio" name={`q-${q.id}`} disabled={!!result} checked={chosen} onChange={() => setAnswers(a => ({ ...a, [i]: j }))} />
                    {o}{showCorrect ? "　✔" : showWrong ? "　✘" : ""}
                  </label>
                );
              })}
            </div>
          );
        })}
        {result ? (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: result.passed ? "#dcfce7" : "#fef9c3", marginTop: 8 }}>
            <strong style={{ color: result.passed ? "#166534" : "#854d0e", fontSize: 15 }}>
              {result.passed ? "🎉 通過！" : "再接再厲"} 得分 {result.score} 分
            </strong>
            <button onClick={() => { setResult(null); setAnswers({}); }} style={{ display: "block", marginTop: 10, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>重新作答</button>
          </div>
        ) : (
          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: 12, background: busy ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: F }}>{busy ? "計分中…" : "送出答案"}</button>
        )}
      </div>
    );
  }

  // 列表視圖
  return (
    <div style={{ fontFamily: F }}>
      {quizzes.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "18px 0" }}>此章節尚無測驗</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {quizzes.map(q => (
            <button key={q.id} onClick={() => openQuiz(q.id)} disabled={busy} style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontFamily: F }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{q.title}</span>
              <span style={{ fontSize: 12, flexShrink: 0, color: q.passed ? "#16a34a" : "#94a3b8", fontWeight: 600 }}>
                {q.passed ? "✔ 已通過" : q.best_score != null ? `最佳 ${q.best_score} 分` : `及格 ${q.pass_score} 分`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ProfileOnboarding ───────────────────────────────────────────────────────── */
function ProfileOnboarding({ token, initial, onDone }) {
  const [f, setF] = useState({ real_name: "", phone: "", level: "", goal: "", source: "", equipment: "", age_group: "", gender: "", ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(skipOptional) {
    setErr("");
    if (!f.real_name.trim()) { setErr("請填真實姓名"); return; }
    if (!isValidMobile(f.phone)) { setErr("手機格式需為 09 開頭共 10 碼"); return; }
    if (!LEVELS.includes(f.level)) { setErr("請選擇鋼琴程度"); return; }
    setBusy(true);
    try {
      // 掛太久 access_token 可能過期 → 存檔前取最新 session（supabase 會自動刷新），避免 401
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || token;
      const body = skipOptional ? { real_name: f.real_name, phone: f.phone, level: f.level } : f;
      const r = await fetch("/api/classroom/profile", { method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify(body) });
      if (r.status === 401) { setErr("登入狀態逾時，請重新整理頁面後再存一次"); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setErr("儲存失敗：" + (d.error || "請稍後再試")); return; }
      onDone({ ...f, ...body });
    } catch { setErr("儲存失敗，請稍後再試"); }
    finally { setBusy(false); }
  }
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10 };
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "grid", placeItems: "center", padding: "40px 20px" }}>
      <div style={{ width: "min(480px,100%)", background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>完善你的學員資料</h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>幾個問題，幫我們更了解你、安排適合的教學（核心必填，其餘可之後補）。</p>
        <div style={{ display: "grid", gap: 12 }}>
          <ProfileFields prof={f} setProf={setF} styles={{ input, label }} />
          {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{err}</p>}
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>填寫即表示同意依<a href="/privacy" style={{ color: "#2563eb" }}>隱私政策</a>將資料用於課程服務與聯繫。</p>
          <button onClick={() => save(false)} disabled={busy} style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10 }}>{busy ? "儲存中…" : "儲存並開始上課"}</button>
          <button onClick={() => save(true)} disabled={busy} style={{ width: "100%", padding: 10, fontSize: 13, color: "#64748b", background: "none", border: 0 }}>只填必填、其餘之後補</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────────── */
export default function ClassroomPage() {
  const [user, setUser]                   = useState(null);
  const [token, setToken]                 = useState("");
  const [hasPurchased, setHasPurchased]   = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subDaysLeft, setSubDaysLeft]     = useState(0);
  const [loading, setLoading]             = useState(true);

  const [profile, setProfile]             = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileErr, setProfileErr]       = useState(false);

  const [chapters, setChapters]           = useState([]);
  const [videos, setVideos]               = useState([]);
  const [currentVideo, setCurrentVideo]   = useState(null);
  const [embedSrc, setEmbedSrc] = useState("");
  const [progress, setProgress]           = useState([]);
  const [tab, setTab]                     = useState("rating");

  const gameCacheRef                      = useRef({});
  const playerCtrlRef = useRef(null); // { getSeconds, seek, pause, play }
  const [isTablet, setIsTablet]           = useState(false);
  const [isPhone, setIsPhone]             = useState(false);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  useEffect(() => {
    const check = () => {
      setIsTablet(window.innerWidth <= 1024);
      setIsPhone(window.innerWidth <= 640);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* auth + purchase + subscription */
  useEffect(() => {
    async function init() {
      try {
        if (!supabase) { window.location.href = "/classroom/login"; return; }
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { window.location.href = "/classroom/login"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token || "";
        setUser(u);
        setToken(accessToken);
        try {
          const authHeaders = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          };
          const [purchaseRes, subRes] = await Promise.all([
            fetch("/api/classroom/verify-purchase", {
              method: "POST",
              headers: authHeaders,
            }),
            fetch("/api/classroom/verify-subscription", {
              method: "POST",
              headers: authHeaders,
            }),
          ]);
          const { hasPurchased } = await purchaseRes.json();
          const subData = await subRes.json();
          setHasPurchased(!!hasPurchased);
          setHasSubscription(!!subData.hasSubscription);
          setSubDaysLeft(subData.daysLeft || 0);
        } catch {
          setHasPurchased(false);
          setHasSubscription(false);
        }
      } catch {
        window.location.href = "/classroom/login";
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  /* 保持 access_token 新鮮：Supabase 背景會自動刷新（預設 1h 到期），
     這裡訂閱刷新事件同步更新 token state，否則播放頁開久後所有寫入
     （評分／筆記／進度）會用到過期 token 而默默 401 失敗。 */
  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  /* load real course data */
  useEffect(() => {
    if (!hasPurchased || !token) return;
    async function load() {
      try {
        const [cr, pr] = await Promise.all([
          fetch(`/api/classroom/course?device_id=${getDeviceId()}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/classroom/progress", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const course = await cr.json();
        const prog   = await pr.json();
        const vids   = course.videos   || [];
        const chaps  = course.chapters || [];
        setChapters(chaps);
        setVideos(vids);
        setProgress(prog.progress || []);
        if (vids.length) {
          const pm = Object.fromEntries((prog.progress || []).map(p => [p.video_id, p]));
          // 來自儀表板的 ?v=<單元id> 優先選中；否則預設第一個未完成、再否則第一支
          const wantId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("v") : null;
          setCurrentVideo((wantId && vids.find(v => v.id === wantId)) || vids.find(v => !pm[v.id]?.completed) || vids[0]);
        }
      } catch {}
    }
    load();
  }, [hasPurchased, token]);

  /* 抓學員資料（首次引導判斷用；核心未填會在下方 gate 顯示 ProfileOnboarding，仿上方 course/progress 抓法）。
     fetch 本身失敗（如離線）也要 fail-open：profileErr 記錄失敗、profileLoaded 無論成敗都設 true，
     否則下方 gate 會一直卡在 loading，把已購課使用者鎖死。 */
  useEffect(() => {
    if (!hasPurchased || !token) return;
    (async () => {
      try {
        const r = await fetch("/api/classroom/profile", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json().catch(() => ({}));
        setProfile(d.profile || d.prefill || {});
      } catch {
        setProfileErr(true);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [hasPurchased, token]);

  /* Vimeo player time-based progress tracking (every 10s) */
  useEffect(() => {
    if (!currentVideo?.vimeo_id || !token) return;
    const videoId = currentVideo.id;
    let interval;
    let player;
    let cancelled = false;

    async function setup() {
      const { default: Player } = await import("@vimeo/player");
      if (cancelled) return;
      const iframe = document.getElementById("vimeo-player");
      if (!iframe) return;
      player = new Player(iframe);
      await player.ready();
      if (cancelled) return;

      playerCtrlRef.current = {
        getSeconds: () => player.getCurrentTime(),
        seek: (sec) => player.setCurrentTime(sec),
        pause: () => { try { player.pause(); } catch {} },
        play: () => { try { player.play(); } catch {} },
      };

      interval = setInterval(async () => {
        try {
          const [currentTime, duration] = await Promise.all([
            player.getCurrentTime(),
            player.getDuration(),
          ]);
          if (!duration) return;
          const tk = await freshToken(token);
          const r = await fetch("/api/classroom/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
            body: JSON.stringify({
              video_id: videoId,
              watched_seconds: Math.floor(currentTime),
              total_seconds: Math.floor(duration),
              completed: currentTime / duration >= 0.8,
            }),
          });
          const { data } = await r.json();
          if (data) setProgress(prev => {
            const i = prev.findIndex(p => p.video_id === videoId);
            return i >= 0 ? prev.map((p, j) => j === i ? data : p) : [...prev, data];
          });
        } catch {}
      }, 10000);
    }

    setup();
    return () => { cancelled = true; playerCtrlRef.current = null; clearInterval(interval); player?.destroy(); };
  }, [currentVideo?.id, token]);

  // Bunny 影片：切換時向後端索取帶 token 的簽名 embed URL（Vimeo 不走此路徑）
  useEffect(() => {
    setEmbedSrc("");
    const vid = currentVideo?.id;
    if (!vid || !token || !currentVideo?.bunny_video_id) return;
    fetch(`/api/classroom/video-embed?video_id=${vid}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.src) setEmbedSrc(data.src); })
      .catch(() => {});
  }, [currentVideo?.id, token]);

  /* Bunny player time-based progress tracking (player.js, 每 10 秒) — 比照 Vimeo。
     正式課程影片走 Bunny，原本只有 Vimeo 有進度回報 → 側欄進度/已完成永遠 0。 */
  useEffect(() => {
    if (!currentVideo?.bunny_video_id || !token || !embedSrc) return;
    const videoId = currentVideo.id;
    let interval, cancelled = false, lastSeconds = 0, lastDuration = 0;

    async function postProgress() {
      if (!lastDuration) return;
      try {
        const tk = await freshToken(token);
        const r = await fetch("/api/classroom/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
          body: JSON.stringify({
            video_id: videoId,
            watched_seconds: Math.floor(lastSeconds),
            total_seconds: Math.floor(lastDuration),
            completed: lastSeconds / lastDuration >= 0.8,
          }),
        });
        const { data } = await r.json();
        if (data && !cancelled) setProgress(prev => {
          const i = prev.findIndex(p => p.video_id === videoId);
          return i >= 0 ? prev.map((p, j) => j === i ? data : p) : [...prev, data];
        });
      } catch {}
    }

    async function setup() {
      await loadPlayerJs();
      if (cancelled || !window.playerjs) return;
      const iframe = document.getElementById("bunny-player");
      if (!iframe) return;
      const player = new window.playerjs.Player(iframe);
      player.on("ready", () => {
        if (cancelled) return;
        playerCtrlRef.current = {
          getSeconds: () => Promise.resolve(lastSeconds),
          seek: (sec) => player.setCurrentTime(sec),
          pause: () => { try { player.pause(); } catch {} },
          play: () => { try { player.play(); } catch {} },
        };
        player.on("timeupdate", (d) => { lastSeconds = d?.seconds || 0; lastDuration = d?.duration || 0; });
        player.on("ended", () => { if (lastDuration) { lastSeconds = lastDuration; postProgress(); } });
        interval = setInterval(postProgress, 10000);
      });
    }

    setup();
    return () => { cancelled = true; playerCtrlRef.current = null; clearInterval(interval); };
  }, [currentVideo?.id, token, embedSrc]);

  function handleSelect(v) {
    setCurrentVideo(v);
    if (isTablet) setDrawerOpen(false);
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  /* ── Loading ──（已購課但 profile 尚未抓完也算 loading，避免先閃教室主體再跳引導表單） */
  if (loading || (hasPurchased && token && !profileLoaded)) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff", fontFamily: F }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 28, height: 28, border: "2.5px solid rgba(0,0,0,0.08)",
          borderTopColor: "#2563eb", borderRadius: "50%",
          animation: "spin .7s linear infinite", margin: "0 auto 12px",
        }} />
        <p style={{ fontSize: 14, color: "#64748b", margin: 0, fontWeight: 400 }}>載入中…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── No purchase ── */
  if (!hasPurchased) return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "#f1f5f9", color: "#0f172a", textAlign: "center",
      padding: 32, fontFamily: F,
    }}>
      <div>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎹</div>
        <h2 style={{ margin: "0 0 10px", fontFamily: "var(--type-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-.02em" }}>尚未購買課程</h2>
        <p style={{ color: "#475569", marginBottom: 32, fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto 32px" }}>
          請先完成購課，即可觀看所有教學影片。
        </p>
        <a href="/#pricing" style={{
          display: "inline-block", padding: "13px 32px",
          background: "#2563eb", color: "#fff", borderRadius: 980,
          fontWeight: 600, textDecoration: "none", fontSize: 15, fontFamily: F,
        }}>
          查看課程方案
        </a>
        <div style={{ marginTop: 16 }}>
          <button onClick={handleLogout} style={{
            background: "none", border: 0, color: "#94a3b8",
            cursor: "pointer", fontSize: 13, fontFamily: F,
          }}>
            登出
          </button>
        </div>
      </div>
    </div>
  );

  // 首次引導：已購課但核心資料未填 → 先完善資料（選配可跳過）；profileErr（fetch 失敗）fail-open 放行進教室，不卡在引導
  if (hasPurchased && profileLoaded && !profileErr && !isProfileCoreComplete(profile)) {
    return <ProfileOnboarding token={token} initial={profile} onDone={(p) => setProfile(p)} />;
  }

  const progMap         = Object.fromEntries(progress.map(p => [p.video_id, p]));
  const doneCount       = progress.filter(p => p.completed).length;
  const totalCount      = videos.length;
  const pct             = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const chap            = chapters.find(c => c.id === currentVideo?.chapter_id);
  const currentProgEntry = currentVideo ? progMap[currentVideo.id] : null;
  const isDone          = !!currentProgEntry?.completed;
  const currentWatchPct = (currentProgEntry?.total_seconds > 0)
    ? Math.min(100, Math.round((currentProgEntry.watched_seconds / currentProgEntry.total_seconds) * 100))
    : 0;

  /* ── Classroom ── */
  return (
    <div style={{
      height: isTablet ? "auto" : "100dvh",
      minHeight: "100dvh",
      background: "#f1f5f9", color: "#0f172a",
      display: "flex", flexDirection: "column",
      overflow: isTablet ? "auto" : "hidden",
      fontFamily: F,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
        @media (max-width: 640px) {
          input, textarea, select { font-size: 16px !important; }
        }
      `}</style>

      {/* ── Topbar ── */}
      <header style={{
        height: 52, flexShrink: 0,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 22px",
      }}>
        <a href="/classroom" aria-label="回教室" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logo-wordmark.png" alt="InRecord" style={{ height: 24, width: "auto", display: "block" }} />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isTablet && <span style={{ fontSize: 13, color: "#64748b" }}>{user?.email}</span>}

          {hasSubscription ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 600, color: "#16a34a",
              background: "rgba(22,163,74,0.1)", padding: "4px 12px", borderRadius: 980,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#16a34a", display: "inline-block",
              }} />
              遊戲・已開通
            </div>
          ) : (
            <a href="/#pricing" style={{
              background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
              color: "#fff", borderRadius: 980, padding: "4px 12px",
              fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: F,
            }}>
              🎮 購買遊戲
            </a>
          )}

          <a href="/classroom/account" style={{
            background: "none", border: "1px solid rgba(0,0,0,0.13)",
            color: "#334155", borderRadius: 980, padding: "5px 16px",
            cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: F,
            textDecoration: "none",
          }}>
            帳號
          </a>

          <button onClick={handleLogout} style={{
            background: "none", border: "1px solid rgba(0,0,0,0.13)",
            color: "#334155", borderRadius: 980, padding: "5px 16px",
            cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: F,
            transition: "background .15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            登出
          </button>
        </div>
      </header>

      {/* Announcements */}
      <AnnouncementsBanner token={token} />

      {/* ── Body ── */}
      <div style={{
        flex: 1, display: "flex",
        flexDirection: "row",
        minHeight: 0,
        overflow: isTablet ? "visible" : "hidden",
      }}>

        {/* ── Left: player + info + comments + tabs ── */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          overflowY: isTablet ? "visible" : "auto",
          borderRight: isTablet ? "none" : "1px solid rgba(0,0,0,0.07)",
        }}>

          {/* Player */}
          <div style={{ flexShrink: 0, background: "#000" }}>
            {currentVideo?.bunny_video_id ? (
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative", background: "#000" }}>
                {embedSrc ? (
                  <iframe
                    id="bunny-player"
                    src={embedSrc}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                    載入影片中…
                  </div>
                )}
              </div>
            ) : currentVideo?.vimeo_id ? (
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative" }}>
                <iframe
                  id="vimeo-player"
                  src={`https://player.vimeo.com/video/${currentVideo.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative", background: "#0A0A0A" }}>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 14,
                }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" opacity={0.25}>
                    <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="4" fill="#fff"/>
                  </svg>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.28)", letterSpacing: ".02em" }}>
                    請從右側選擇課程單元
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info bar */}
          <div style={{
            padding: "11px 20px", flexShrink: 0, background: "#fff",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
          }}>
            <div style={{ minWidth: 0 }}>
              {chap && (
                <div style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
                  {chap.title}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentVideo ? currentVideo.title : "請選擇課程單元"}
              </div>
              {currentVideo?.duration && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{currentVideo.duration}</div>
              )}
            </div>

            {isTablet ? (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 44, background: "#eff6ff", border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8", borderRadius: 20, padding: "10px 16px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
              >
                📚 課程目錄 {doneCount}/{totalCount}
              </button>
            ) : currentVideo && (
              isDone ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: "#16a34a",
                  background: "rgba(22,163,74,0.1)", padding: "6px 16px", borderRadius: 980, flexShrink: 0,
                }}>
                  ✓ 已完成
                </div>
              ) : currentWatchPct > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>觀看中 {currentWatchPct}%</span>
                  <div style={{ width: 64, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                    <div style={{ width: `${currentWatchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              ) : null
            )}
          </div>

          {/* Materials */}
          <MaterialsSection token={token} video={currentVideo} />

          {/* Comments Section */}
          <CommentsSection token={token} video={currentVideo} chapters={chapters} />

          {/* Tab bar */}
          <div style={{
            display: "flex", flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.07)",
            background: "#fff", padding: "0 10px",
            position: "sticky", top: 0, zIndex: 10,
          }}>
            {[
              { id: "rating",     label: "課程評價" },
              { id: "assignment", label: "作業繳交" },
              { id: "games",      label: "互動遊戲" },
              { id: "notes",      label: "筆記" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  minHeight: 44, padding: "12px 16px", fontSize: 14, fontWeight: tab === t.id ? 600 : 400,
                  cursor: "pointer", border: 0, background: "none", fontFamily: F,
                  color: tab === t.id ? "#0f172a" : "#64748b",
                  borderBottom: tab === t.id ? "2px solid #2563eb" : "2px solid transparent",
                  transition: "color .12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: "18px 20px", background: "#fff", minHeight: 320 }}>
            {tab === "rating"     && <RatingTab token={token} />}
            {tab === "assignment" && <AssignmentTab video={currentVideo} token={token} />}
            {tab === "games"      && <GamesTab token={token} hasSubscription={hasSubscription} video={currentVideo} gameCache={gameCacheRef} />}
            {tab === "notes"      && <NotesTab token={token} video={currentVideo} playerCtrl={playerCtrlRef} />}
          </div>
        </div>

        {/* ── Right: chapter list ── */}
        {isTablet && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,.4)", zIndex: 49,
            }}
          />
        )}
        <div style={isTablet ? {
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(330px, 85vw)", zIndex: 50,
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          boxShadow: "-8px 0 32px rgba(0,0,0,.18)",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform .28s ease",
        } : {
          width: 288,
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
        }}>

          {/* Progress */}
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 500, marginBottom: 9 }}>
              <span style={{ color: "#64748b" }}>學習進度</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#2563eb", fontWeight: 600 }}>{doneCount} / {totalCount} 完成</span>
                {isTablet && (
                  <button
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 18, color: "#64748b", lineHeight: 1, padding: "2px 4px",
                    }}
                  >✕</button>
                )}
              </div>
            </div>
            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#2563eb", borderRadius: 2,
                width: `${pct}%`, transition: "width .6s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5, textAlign: "right" }}>{pct}%</div>
          </div>

          {/* Unit list */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            overflowX: isTablet ? "auto" : "hidden",
            padding: isTablet ? "6px 10px 10px" : "6px 10px 32px",
          }}>
            {chapters.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0, lineHeight: 1.6 }}>課程尚未上架</p>
              </div>
            )}
            {chapters.map((c, ci) => {
              const cv = videos.filter(v => v.chapter_id === c.id);
              if (!cv.length) return null;
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  {/* Chapter header */}
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: ".06em",
                    padding: "12px 6px 5px",
                  }}>
                    {c.title}
                  </div>

                  {/* Unit buttons */}
                  {cv.map((v, idx) => {
                    const isActive   = v.id === currentVideo?.id;
                    const pe         = progMap[v.id];
                    const done       = !!pe?.completed;
                    const watchPct   = (pe?.total_seconds > 0)
                      ? Math.min(100, Math.round((pe.watched_seconds / pe.total_seconds) * 100))
                      : 0;
                    const isWatching = !done && watchPct > 0;
                    return (
                      <button key={v.id} onClick={() => handleSelect(v)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          width: "100%", padding: "8px 8px 8px 6px",
                          border: 0, borderRadius: 9, cursor: "pointer",
                          textAlign: "left", fontFamily: F,
                          background: isActive ? "rgba(37,99,235,0.08)" : "transparent",
                          transition: "background .1s",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        {/* Status indicator */}
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                          display: "grid", placeItems: "center",
                          fontSize: 10.5, fontWeight: 600,
                          background: isActive ? "#2563eb" : done ? "rgba(22,163,74,0.12)" : isWatching ? "rgba(37,99,235,0.08)" : "#f1f5f9",
                          color: isActive ? "#fff" : done ? "#16a34a" : isWatching ? "#2563eb" : "#64748b",
                          border: `1.5px solid ${isActive ? "#2563eb" : done ? "rgba(22,163,74,0.4)" : isWatching ? "rgba(37,99,235,0.3)" : "rgba(0,0,0,0.1)"}`,
                        }}>
                          {done && !isActive ? "✓" : idx + 1}
                        </div>

                        {/* Title + progress */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, lineHeight: 1.4,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? "#2563eb" : "#334155",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {v.title}
                          </div>
                          {isWatching ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                              <div style={{ flex: 1, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                                <div style={{ width: `${watchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0 }}>{watchPct}%</span>
                            </div>
                          ) : v.duration ? (
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                              {v.duration}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

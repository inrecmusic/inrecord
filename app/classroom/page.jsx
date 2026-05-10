"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

/* ── Placeholder course data (10 chapters × 3 units) ───────────────────────── */
const PH_CHAPTERS = [
  { id: "ph1",  title: "課程導覽" },
  { id: "ph2",  title: "認識鋼琴" },
  { id: "ph3",  title: "節奏基礎" },
  { id: "ph4",  title: "C大調音階" },
  { id: "ph5",  title: "基礎和弦" },
  { id: "ph6",  title: "流行伴奏型態" },
  { id: "ph7",  title: "右手旋律" },
  { id: "ph8",  title: "左右手協調" },
  { id: "ph9",  title: "歌曲實戰" },
  { id: "ph10", title: "進階技巧" },
];

const PH_UNIT_NAMES = [
  ["歡迎入門", "課程使用指南", "設備準備建議"],
  ["琴鍵結構與音名", "基本手型與姿勢", "視唱練習"],
  ["拍子與節拍感", "附點音符與休止符", "節拍器練習"],
  ["右手音階練習", "左手音階練習", "雙手合奏"],
  ["三和弦入門", "C-Am-F-G 和弦", "和弦換轉練習"],
  ["分解和弦型", "柱式和弦型", "混合伴奏應用"],
  ["連奏與斷奏", "指法基礎", "旋律線條練習"],
  ["協調訓練方法", "慢速分段練習", "合手彈奏"],
  ["流行歌曲 A", "流行歌曲 B", "完整示範彈奏"],
  ["裝飾音技法", "踏板運用", "情感詮釋"],
];

const PH_VIDEOS = PH_CHAPTERS.flatMap((c, ci) =>
  PH_UNIT_NAMES[ci].map((name, vi) => ({
    id: `${c.id}-v${vi + 1}`,
    chapter_id: c.id,
    title: `${ci + 1}-${vi + 1}  ${name}`,
    duration_sec: null,
    vimeo_id: null,
  }))
);

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function fmtDur(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const F = `-apple-system, "SF Pro Display", BlinkMacSystemFont, "Noto Sans TC", sans-serif`;

/* ── CommentsTab ─────────────────────────────────────────────────────────────── */
function CommentsTab({ token, video, chapters }) {
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState("");
  const [posting, setPosting]   = useState(false);
  const [msg, setMsg]           = useState("");

  const load = useCallback(async () => {
    if (!video || !token || video.id.startsWith("ph")) return;
    try {
      const r = await fetch(`/api/classroom/comments?video_id=${video.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data } = await r.json();
      setComments(data || []);
    } catch {}
  }, [token, video]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!text.trim() || !video || video.id.startsWith("ph")) return;
    setPosting(true);
    try {
      await fetch("/api/classroom/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: video.id, chapter_id: video.chapter_id, content: text.trim() }),
      });
      setText(""); setMsg("留言已送出");
      setTimeout(() => setMsg(""), 2500);
      load();
    } catch { setMsg("送出失敗"); }
    finally { setPosting(false); }
  }

  const chapMap = Object.fromEntries((chapters || []).map(c => [c.id, c.title]));
  const isPlaceholder = video?.id?.startsWith("ph");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
        {isPlaceholder ? (
          <p style={{ color: "#8E8E93", fontSize: 13.5, textAlign: "center", paddingTop: 32, margin: 0, lineHeight: 1.6 }}>
            課程上線後即可在此留言與提問
          </p>
        ) : !comments.length ? (
          <p style={{ color: "#8E8E93", fontSize: 13.5, textAlign: "center", paddingTop: 32, margin: 0 }}>
            {video ? "尚無留言，成為第一個留言的人！" : "請先選擇課程單元"}
          </p>
        ) : comments.map(c => (
          <div key={c.id} style={{
            padding: "12px 14px", borderRadius: 12, marginBottom: 8,
            background: "#F5F5F7", border: "1px solid rgba(0,0,0,0.05)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "#0071E3", color: "#fff",
                display: "grid", placeItems: "center",
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>
                {(c.user_email || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F" }}>{c.user_name || "學員"}</div>
                {chapMap[c.chapter_id] && (
                  <span style={{ fontSize: 11, color: "#0071E3", background: "rgba(0,113,227,0.08)", padding: "1px 8px", borderRadius: 20 }}>
                    {chapMap[c.chapter_id]}
                  </span>
                )}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: "#3A3A3C", lineHeight: 1.6 }}>{c.content}</p>
            {c.comment_replies?.length > 0 && (
              <div style={{ marginTop: 9, paddingLeft: 12, borderLeft: "2px solid #0071E3" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0071E3", marginBottom: 3 }}>老師回覆</div>
                <p style={{ margin: 0, fontSize: 13, color: "#3A3A3C" }}>{c.comment_replies[0].admin_content}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: 12 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={isPlaceholder ? "課程上線後開放留言" : video ? "輸入你的留言或問題…" : "請先選擇課程單元"}
          disabled={!video || isPlaceholder}
          rows={3}
          style={{
            width: "100%", background: "#F5F5F7",
            border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
            padding: "10px 12px", color: "#1D1D1F", fontSize: 13.5,
            fontFamily: F, resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />
        {msg && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#34C759" }}>{msg}</p>}
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} disabled={posting || !text.trim() || !video || isPlaceholder}
            style={{
              background: "#0071E3", color: "#fff", border: 0, borderRadius: 980,
              padding: "7px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer",
              fontFamily: F, opacity: (!text.trim() || !video || isPlaceholder) ? 0.35 : 1,
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
    setSubmitting(true);
    try {
      const r = await fetch("/api/classroom/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ score: selected, content }),
      });
      const json = await r.json();
      if (!r.ok && json.error !== "already_rated") throw new Error(json.error);
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setSubmitting(false); }
  }

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>⭐</div>
      <p style={{ fontWeight: 600, color: "#1D1D1F", fontSize: 18, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "#8E8E93", fontSize: 14, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#1D1D1F", margin: "0 0 14px" }}>你對這堂課的評分是？</p>
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
        <p style={{ fontSize: 13, color: "#8E8E93", margin: "0 0 16px" }}>
          {["", "有點失望", "普通", "還不錯", "很好", "非常推薦！"][selected]}
        </p>
      )}
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="分享你的學習心得（選填）" rows={3}
        style={{
          width: "100%", background: "#F5F5F7",
          border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
          padding: "10px 12px", color: "#1D1D1F", fontSize: 13.5,
          fontFamily: F, resize: "vertical", outline: "none",
          boxSizing: "border-box", marginBottom: 14,
        }}
      />
      {err && <p style={{ color: "#FF3B30", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <button onClick={submit} disabled={!selected || submitting}
        style={{
          background: "#0071E3", color: "#fff", border: 0, borderRadius: 980,
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
  const isPlaceholder = video?.id?.startsWith("ph");
  const [uploading, setUploading] = useState(false);
  const [done, setDone]           = useState(false);
  const [err, setErr]             = useState("");
  const [dragging, setDragging]   = useState(false);
  const inputRef = useRef(null);

  if (isPlaceholder || !video?.assignment_desc) return (
    <p style={{ color: "#8E8E93", fontSize: 13.5, textAlign: "center", paddingTop: 32, margin: 0, lineHeight: 1.6 }}>
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
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload-proof", { method: "POST", body: fd });
      const { url } = await uploadRes.json();
      if (!url) throw new Error("上傳失敗，請確認 Supabase Storage 已設定");
      const subRes = await fetch("/api/classroom/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: video.id, file_name: file.name, file_url: url }),
      });
      if (!subRes.ok) throw new Error((await subRes.json()).error || "提交失敗");
      setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setUploading(false); }
  }

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
      <p style={{ fontWeight: 600, color: "#1D1D1F", fontSize: 16, margin: "0 0 6px" }}>作業已成功繳交！</p>
      <p style={{ color: "#8E8E93", fontSize: 13, margin: 0 }}>老師會批改後回覆，請留意通知</p>
      <button onClick={() => setDone(false)}
        style={{ marginTop: 18, background: "none", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 980,
          padding: "6px 18px", fontSize: 13, cursor: "pointer", color: "#3A3A3C" }}>
        再次繳交
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ background: "#F5F5F7", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#8E8E93", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>
          作業說明
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "#1D1D1F", lineHeight: 1.65 }}>{video.assignment_desc}</p>
        {video.assignment_due && (
          <p style={{ fontSize: 12, color: "#8E8E93", margin: "6px 0 0" }}>截止日期：{video.assignment_due}</p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" style={{ display: "none" }}
        onChange={e => handleFile(e.target.files?.[0])} />
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
        style={{
          border: `1.5px dashed ${dragging ? "#0071E3" : "rgba(0,0,0,0.13)"}`,
          borderRadius: 12, padding: "36px 20px", textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          background: dragging ? "rgba(0,113,227,0.04)" : "transparent",
          transition: "background .15s, border-color .15s",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>{uploading ? "⏳" : "📎"}</div>
        <div style={{ fontSize: 13.5, color: "#6E6E73" }}>
          {uploading ? "上傳中，請稍候…" : "點擊或拖曳圖片上傳作業"}
        </div>
        <div style={{ fontSize: 12, color: "#AEAEB2", marginTop: 4 }}>支援 JPG、PNG 格式</div>
      </div>
      {err && <p style={{ color: "#FF3B30", fontSize: 13, margin: "8px 0 0", textAlign: "center" }}>{err}</p>}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────────── */
export default function ClassroomPage() {
  const [user, setUser]               = useState(null);
  const [token, setToken]             = useState("");
  const [hasPurchased, setHasPurchased] = useState(false);
  const [loading, setLoading]         = useState(true);

  const [chapters, setChapters]         = useState([]);
  const [videos, setVideos]             = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [progress, setProgress]         = useState([]);
  const [tab, setTab]                   = useState("comments");

  /* auth + purchase */
  useEffect(() => {
    async function init() {
      try {
        if (!supabase) { window.location.href = "/classroom/login"; return; }
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { window.location.href = "/classroom/login"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        setUser(u);
        setToken(session?.access_token || "");
        try {
          const r = await fetch("/api/classroom/verify-purchase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: u.email }),
          });
          const { hasPurchased } = await r.json();
          setHasPurchased(!!hasPurchased);
        } catch { setHasPurchased(false); }
      } catch {
        window.location.href = "/classroom/login";
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  /* load real course data */
  useEffect(() => {
    if (!hasPurchased || !token) return;
    async function load() {
      try {
        const [cr, pr] = await Promise.all([
          fetch("/api/classroom/course",   { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/classroom/progress", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const course = await cr.json();
        const prog   = await pr.json();
        const vids   = course.videos   || [];
        const chaps  = course.chapters || [];
        setChapters(chaps);
        setVideos(vids);
        setProgress(prog.data || []);
        if (vids.length) {
          const pm = Object.fromEntries((prog.data || []).map(p => [p.video_id, p]));
          setCurrentVideo(vids.find(v => !pm[v.id]?.completed) || vids[0]);
        }
      } catch {}
    }
    load();
  }, [hasPurchased, token]);

  /* auto-select first placeholder unit when API returns nothing */
  useEffect(() => {
    if (!loading && !currentVideo) setCurrentVideo(PH_VIDEOS[0]);
  }, [loading, currentVideo]);

  async function handleSelect(v) {
    setCurrentVideo(v);
    setTab("comments");
    if (!token || v.id.startsWith("ph")) return;
    try {
      const r = await fetch("/api/classroom/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: v.id }),
      });
      const { data } = await r.json();
      if (data) setProgress(prev => {
        const i = prev.findIndex(p => p.video_id === v.id);
        return i >= 0 ? prev.map((p, j) => j === i ? data : p) : [...prev, data];
      });
    } catch {}
  }

  async function markComplete() {
    if (!currentVideo || !token || currentVideo.id.startsWith("ph")) return;
    try {
      const r = await fetch("/api/classroom/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: currentVideo.id, completed: true }),
      });
      const { data } = await r.json();
      if (data) setProgress(prev => {
        const i = prev.findIndex(p => p.video_id === currentVideo.id);
        return i >= 0 ? prev.map((p, j) => j === i ? data : p) : [...prev, data];
      });
    } catch {}
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
    window.location.href = "/classroom/login";
  }

  /* derive display data: real data if available, else placeholder */
  const displayChapters = chapters.length ? chapters : PH_CHAPTERS;
  const displayVideos   = videos.length   ? videos   : PH_VIDEOS;

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff", fontFamily: F }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 28, height: 28, border: "2.5px solid rgba(0,0,0,0.08)",
          borderTopColor: "#0071E3", borderRadius: "50%",
          animation: "spin .7s linear infinite", margin: "0 auto 12px",
        }} />
        <p style={{ fontSize: 14, color: "#8E8E93", margin: 0, fontWeight: 400 }}>載入中…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── No purchase ── */
  if (!hasPurchased) return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "#F5F5F7", color: "#1D1D1F", textAlign: "center",
      padding: 32, fontFamily: F,
    }}>
      <div>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎹</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 26, fontWeight: 700, letterSpacing: "-.01em" }}>尚未購買課程</h2>
        <p style={{ color: "#6E6E73", marginBottom: 32, fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto 32px" }}>
          請先完成購課，即可觀看所有教學影片。
        </p>
        <a href="/#pricing" style={{
          display: "inline-block", padding: "13px 32px",
          background: "#0071E3", color: "#fff", borderRadius: 980,
          fontWeight: 600, textDecoration: "none", fontSize: 15, fontFamily: F,
        }}>
          查看課程方案
        </a>
        <div style={{ marginTop: 16 }}>
          <button onClick={handleLogout} style={{
            background: "none", border: 0, color: "#AEAEB2",
            cursor: "pointer", fontSize: 13, fontFamily: F,
          }}>
            登出
          </button>
        </div>
      </div>
    </div>
  );

  const progMap    = Object.fromEntries(progress.map(p => [p.video_id, p]));
  const doneCount  = progress.filter(p => p.completed).length;
  const totalCount = displayVideos.length;
  const pct        = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const chap       = displayChapters.find(c => c.id === currentVideo?.chapter_id);
  const isDone     = currentVideo ? !!progMap[currentVideo.id]?.completed : false;
  const isPlaceholderVideo = currentVideo?.id?.startsWith("ph");

  /* ── Classroom ── */
  return (
    <div style={{
      height: "100dvh", background: "#F5F5F7", color: "#1D1D1F",
      display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: F,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
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
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 600, fontSize: 15, color: "#1D1D1F" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#0071E3" strokeWidth="2"/>
            <circle cx="12" cy="12" r="4" fill="#FF3B30"/>
          </svg>
          音樂教室
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 13, color: "#8E8E93" }}>{user?.email}</span>
          <button onClick={handleLogout} style={{
            background: "none", border: "1px solid rgba(0,0,0,0.13)",
            color: "#3A3A3C", borderRadius: 980, padding: "5px 16px",
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

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* ── Left: player + info + tabs ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(0,0,0,0.07)" }}>

          {/* Player */}
          <div style={{ flexShrink: 0, background: "#000" }}>
            {currentVideo?.vimeo_id ? (
              <div style={{ paddingTop: "56.25%", position: "relative" }}>
                <iframe
                  src={`https://player.vimeo.com/video/${currentVideo.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ paddingTop: "56.25%", position: "relative", background: "#0A0A0A" }}>
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
                    {isPlaceholderVideo ? "影片即將上線" : "請從右側選擇課程單元"}
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
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0071E3", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
                  {chap.title}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1D1D1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentVideo ? currentVideo.title : "請選擇課程單元"}
              </div>
              {currentVideo?.duration_sec && (
                <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>{fmtDur(currentVideo.duration_sec)}</div>
              )}
            </div>

            {currentVideo && (
              isDone ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: "#34C759",
                  background: "rgba(52,199,89,0.1)", padding: "6px 16px", borderRadius: 980, flexShrink: 0,
                }}>
                  ✓ 已完成
                </div>
              ) : (
                <button onClick={markComplete}
                  disabled={isPlaceholderVideo}
                  style={{
                    background: "#F5F5F7", border: "1px solid rgba(0,0,0,0.1)",
                    color: "#3A3A3C", borderRadius: 980, padding: "6px 16px",
                    cursor: isPlaceholderVideo ? "default" : "pointer",
                    fontSize: 12, fontWeight: 500, flexShrink: 0, fontFamily: F,
                    opacity: isPlaceholderVideo ? 0.4 : 1, transition: "background .15s",
                  }}
                  onMouseEnter={e => { if (!isPlaceholderVideo) e.currentTarget.style.background = "#EBEBEB"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#F5F5F7"; }}
                >
                  標記完成
                </button>
              )
            )}
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.07)", background: "#fff", padding: "0 10px" }}>
            {[
              { id: "comments",   label: "單元留言" },
              { id: "rating",     label: "課程評價" },
              { id: "assignment", label: "作業繳交" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  padding: "11px 14px", fontSize: 13.5, fontWeight: tab === t.id ? 600 : 400,
                  cursor: "pointer", border: 0, background: "none", fontFamily: F,
                  color: tab === t.id ? "#1D1D1F" : "#8E8E93",
                  borderBottom: tab === t.id ? "2px solid #0071E3" : "2px solid transparent",
                  transition: "color .12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", background: "#fff" }}>
            {tab === "comments"   && <CommentsTab token={token} video={currentVideo} chapters={displayChapters} />}
            {tab === "rating"     && <RatingTab token={token} />}
            {tab === "assignment" && <AssignmentTab video={currentVideo} token={token} />}
          </div>
        </div>

        {/* ── Right: chapter list ── */}
        <div style={{ width: 288, display: "flex", flexDirection: "column", background: "#fff", flexShrink: 0 }}>

          {/* Progress */}
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500, marginBottom: 9 }}>
              <span style={{ color: "#8E8E93" }}>學習進度</span>
              <span style={{ color: "#0071E3", fontWeight: 600 }}>{doneCount} / {totalCount} 完成</span>
            </div>
            <div style={{ height: 4, background: "#E5E5EA", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#0071E3", borderRadius: 2,
                width: `${pct}%`, transition: "width .6s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 5, textAlign: "right" }}>{pct}%</div>
          </div>

          {/* Unit list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px 32px" }}>
            {displayChapters.map((c, ci) => {
              const cv = displayVideos.filter(v => v.chapter_id === c.id);
              if (!cv.length) return null;
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  {/* Chapter header */}
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, color: "#AEAEB2",
                    textTransform: "uppercase", letterSpacing: ".06em",
                    padding: "12px 6px 5px",
                  }}>
                    {`Ch${ci + 1}  ${c.title}`}
                  </div>

                  {/* Unit buttons */}
                  {cv.map((v, idx) => {
                    const isActive = v.id === currentVideo?.id;
                    const done     = !!progMap[v.id]?.completed;
                    return (
                      <button key={v.id} onClick={() => handleSelect(v)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          width: "100%", padding: "8px 8px 8px 6px",
                          border: 0, borderRadius: 9, cursor: "pointer",
                          textAlign: "left", fontFamily: F,
                          background: isActive ? "rgba(0,113,227,0.08)" : "transparent",
                          transition: "background .1s",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        {/* Circle indicator */}
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                          display: "grid", placeItems: "center",
                          fontSize: 10.5, fontWeight: 600,
                          background: isActive ? "#0071E3" : done ? "rgba(52,199,89,0.12)" : "#F5F5F7",
                          color: isActive ? "#fff" : done ? "#34C759" : "#8E8E93",
                          border: `1.5px solid ${isActive ? "#0071E3" : done ? "rgba(52,199,89,0.4)" : "rgba(0,0,0,0.1)"}`,
                        }}>
                          {done && !isActive ? "✓" : idx + 1}
                        </div>

                        {/* Title */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, lineHeight: 1.4,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? "#0071E3" : "#3A3A3C",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {v.title}
                          </div>
                          {v.duration_sec && (
                            <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 1 }}>
                              {fmtDur(v.duration_sec)}
                            </div>
                          )}
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

"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

function fmtDur(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/* ── CommentsTab ─────────────────────────────────────────────────────────── */
function CommentsTab({ token, video, chapters }) {
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState("");
  const [posting, setPosting]   = useState(false);
  const [msg, setMsg]           = useState("");

  const load = useCallback(async () => {
    if (!video || !token) return;
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
    if (!text.trim() || !video) return;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
        {!comments.length ? (
          <p style={{ color: "rgba(255,255,255,.25)", fontSize: 13, textAlign: "center", paddingTop: 24, margin: 0 }}>
            {video ? "目前沒有留言，成為第一個留言的人！" : "請先選擇課程單元"}
          </p>
        ) : comments.map(c => (
          <div key={c.id} style={{
            padding: 12, borderRadius: 10, marginBottom: 10,
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "#1e3a5f", color: "#60a5fa",
                display: "grid", placeItems: "center",
                fontSize: 12, fontWeight: 900, flexShrink: 0,
              }}>
                {(c.user_email || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{c.user_name || "學員"}</div>
                {chapMap[c.chapter_id] && (
                  <span style={{
                    fontSize: 10, color: "#60a5fa",
                    background: "rgba(59,130,246,.12)", padding: "1px 7px", borderRadius: 999,
                  }}>
                    {chapMap[c.chapter_id]}
                  </span>
                )}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.65 }}>{c.content}</p>
            {c.comment_replies?.length > 0 && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: "2px solid #3b82f6" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#3b82f6", marginBottom: 3 }}>老師回覆</div>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.5)" }}>{c.comment_replies[0].admin_content}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 14 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={video ? "輸入你的留言或問題…" : "請先選擇課程單元"}
          disabled={!video}
          rows={3}
          style={{
            width: "100%", background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
            padding: "10px 12px", color: "#f1f5f9", fontSize: 13,
            fontFamily: "inherit", resize: "vertical", outline: "none",
            boxSizing: "border-box",
          }}
        />
        {msg && <p style={{ margin: "5px 0 0", fontSize: 12, color: "#4ade80" }}>{msg}</p>}
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={submit}
            disabled={posting || !text.trim() || !video}
            style={{
              background: "#2563eb", color: "#fff", border: 0, borderRadius: 9,
              padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", opacity: !text.trim() || !video ? 0.4 : 1,
            }}
          >
            {posting ? "送出中…" : "送出留言"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── RatingTab ───────────────────────────────────────────────────────────── */
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
    <div style={{ textAlign: "center", paddingTop: 36 }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>⭐</div>
      <p style={{ fontWeight: 900, color: "#f1f5f9", fontSize: 16, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "rgba(255,255,255,.4)", fontSize: 13, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 16 }}>你對這堂課的評分是？</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setSelected(i)}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 28, padding: 2, lineHeight: 1 }}
          >
            {(hover || selected) >= i ? "⭐" : "☆"}
          </button>
        ))}
      </div>
      {selected > 0 && (
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
          {["", "有點失望", "普通", "還不錯", "很好", "非常推薦"][selected]}
        </p>
      )}
      <textarea
        value={content} onChange={e => setContent(e.target.value)}
        placeholder="分享你的學習心得（選填）"
        rows={3}
        style={{
          width: "100%", background: "rgba(255,255,255,.05)",
          border: "1px solid rgba(255,255,255,.1)", borderRadius: 10,
          padding: "10px 12px", color: "#f1f5f9", fontSize: 13,
          fontFamily: "inherit", resize: "vertical", outline: "none",
          boxSizing: "border-box", marginBottom: 14,
        }}
      />
      {err && <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <button
        onClick={submit} disabled={!selected || submitting}
        style={{
          background: "#2563eb", color: "#fff", border: 0, borderRadius: 9,
          padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit", opacity: !selected ? 0.4 : 1,
        }}
      >
        {submitting ? "送出中…" : "送出評分"}
      </button>
    </div>
  );
}

/* ── AssignmentTab ───────────────────────────────────────────────────────── */
function AssignmentTab({ video }) {
  if (!video?.assignment_desc) return (
    <p style={{ color: "rgba(255,255,255,.25)", fontSize: 13, textAlign: "center", paddingTop: 24, margin: 0 }}>
      {video ? "此單元沒有作業" : "請先選擇課程單元"}
    </p>
  );
  return (
    <div>
      <div style={{
        background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 10, padding: "14px 16px", marginBottom: 14,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>
          作業說明
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,.7)", lineHeight: 1.65 }}>{video.assignment_desc}</p>
        {video.assignment_due && <p style={{ fontSize: 12, color: "#475569", margin: "6px 0 0" }}>截止日期：{video.assignment_due}</p>}
      </div>
      <div style={{
        border: "2px dashed rgba(255,255,255,.1)", borderRadius: 12,
        padding: "32px 20px", textAlign: "center", cursor: "pointer",
      }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>📎</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)" }}>點擊或拖曳檔案上傳</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.2)", marginTop: 4 }}>支援所有檔案格式</div>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function ClassroomPage() {
  const [user, setUser]               = useState(null);
  const [token, setToken]             = useState("");
  const [hasPurchased, setHasPurchased] = useState(false);
  const [loading, setLoading]         = useState(true);

  const [chapters, setChapters]           = useState([]);
  const [videos, setVideos]               = useState([]);
  const [currentVideo, setCurrentVideo]   = useState(null);
  const [progress, setProgress]           = useState([]);
  const [tab, setTab]                     = useState("comments");

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

  /* load course */
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

  async function handleSelect(v) {
    setCurrentVideo(v);
    setTab("comments");
    if (!token) return;
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
    if (!currentVideo || !token) return;
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
    await supabase.auth.signOut();
    window.location.href = "/classroom/login";
  }

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060d1a" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 32, height: 32, border: "3px solid rgba(255,255,255,.1)",
          borderTopColor: "#3b82f6", borderRadius: "50%",
          animation: "spin .7s linear infinite", margin: "0 auto 14px",
        }} />
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.4)", margin: 0 }}>載入中…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── No purchase ── */
  if (!hasPurchased) return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "#060d1a", color: "#fff", textAlign: "center", padding: 24,
    }}>
      <div>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎹</div>
        <h2 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 900 }}>尚未購買課程</h2>
        <p style={{ color: "rgba(255,255,255,.5)", marginBottom: 28, fontSize: 15, lineHeight: 1.7 }}>
          請先完成購課，即可觀看所有教學影片。
        </p>
        <a href="/#pricing" style={{
          display: "inline-block", padding: "13px 32px",
          background: "#2563eb", color: "#fff", borderRadius: 12,
          fontWeight: 700, textDecoration: "none", fontSize: 15,
        }}>
          查看課程方案
        </a>
        <div style={{ marginTop: 16 }}>
          <button onClick={handleLogout} style={{
            background: "none", border: 0,
            color: "rgba(255,255,255,.35)", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
          }}>
            登出
          </button>
        </div>
      </div>
    </div>
  );

  const progMap   = Object.fromEntries(progress.map(p => [p.video_id, p]));
  const doneCount = progress.filter(p => p.completed).length;
  const totalCount = videos.length;
  const pct    = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const chap   = chapters.find(c => c.id === currentVideo?.chapter_id);
  const isDone = currentVideo ? !!progMap[currentVideo.id]?.completed : false;

  /* ── Classroom ── */
  return (
    <div style={{
      height: "100vh", background: "#060d1a", color: "#fff",
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif",
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Topbar ── */}
      <div style={{
        height: 48, background: "rgba(255,255,255,.04)",
        borderBottom: "1px solid rgba(255,255,255,.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" fill="#ff2028" />
          </svg>
          音樂教室
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
          <span style={{ color: "rgba(255,255,255,.45)" }}>{user?.email}</span>
          <button onClick={handleLogout} style={{
            background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)",
            color: "rgba(255,255,255,.6)", borderRadius: 8,
            padding: "5px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
          }}>
            登出
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 280px", minHeight: 0, overflow: "hidden" }}>

        {/* ── Left: player + tabs ── */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>

          {/* Player */}
          <div style={{ flexShrink: 0, position: "relative" }}>
            {currentVideo?.vimeo_id ? (
              <div style={{ paddingTop: "56.25%", position: "relative", background: "#000" }}>
                <iframe
                  src={`https://player.vimeo.com/video/${currentVideo.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              /* Placeholder with grid pattern */
              <div style={{
                paddingTop: "56.25%", position: "relative",
                background: "#080e1c",
                backgroundImage: `
                  linear-gradient(rgba(59,130,246,.06) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(59,130,246,.06) 1px, transparent 1px)
                `,
                backgroundSize: "44px 44px",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  {/* InRecord logo */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="1.8" />
                      <circle cx="12" cy="12" r="4" fill="#ff2028" />
                    </svg>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,.75)", letterSpacing: "-.03em" }}>
                      InRecord
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.3)", letterSpacing: ".03em" }}>
                    請從右側選擇課程單元開始學習
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Video info bar */}
          <div style={{
            padding: "11px 18px", borderBottom: "1px solid rgba(255,255,255,.07)",
            background: "rgba(255,255,255,.025)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div style={{ minWidth: 0 }}>
              {chap && (
                <div style={{ fontSize: 10, fontWeight: 900, color: "#3b82f6", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 2 }}>
                  {chap.title}
                </div>
              )}
              <div style={{
                fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.85)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {currentVideo ? currentVideo.title : "請選擇課程單元"}
              </div>
              {currentVideo?.duration_sec && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", marginTop: 2 }}>
                  ⏱ {fmtDur(currentVideo.duration_sec)}
                </div>
              )}
            </div>
            {currentVideo && (
              isDone ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800,
                  color: "#4ade80", background: "rgba(74,222,128,.1)",
                  padding: "6px 12px", borderRadius: 9, flexShrink: 0,
                }}>
                  ✓ 已完成
                </div>
              ) : (
                <button onClick={markComplete} style={{
                  background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)",
                  color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "6px 12px",
                  cursor: "pointer", fontSize: 12, fontWeight: 700, flexShrink: 0, fontFamily: "inherit",
                }}>
                  標記完成
                </button>
              )
            )}
          </div>

          {/* Tab bar */}
          <div style={{
            display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)",
            background: "rgba(255,255,255,.02)", flexShrink: 0,
          }}>
            {[
              { id: "comments",   label: "單元留言" },
              { id: "rating",     label: "課程評價" },
              { id: "assignment", label: "作業繳交" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "11px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: 0, background: "none", fontFamily: "inherit",
                  color: tab === t.id ? "#60a5fa" : "rgba(255,255,255,.35)",
                  borderBottom: tab === t.id ? "2px solid #3b82f6" : "2px solid transparent",
                  transition: "color .12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
            {tab === "comments"   && <CommentsTab token={token} video={currentVideo} chapters={chapters} />}
            {tab === "rating"     && <RatingTab token={token} />}
            {tab === "assignment" && <AssignmentTab video={currentVideo} />}
          </div>
        </div>

        {/* ── Right: unit list ── */}
        <div style={{ display: "flex", flexDirection: "column", background: "#070d1c", overflow: "hidden" }}>

          {/* Progress header */}
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0 }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 11.5, fontWeight: 800, marginBottom: 8,
            }}>
              <span style={{ color: "rgba(255,255,255,.35)" }}>學習進度</span>
              <span style={{ color: "#3b82f6" }}>{doneCount} / {totalCount} 完成</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,.08)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#3b82f6", borderRadius: 999,
                width: `${pct}%`, transition: "width .5s ease",
              }} />
            </div>
          </div>

          {/* Unit scroll */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 4px 24px" }}>
            {!chapters.length ? (
              <div style={{
                textAlign: "center", padding: "48px 20px",
                color: "rgba(255,255,255,.2)", fontSize: 13, lineHeight: 1.8,
              }}>
                課程單元準備中<br />敬請期待
              </div>
            ) : chapters.map(c => {
              const cv = videos.filter(v => v.chapter_id === c.id);
              if (!cv.length) return null;
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.18)",
                    textTransform: "uppercase", letterSpacing: ".08em",
                    padding: "10px 12px 4px",
                  }}>
                    {c.title}
                  </div>
                  {cv.map((v, idx) => {
                    const isActive = v.id === currentVideo?.id;
                    const done = !!progMap[v.id]?.completed;
                    return (
                      <button
                        key={v.id}
                        onClick={() => handleSelect(v)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          width: "100%", padding: "9px 10px",
                          border: 0, borderRadius: 10, cursor: "pointer",
                          textAlign: "left", fontFamily: "inherit",
                          background: isActive ? "rgba(59,130,246,.15)" : "transparent",
                          transition: "background .1s",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                          border: `1.5px solid ${isActive ? "#3b82f6" : done ? "#4ade80" : "rgba(255,255,255,.1)"}`,
                          display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900,
                          background: isActive ? "#3b82f6" : done ? "rgba(74,222,128,.12)" : "transparent",
                          color: isActive ? "#fff" : done ? "#4ade80" : "rgba(255,255,255,.25)",
                        }}>
                          {done && !isActive ? "✓" : idx + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12.5, fontWeight: 700, lineHeight: 1.3,
                            color: isActive ? "#60a5fa" : "rgba(255,255,255,.5)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {v.title}
                          </div>
                          {v.duration_sec && (
                            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.18)", marginTop: 2 }}>
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

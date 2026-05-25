"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function fmtDur(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const F = `-apple-system, "SF Pro Display", BlinkMacSystemFont, "Noto Sans TC", sans-serif`;

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
    <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.07)", padding: "16px 20px" }}>
      {/* Header + filter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F" }}>學員留言</div>
        <div style={{ display: "flex", background: "#F5F5F7", borderRadius: 8, padding: 2 }}>
          {[{ id: "unit", label: "本單元" }, { id: "all", label: "全部單元" }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: "4px 12px", fontSize: 12, fontWeight: filter === f.id ? 600 : 400,
                border: 0, cursor: "pointer", fontFamily: F, borderRadius: 6,
                background: filter === f.id ? "#fff" : "transparent",
                color: filter === f.id ? "#1D1D1F" : "#8E8E93",
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
          <p style={{ color: "#8E8E93", fontSize: 13.5, textAlign: "center", padding: "20px 0", margin: 0 }}>
            {!video
              ? "請先選擇課程單元"
              : filter === "unit"
              ? "此單元尚無留言，成為第一個留言的人！"
              : "尚無留言"}
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

      {/* Input */}
      <div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={video ? "輸入你的留言或問題…" : "請先選擇課程單元"}
          disabled={!video}
          rows={2}
          style={{
            width: "100%", background: "#F5F5F7",
            border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
            padding: "10px 12px", color: "#1D1D1F", fontSize: 13.5,
            fontFamily: F, resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />
        {msg && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#34C759" }}>{msg}</p>}
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} disabled={posting || !text.trim() || !video}
            style={{
              background: "#0071E3", color: "#fff", border: 0, borderRadius: 980,
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
  const [uploading, setUploading] = useState(false);
  const [done, setDone]           = useState(false);
  const [err, setErr]             = useState("");
  const [dragging, setDragging]   = useState(false);
  const inputRef = useRef(null);

  if (!video?.assignment_desc) return (
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
      const uploadRes = await fetch("/api/upload-proof", { method: "POST", body: fd, headers: { Authorization: `Bearer ${token}` } });
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

/* ── GamesTab ────────────────────────────────────────────────────────────────── */
function GamesTab({ token, hasSubscription, video, gameCache }) {
  const [games, setGames]               = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameContent, setGameContent]   = useState(null);
  const [gameLoading, setGameLoading]   = useState(false);
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
    setListLoading(true);
    fetch(`/api/classroom/games?video_id=${videoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(({ games }) => {
        const list = games || [];
        if (gameCache) gameCache.current[cacheKey] = list;
        setGames(list);
      })
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, [hasSubscription, token, videoId]);

  useEffect(() => {
    if (!selectedGame) return;
    if (selectedGame.game_type === "url") { setGameContent(selectedGame); return; }
    if (gameCache?.current[selectedGame.id]) {
      setGameContent(gameCache.current[selectedGame.id]);
      return;
    }
    setGameLoading(true);
    setGameContent(null);
    fetch(`/api/classroom/games?id=${selectedGame.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(({ game }) => {
        if (game && gameCache) gameCache.current[selectedGame.id] = game;
        setGameContent(game || null);
      })
      .catch(() => setGameContent(null))
      .finally(() => setGameLoading(false));
  }, [selectedGame, token]);

  if (!hasSubscription) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1D1D1F" }}>
          此功能需要 AI 遊戲訂閱
        </h3>
        <p style={{ color: "#6E6E73", margin: "0 0 24px", fontSize: 14, lineHeight: 1.6 }}>
          月繳 NT$399 / 年繳 NT$1,499
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <a href="/#subscription"
            style={{
              background: "#0071E3", color: "#fff", padding: "10px 22px",
              borderRadius: 980, textDecoration: "none", fontWeight: 600, fontSize: 14,
              fontFamily: F,
            }}
          >
            月繳 NT$399
          </a>
          <a href="/#subscription"
            style={{
              background: "#1c1c1e", color: "#fff", padding: "10px 22px",
              borderRadius: 980, textDecoration: "none", fontWeight: 600, fontSize: 14,
              fontFamily: F,
            }}
          >
            年繳 NT$1,499
          </a>
        </div>
        <p style={{ color: "#AEAEB2", fontSize: 12, margin: 0 }}>
          購買課程自動贈送 3 個月免費體驗
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
        </div>
        {/* Game content */}
        {isUrlGame ? (
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
              borderTopColor: "#0071E3", borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }} />
          </div>
        ) : (
          <iframe
            srcDoc={gameContent?.html_content || "<div style='display:grid;place-items:center;height:100vh;font-family:system-ui;color:#8E8E93'>遊戲內容即將上線</div>"}
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
          borderTopColor: "#0071E3", borderRadius: "50%",
          animation: "spin .7s linear infinite",
        }} />
      </div>
    );
  }

  if (!games.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🎮</div>
        <p style={{ fontWeight: 600, color: "#1D1D1F", fontSize: 16, margin: "0 0 6px" }}>此單元暫無 AI 遊戲</p>
        <p style={{ color: "#8E8E93", fontSize: 13, margin: 0 }}>訂閱已啟用，更多遊戲陸續上線中</p>
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
            background: "#F5F5F7", cursor: "pointer", textAlign: "center", fontFamily: F,
            transition: "background .12s, box-shadow .12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,113,227,0.06)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,113,227,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F5F5F7"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", lineHeight: 1.4 }}>{game.title}</div>
        </button>
      ))}
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

  const [chapters, setChapters]           = useState([]);
  const [videos, setVideos]               = useState([]);
  const [currentVideo, setCurrentVideo]   = useState(null);
  const [progress, setProgress]           = useState([]);
  const [tab, setTab]                     = useState("rating");

  const gameCacheRef                      = useRef({});
  const [isTablet, setIsTablet]           = useState(false);
  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth <= 1024);
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
        setUser(u);
        setToken(session?.access_token || "");
        try {
          const [purchaseRes, subRes] = await Promise.all([
            fetch("/api/classroom/verify-purchase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: u.email }),
            }),
            fetch("/api/classroom/verify-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: u.email }),
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
        setProgress(prog.progress || []);
        if (vids.length) {
          const pm = Object.fromEntries((prog.progress || []).map(p => [p.video_id, p]));
          setCurrentVideo(vids.find(v => !pm[v.id]?.completed) || vids[0]);
        }
      } catch {}
    }
    load();
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

      interval = setInterval(async () => {
        try {
          const [currentTime, duration] = await Promise.all([
            player.getCurrentTime(),
            player.getDuration(),
          ]);
          if (!duration) return;
          const r = await fetch("/api/classroom/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    return () => { cancelled = true; clearInterval(interval); player?.destroy(); };
  }, [currentVideo?.id, token]);

  function handleSelect(v) {
    setCurrentVideo(v);
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

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
      background: "#F5F5F7", color: "#1D1D1F",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isTablet && <span style={{ fontSize: 13, color: "#8E8E93" }}>{user?.email}</span>}

          {hasSubscription ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 600, color: "#34C759",
              background: "rgba(52,199,89,0.1)", padding: "4px 12px", borderRadius: 980,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#34C759", display: "inline-block",
              }} />
              AI 遊戲・剩 {subDaysLeft} 天
            </div>
          ) : (
            <a href="/#subscription" style={{
              background: "linear-gradient(135deg,#FF9500,#FF6B00)",
              color: "#fff", borderRadius: 980, padding: "4px 12px",
              fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: F,
            }}>
              🎮 解鎖 AI 遊戲
            </a>
          )}

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
      <div style={{
        flex: 1, display: "flex",
        flexDirection: isTablet ? "column" : "row",
        minHeight: 0,
        overflow: isTablet ? "visible" : "hidden",
      }}>

        {/* ── Left: player + info + comments + tabs ── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          overflowY: isTablet ? "visible" : "auto",
          borderRight: isTablet ? "none" : "1px solid rgba(0,0,0,0.07)",
          borderBottom: isTablet ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>

          {/* Player */}
          <div style={{ flexShrink: 0, background: "#000" }}>
            {currentVideo?.bunny_video_id ? (
              <div style={{ paddingTop: "44%", position: "relative" }}>
                <iframe
                  src={`https://iframe.mediadelivery.net/embed/${process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID}/${currentVideo.bunny_video_id}?autoplay=false&loop=false&muted=false&preload=true`}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : currentVideo?.vimeo_id ? (
              <div style={{ paddingTop: "44%", position: "relative" }}>
                <iframe
                  id="vimeo-player"
                  src={`https://player.vimeo.com/video/${currentVideo.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ paddingTop: "44%", position: "relative", background: "#0A0A0A" }}>
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
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0071E3", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
                  {chap.title}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1D1D1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentVideo ? currentVideo.title : "請選擇課程單元"}
              </div>
              {currentVideo?.duration && (
                <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>{currentVideo.duration}</div>
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
              ) : currentWatchPct > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#0071E3", fontWeight: 600 }}>觀看中 {currentWatchPct}%</span>
                  <div style={{ width: 64, height: 3, background: "#E5E5EA", borderRadius: 2 }}>
                    <div style={{ width: `${currentWatchPct}%`, height: "100%", background: "#0071E3", borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              ) : null
            )}
          </div>

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
              { id: "games",      label: "🎮 互動遊戲" },
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
          <div style={{ padding: "18px 20px", background: "#fff", minHeight: 320 }}>
            {tab === "rating"     && <RatingTab token={token} />}
            {tab === "assignment" && <AssignmentTab video={currentVideo} token={token} />}
            {tab === "games"      && <GamesTab token={token} hasSubscription={hasSubscription} video={currentVideo} gameCache={gameCacheRef} />}
          </div>
        </div>

        {/* ── Right: chapter list ── */}
        <div style={{
          width: isTablet ? "100%" : 288,
          maxHeight: isTablet ? 300 : "none",
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          borderTop: isTablet ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>

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
          <div style={{
            flex: 1,
            overflowY: "auto",
            overflowX: isTablet ? "auto" : "hidden",
            padding: isTablet ? "6px 10px 10px" : "6px 10px 32px",
          }}>
            {chapters.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <p style={{ color: "#8E8E93", fontSize: 13, margin: 0, lineHeight: 1.6 }}>課程尚未上架</p>
              </div>
            )}
            {chapters.map((c, ci) => {
              const cv = videos.filter(v => v.chapter_id === c.id);
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
                          background: isActive ? "rgba(0,113,227,0.08)" : "transparent",
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
                          background: isActive ? "#0071E3" : done ? "rgba(52,199,89,0.12)" : isWatching ? "rgba(0,113,227,0.08)" : "#F5F5F7",
                          color: isActive ? "#fff" : done ? "#34C759" : isWatching ? "#0071E3" : "#8E8E93",
                          border: `1.5px solid ${isActive ? "#0071E3" : done ? "rgba(52,199,89,0.4)" : isWatching ? "rgba(0,113,227,0.3)" : "rgba(0,0,0,0.1)"}`,
                        }}>
                          {done && !isActive ? "✓" : idx + 1}
                        </div>

                        {/* Title + progress */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, lineHeight: 1.4,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? "#0071E3" : "#3A3A3C",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {v.title}
                          </div>
                          {isWatching ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                              <div style={{ flex: 1, height: 3, background: "#E5E5EA", borderRadius: 2 }}>
                                <div style={{ width: `${watchPct}%`, height: "100%", background: "#0071E3", borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 10, color: "#0071E3", flexShrink: 0 }}>{watchPct}%</span>
                            </div>
                          ) : v.duration ? (
                            <div style={{ fontSize: 11, color: "#AEAEB2", marginTop: 1 }}>
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

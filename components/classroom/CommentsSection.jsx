"use client";
import { useState, useEffect, useCallback } from "react";
import { freshToken, F } from "./shared";

/* ── CommentsSection ─────────────────────────────────────────────────────────── */
export default function CommentsSection({ token, video, chapters }) {
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
      const tk = await freshToken(token);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
      const { data } = await r.json();
      setComments(data || []);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
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

/* 取新鮮簽名 URL 並開新分頁下載講義／樂譜。成功回 true。
   必須在點擊的同步脈絡下先開空白分頁，await 之後再 window.open 會被瀏覽器彈窗攔截。 */

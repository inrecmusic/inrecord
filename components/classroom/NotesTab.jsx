"use client";
import { useState, useRef, useEffect } from "react";
import { freshToken, F } from "./shared";
import { sortNotes, formatSeconds } from "@/lib/notes-format";

/* ── NotesTab ────────────────────────────────────────────────────────────────── */
export default function NotesTab({ token, video, playerCtrl }) {
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
    freshToken(token)
      .then(tk => fetch(`/api/classroom/notes?video_id=${video.id}`, { headers: { Authorization: `Bearer ${tk}` } }))
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
          <div style={{ display: "flex", gap: 12, flexShrink: 0, alignItems: "center" }}>
            <button onClick={() => { setEditId(n.id); setEditText(n.body); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F, padding: 0 }}>編輯</button>
            <button onClick={() => remove(n.id)} disabled={busy} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F, padding: 0 }}>刪除</button>
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

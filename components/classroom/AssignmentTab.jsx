"use client";
import { useState, useRef, useEffect } from "react";
import { freshToken, F } from "./shared";

/* ── AssignmentTab ───────────────────────────────────────────────────────────── */
export default function AssignmentTab({ video, token }) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone]           = useState(false);
  const [err, setErr]             = useState("");
  const [dragging, setDragging]   = useState(false);
  const [picked, setPicked]       = useState(null);   // 已選、待確認送出的檔案
  const [previewUrl, setPreviewUrl] = useState("");   // 本地預覽 URL（object URL）
  const inputRef = useRef(null);

  // 元件卸載時釋放預覽 URL
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // 切換單元時重置：預覽中的檔案/完成畫面屬於前一單元，帶過去會把作業繳到錯的單元
  useEffect(() => {
    setPicked(null); setDone(false); setErr("");
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return ""; });
    if (inputRef.current) inputRef.current.value = "";
  }, [video?.id]);

  if (!video?.assignment_desc) return (
    <p style={{ color: "#64748b", fontSize: 13.5, textAlign: "center", paddingTop: 32, margin: 0, lineHeight: 1.6 }}>
      {video ? "此單元沒有作業" : "請先選擇課程單元"}
    </p>
  );

  // 選檔：只做本地預覽，先不上傳（讓學員確認）
  function pickFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErr("目前僅支援 JPG / PNG 格式的作業圖片上傳"); return;
    }
    setErr("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPicked(file);
    setPreviewUrl(URL.createObjectURL(file));
  }
  function clearPick() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPicked(null); setPreviewUrl(""); setErr("");
    if (inputRef.current) inputRef.current.value = "";
  }

  // 確認送出：真正上傳 + 建立繳交記錄
  async function confirmSubmit() {
    if (!picked) return;
    setErr(""); setUploading(true);
    try {
      const tk = await freshToken(token); // 取最新 token，避免頁面開久後上傳/繳交 401
      const fd = new FormData();
      fd.append("file", picked);
      const uploadRes = await fetch("/api/upload-proof", { method: "POST", body: fd, headers: { Authorization: `Bearer ${tk}` } });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || "上傳失敗，請確認 Supabase Storage 已設定");
      const subRes = await fetch("/api/classroom/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ video_id: video.id, file_name: picked.name, file_url: uploadData.url }),
      });
      if (!subRes.ok) throw new Error((await subRes.json().catch(() => ({}))).error || "提交失敗");
      clearPick(); setDone(true);
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
        onChange={e => pickFile(e.target.files?.[0])} />

      {picked ? (
        /* 預覽 → 確認送出 */
        <div>
          <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fafbfc" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>預覽（確認無誤再送出）</div>
            <img src={previewUrl} alt="作業預覽" style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, display: "block", background: "#fff" }} />
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, wordBreak: "break-all" }}>{picked.name}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={confirmSubmit} disabled={uploading} style={{
              flex: 1, padding: "11px 16px", fontSize: 14, fontWeight: 600, color: "#fff",
              background: uploading ? "#94a3b8" : "#2563eb", border: 0, borderRadius: 10,
              cursor: uploading ? "wait" : "pointer", fontFamily: F,
            }}>{uploading ? "送出中…" : "確認送出"}</button>
            <button onClick={clearPick} disabled={uploading} style={{
              padding: "11px 16px", fontSize: 14, fontWeight: 500, color: "#475569",
              background: "none", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10,
              cursor: uploading ? "default" : "pointer", fontFamily: F,
            }}>重新選擇</button>
          </div>
        </div>
      ) : (
        /* 選檔區 */
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
          style={{
            border: `1.5px dashed ${dragging ? "#2563eb" : "rgba(0,0,0,0.13)"}`,
            borderRadius: 12, padding: "36px 20px", textAlign: "center", cursor: "pointer",
            background: dragging ? "rgba(37,99,235,0.04)" : "transparent",
            transition: "background .15s, border-color .15s",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
          <div style={{ fontSize: 13.5, color: "#475569" }}>點擊或拖曳圖片選擇作業</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>支援 JPG、PNG　·　選好會先預覽</div>
        </div>
      )}
      {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0 0", textAlign: "center" }}>{err}</p>}
    </div>
  );
}

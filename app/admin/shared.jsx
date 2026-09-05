"use client";
import styles from "./admin.module.css";
import { ArrowUpRight, X } from "lucide-react";
import { useState, useEffect } from "react";
import { adminFetch as _api } from "@/lib/admin-client";

// ── Stat Card ──────────────────────────────────────────────────────────────
export function StatCard({label,value,sub,icon:Icon,growth,color="#2563eb"}){
  const isUp=growth&&growth.startsWith("+");
  return(
    <div className={styles.statCard}>
      <div className={styles.statHead}><span className={styles.statLabel}>{label}</span>{Icon&&<span className={styles.statIcon} style={{color}}><Icon size={16}/></span>}</div>
      <strong className={styles.statValue}>{value}</strong>
      <div className={styles.statFoot}>
        <span className={styles.statSub}>{sub}</span>
        {growth&&<span className={`${styles.statGrowth} ${isUp?styles.up:styles.down}`}><ArrowUpRight size={12}/>{growth}</span>}
      </div>
    </div>
  );
}

// 憑證圖（proof-uploads 為私有 bucket）：向 /api/admin/proof-signed 取短期簽名 URL 顯示
export function ProofImage({ url }) {
  const [signed, setSigned] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSigned(null); setErr(false);
    _api("/api/admin/proof-signed", { method: "POST", body: JSON.stringify({ url }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) (d.signedUrl ? setSigned(d.signedUrl) : setErr(true)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [url]);
  if (err) return <span style={{ color: "#dc2626", fontSize: 13 }}>憑證載入失敗</span>;
  if (!signed) return <span style={{ color: "#94a3b8", fontSize: 13 }}>載入憑證…</span>;
  return <a href={signed} target="_blank" rel="noreferrer"><img src={signed} alt="憑證" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, border: "1px solid #ddd" }} /></a>;
}

// 寄信常用範本（追單/歡迎/退款）—— 選了會填入主旨與內文，可再自由編輯。
export const EMAIL_TEMPLATES = [
  { id: "", name: "— 套用範本 —", subject: "", body: "" },
  { id: "followup", name: "追單（未完成付款）", subject: "您的課程訂單尚未完成付款 🎹",
    body: "嗨，\n\n感謝您選擇 InRecord！我們注意到您的課程訂單尚未完成付款。\n\n名額有限，完成付款即可保留您的優惠價與課程權益：\n\n- **付款連結**：（請貼上付款連結）\n- 若已完成付款請忽略本信。\n\n如有任何問題，直接回覆此信即可，我們很樂意協助 🙌" },
  { id: "welcome", name: "歡迎 / 開通通知", subject: "歡迎加入 InRecord！課程已為您開通 🎹",
    body: "嗨，\n\n歡迎加入 InRecord，您的課程已開通！\n\n- **登入方式**：請用本次購買的 Email 登入教室\n- 課程連結：https://inrecordmusic.com/classroom\n\n祝學習愉快，有任何問題隨時回覆此信 🙌" },
  { id: "refund", name: "退款通知", subject: "您的 InRecord 退款已處理",
    body: "嗨，\n\n您的退款申請已處理完成，款項將依原付款方式退還（信用卡約 3–7 個工作天、ATM/超商依銀行作業時間）。\n\n退款後，本課程之觀看權限已同步終止。\n\n如有任何問題，直接回覆此信即可。" },
];

// 單封自訂信（追單/客服）：對單一消費者寄一封自己編輯的信。內文支援受限 Markdown。
export function ComposeEmailModal({ open, initialTo = "", onClose, showToast }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(initialTo || ""); setSubject(""); setBody(""); setBusy(false); } }, [open, initialTo]);
  function applyTemplate(id) { const t = EMAIL_TEMPLATES.find(x => x.id === id); if (t && t.id) { setSubject(t.subject); setBody(t.body); } }
  if (!open) return null;

  async function send() {
    if (busy) return;
    const em = to.trim();
    if (!em) { showToast?.("❌ 請填寫收件 Email"); return; }
    if (!subject.trim() || !body.trim()) { showToast?.("❌ 請填寫主旨與內文"); return; }
    setBusy(true);
    try {
      const res = await _api("/api/admin/send-custom-email", { method: "POST", body: JSON.stringify({ to: em, subject: subject.trim(), bodyMd: body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) showToast?.("❌ 寄送失敗：" + (d.error || "unknown"));
      else { showToast?.("✅ 已寄出給 " + em); onClose?.(); }
    } catch (e) { showToast?.("❌ 寄送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const lbl = { fontSize: 13, fontWeight: 700, color: "#374151", display: "block" };
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} style={{ width: "min(580px,100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>✉️ 寄信給客人</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={lbl}>常用範本
            <select className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} defaultValue="" onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}>
              {EMAIL_TEMPLATES.map(t => <option key={t.id || "_"} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={lbl}>收件 Email
            <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" />
          </label>
          <label style={lbl}>主旨
            <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="例如：您的課程訂單尚未完成付款" />
          </label>
          <label style={lbl}>內文<span style={{ fontWeight: 400, color: "#94a3b8" }}>（Markdown：# 標題、**粗體**、- 清單、--- 分隔線、[文字](網址)＝連結、整行只放連結＝置中按鈕）</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "vertical" }} placeholder={"嗨，\n\n感謝您的支持！我們注意到您的訂單尚未完成付款。\n\n以下是您的付款連結：…\n\n如有任何問題，直接回覆此信即可。"} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className={styles.btnSmall} onClick={onClose} disabled={busy}>取消</button>
            <button className={`${styles.btnSmall} ${styles.green}`} onClick={send} disabled={busy}>{busy ? "寄送中…" : "寄送"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 批次追單：對一批未付款/失敗訂單的消費者一次寄出同一封追單信。
export function BulkFollowupModal({ open, recipients = [], onClose, showToast }) {
  const FOLLOWUP = EMAIL_TEMPLATES.find(t => t.id === "followup");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (open) { setSubject(FOLLOWUP?.subject || ""); setBody(FOLLOWUP?.body || ""); setBusy(false); setResult(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 開啟時以當下範本重設欄位，不隨範本物件變動重跑
  }, [open]);
  function applyTemplate(id) { const t = EMAIL_TEMPLATES.find(x => x.id === id); if (t && t.id) { setSubject(t.subject); setBody(t.body); } }
  if (!open) return null;

  async function send() {
    if (busy) return;
    if (!recipients.length) { showToast?.("❌ 沒有可追單的收件人"); return; }
    if (!subject.trim() || !body.trim()) { showToast?.("❌ 請填寫主旨與內文"); return; }
    if (!window.confirm(`確定要對 ${recipients.length} 位未付款顧客寄出追單信嗎？`)) return;
    setBusy(true); setResult(null);
    try {
      const res = await _api("/api/admin/bulk-followup", { method: "POST", body: JSON.stringify({ emails: recipients, subject: subject.trim(), bodyMd: body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) { showToast?.("❌ 批次寄送失敗：" + (d.error || "unknown")); setBusy(false); return; }
      setResult(d);
      showToast?.(`✅ 已寄出 ${d.sent}/${d.total}${d.failed?.length ? `，失敗 ${d.failed.length}` : ""}`);
    } catch (e) { showToast?.("❌ 批次寄送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const lbl = { fontSize: 13, fontWeight: 700, color: "#374151", display: "block" };
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} style={{ width: "min(580px,100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>📨 批次追單</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {result ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 14, color: "#374151" }}>已寄出 <b style={{ color: "#16a34a" }}>{result.sent}</b> / {result.total} 封{result.failed?.length ? <>，失敗 <b style={{ color: "#dc2626" }}>{result.failed.length}</b></> : null}。</div>
            {result.failed?.length ? (
              <div style={{ maxHeight: 160, overflow: "auto", fontSize: 12, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: 10 }}>
                {result.failed.map((f, i) => <div key={i}>{f.to}：{f.error}</div>)}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className={styles.btnSmall} onClick={onClose}>關閉</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
              將寄給目前篩選出的 <b>{recipients.length}</b> 位未付款／付款失敗顧客（已自動去重）。
            </div>
            <label style={lbl}>常用範本
              <select className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} defaultValue="" onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}>
                {EMAIL_TEMPLATES.map(t => <option key={t.id || "_"} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label style={lbl}>主旨
              <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="例如：您的課程訂單尚未完成付款" />
            </label>
            <label style={lbl}>內文<span style={{ fontWeight: 400, color: "#94a3b8" }}>（Markdown：# 標題、**粗體**、- 清單、--- 分隔線、[文字](網址)＝連結、整行只放連結＝置中按鈕）</span>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className={styles.btnSmall} onClick={onClose} disabled={busy}>取消</button>
              <button className={`${styles.btnSmall} ${styles.green}`} onClick={send} disabled={busy || !recipients.length}>{busy ? "寄送中…" : `寄給 ${recipients.length} 位`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order status pill helper ───────────────────────────────────────────────
export function OrderStatusPill({status}){
  const MAP={paid:["已付款","#dcfce7","#166534"],pending:["待付款","#fef3c7","#92400e"],refunded:["已退款","#dbeafe","#1e40af"],failed:["付款失敗","#fee2e2","#991b1b"],cancelled:["已取消","#f1f5f9","#475569"]};
  const [label,bg,fg]=MAP[status]||MAP.pending;
  return <span className={styles.pill} style={{background:bg,color:fg}}>{label}</span>;
}

export function fmt(v){if(!v)return "—";try{return new Date(v).toLocaleString("zh-TW");}catch{return v;}}

export function levelLabel(l){return{none:"沒碰過",little:"摸過一點",some:"有基礎"}[l]||"—";}

export function genderLabel(v){return{male:"男",female:"女",other:"其他",prefer_not:"不願透露"}[v]||"—";}

// PayUni PaymentType 數字→中文（比照 lib/dashboard.js PAY_TYPE_LABELS）；未知原樣顯示、空值—
export function payTypeLabel(v){return{"1":"信用卡","2":"ATM轉帳","3":"超商代碼",Credit:"信用卡",ATM:"ATM轉帳",CVS:"超商代碼"}[v]||v||"—";}

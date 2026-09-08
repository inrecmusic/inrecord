"use client";
import { useEffect, useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";

// 營運助理：每週一自動產生的營運週報（唯讀）。左列表、右內容；「立刻產生」跑過去 7 天。
// 數字由程式算、Claude 只解讀；建議只導向既有後台頁面，不會自動執行任何動作。
const PAGE_LABEL = { dashboard: "儀表板", courses: "課程管理", messages: "留言管理", media: "媒體中心", students: "學員管理", orders: "訂單管理", customer: "客戶查詢", subscriptions: "遊戲存取", coupons: "優惠券", analytics: "數據分析", ads: "廣告成效", sale: "銷售設定", tracking: "追蹤碼", audit: "操作紀錄", newsletter: "電子報", announcements: "教室公告", ops: "營運助理" };
const LEVEL = { high: ["高", "#dc2626", "#fef2f2"], medium: ["中", "#b45309", "#fffbeb"], low: ["低", "#047857", "#ecfdf5"] };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
const periodLabel = (r) => `${fmtDate(r.period_start)}–${fmtDate(new Date(Date.parse(r.period_end) - 86400000).toISOString())}`;

export default function OpsAssistantPage({ showToast, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    _api("/api/admin/ops-report?limit=12").then((r) => r.json()).then((d) => {
      if (cancelled || !d?.ok) return;
      setRows(d.data || []); setSel((d.data || [])[0] || null); setConfigured(d.configured !== false);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function runNow() {
    setBusy(true);
    try {
      const r = await _api("/api/admin/ops-report/run", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setRows((prev) => [d.data, ...prev]); setSel(d.data); showToast?.("✅ 週報已產生"); }
      else showToast?.("❌ 產生失敗：" + (d.error === "rate_limited" ? "10 分鐘內只能產生一次" : d.error || r.status));
    } catch (e) { showToast?.("❌ 產生失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const rep = sel?.report;
  const metrics = Object.entries(rep?.metrics || {}).filter(([, v]) => typeof v !== "object");
  return (
    <div>
      <div className={styles.pageHeader} style={{ flexWrap: "wrap", gap: 12 }}>
        <div><h1>營運助理</h1><p>每週一早上 8 點自動整理上週營運週報；數字由程式計算，Claude 只負責解讀與建議。唯讀，不會自動執行任何動作。</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnPrimary} disabled={busy || !configured} onClick={runNow}>{busy ? "產生中…" : "立刻產生（過去 7 天）"}</button>
        </div>
      </div>
      {!configured && (
        <div className={styles.panel} style={{ marginBottom: 16, color: "#92400e", background: "#fffbeb" }}>
          尚未設定 ANTHROPIC_API_KEY，排程會自動跳過。到 Vercel 環境變數設好並重新部署後，這裡就會開始出現週報。
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        <div className={styles.panel}>
          <strong style={{ fontSize: 13, color: "#475569" }}>歷史週報</strong>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {rows.length === 0 && <span className={styles.dim} style={{ fontSize: 13 }}>還沒有報告</span>}
            {rows.map((r) => (
              <button key={r.id} className={styles.btnSmall} style={{ textAlign: "left", background: sel?.id === r.id ? "#eff6ff" : undefined }} onClick={() => setSel(r)}>
                {periodLabel(r)}
                <span className={styles.dim} style={{ marginLeft: 6, fontSize: 11 }}>{r.triggered_by === "manual" ? "手動" : "排程"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.panel}>
          {!rep ? <span className={styles.dim}>選一份報告，或按「立刻產生」。</span> : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{rep.headline}</h2>
              <p className={styles.dim} style={{ fontSize: 12, margin: "0 0 16px" }}>期間 {periodLabel(sel)}・{sel.triggered_by === "manual" ? "手動產生" : "排程產生"}</p>
              <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>重點</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>{(rep.highlights || []).map((h, i) => <li key={i}>{h}</li>)}</ul>
              {rep.risks?.length > 0 && (<>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>風險</h3>
                <div style={{ display: "grid", gap: 6 }}>{rep.risks.map((r, i) => { const [t, fg, bg] = LEVEL[r.level] || LEVEL.medium; return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ fontSize: 11, fontWeight: 800, color: fg, background: bg, borderRadius: 6, padding: "2px 6px", flex: "none" }}>{t}</span><span>{r.text}</span></div>
                ); })}</div>
              </>)}
              {rep.suggestions?.length > 0 && (<>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>建議</h3>
                <div style={{ display: "grid", gap: 8 }}>{rep.suggestions.map((s, i) => (
                  <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{s.title}</strong>
                      <button className={styles.btnSmall} onClick={() => onNavigate?.(s.admin_path)}>前往 {PAGE_LABEL[s.admin_path] || s.admin_path}</button>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>{s.why}</p>
                  </div>
                ))}</div>
              </>)}
              {metrics.length > 0 && (<>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>關鍵數字</h3>
                <table className={styles.table}><tbody>{metrics.map(([k, v]) => <tr key={k}><td style={{ color: "#64748b" }}>{k}</td><td style={{ fontVariantNumeric: "tabular-nums" }}>{String(v)}</td></tr>)}</tbody></table>
              </>)}
              <p className={styles.dim} style={{ fontSize: 11, marginTop: 16 }}>模型 {sel.model}・輸入 {sel.input_tokens} tokens・輸出 {sel.output_tokens} tokens・約 US${Number(sel.cost_usd || 0).toFixed(2)}{sel.emailed_at ? "・摘要信已寄" : ""}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

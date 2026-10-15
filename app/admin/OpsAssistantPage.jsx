"use client";
import { useEffect, useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import { coreRows, LIMITS } from "@/lib/ops-report/schema";
import styles from "./admin.module.css";

// 營運助理：每週一自動產生的營運週報（唯讀）。左列表、右內容；「立刻產生」跑過去 7 天。
// 數字由程式算、Claude 只解讀；建議只導向既有後台頁面，不會自動執行任何動作。
// 版式（精簡版）：一句話 → 核心六指標本週／上週 → 重點（≤3）→ 風險（只有 high）→ 建議（≤3，做什麼＋前往）→ 更多數字（摺疊）。
const PAGE_LABEL = { dashboard: "儀表板", courses: "課程管理", messages: "留言管理", media: "媒體中心", students: "學員管理", orders: "訂單管理", customer: "客戶查詢", subscriptions: "遊戲存取", coupons: "優惠券", analytics: "數據分析", ads: "廣告成效", sale: "銷售設定", tracking: "追蹤碼", audit: "操作紀錄", newsletter: "電子報", announcements: "教室公告", ops: "營運助理" };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
const periodLabel = (r) => `${fmtDate(r.period_start)}–${fmtDate(new Date(Date.parse(r.period_end) - 86400000).toISOString())}`;
const NUM = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const H3 = { fontSize: 14, margin: "18px 0 6px" };

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
  const core = coreRows(rep);
  const highlights = (rep?.highlights || []).slice(0, LIMITS.highlights);
  const risks = (rep?.risks || []).filter((r) => r.level === "high");   // 舊報告的 medium／low 也一併不顯示
  const suggestions = (rep?.suggestions || []).slice(0, LIMITS.suggestions);
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
              <h2 style={{ margin: "0 0 6px", fontSize: 20, lineHeight: 1.4 }}>{rep.headline}</h2>
              <p className={styles.dim} style={{ fontSize: 12, margin: "0 0 14px" }}>期間 {periodLabel(sel)}・{sel.triggered_by === "manual" ? "手動產生" : "排程產生"}</p>

              {core.length > 0 && (
                <table className={styles.table} style={{ maxWidth: 480 }}>
                  <thead><tr><th style={{ textAlign: "left", fontWeight: 600, color: "#64748b" }}>核心指標</th><th style={{ ...NUM, fontWeight: 600 }}>本週</th><th style={{ ...NUM, fontWeight: 600, color: "#64748b" }}>上週</th></tr></thead>
                  <tbody>{core.map((r) => (
                    <tr key={r.key}><td style={{ color: "#475569" }}>{r.label}</td><td style={{ ...NUM, fontWeight: 700 }}>{r.now}</td><td style={{ ...NUM, color: "#64748b" }}>{r.prev}</td></tr>
                  ))}</tbody>
                </table>
              )}

              {highlights.length > 0 && (<>
                <h3 style={H3}>重點</h3>
                <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>{highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </>)}

              {risks.length > 0 && (<>
                <h3 style={H3}>風險</h3>
                <div style={{ display: "grid", gap: 6 }}>{risks.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", background: "#fef2f2", borderRadius: 6, padding: "2px 6px", flex: "none" }}>高</span><span>{r.text}</span></div>
                ))}</div>
              </>)}

              {suggestions.length > 0 && (<>
                <h3 style={H3}>建議</h3>
                <div style={{ display: "grid", gap: 6 }}>{suggestions.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px" }}>
                    <span>{s.title}</span>
                    <button className={styles.btnSmall} style={{ flex: "none" }} onClick={() => onNavigate?.(s.admin_path)}>前往 {PAGE_LABEL[s.admin_path] || s.admin_path}</button>
                  </div>
                ))}</div>
              </>)}

              {metrics.length > 0 && (
                <details style={{ marginTop: 18 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#475569" }}>更多數字（{metrics.length} 項）</summary>
                  <table className={styles.table} style={{ maxWidth: 480, marginTop: 8 }}><tbody>{metrics.map(([k, v]) => <tr key={k}><td style={{ color: "#64748b" }}>{k}</td><td style={NUM}>{String(v)}</td></tr>)}</tbody></table>
                </details>
              )}

              <p className={styles.dim} style={{ fontSize: 11, marginTop: 16 }}>模型 {sel.model}・輸入 {sel.input_tokens} tokens・輸出 {sel.output_tokens} tokens・約 US${Number(sel.cost_usd || 0).toFixed(2)}{sel.emailed_at ? "・摘要信已寄" : ""}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
async function adminFetch(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

// ── Format helpers (mirror mockup's nf/kf helpers, defensive against null/undefined/NaN) ──
const nf = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
function kf(n) {
  const v = Number(n) || 0;
  if (v >= 10000) return Math.round(v / 1000) + "K";
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  return String(Math.round(v));
}
const pf = (n, d = 2) => (Number(n) || 0).toFixed(d) + "%";
const xf = (n, d = 2) => (Number(n) || 0).toFixed(d) + "×";
const roasLabel = (n) => { const v = Number(n) || 0; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + "×"; };
const statusColorVar = (s) => (s === "good" ? "var(--good)" : s === "warn" ? "var(--warn)" : "var(--bad)");
const shortName = (name) => { const s = String(name || "").trim(); return s ? s.split(" · ")[0] : "—"; };
const statusOf = (roas, target) => { const r = Number(roas) || 0, t = Number(target) || 3; return r >= t ? "good" : r >= 1 ? "warn" : "bad"; };
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso).slice(5);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Scoped styles, ported from the approved mockup (ad-performance-dashboard.html). ──
// Selectors are prefixed with .adsDash so they never leak into the rest of /admin.
// :root variable blocks become .adsDash variable blocks (no global bleed of these tokens).
// #id-based hooks from the mockup's vanilla-JS DOM injection become plain classNames
// since React renders the SVG/HTML content directly instead of querying the DOM.
// The mockup's [data-theme] overrides are dropped — this app has no theme toggle, only
// prefers-color-scheme — so those rules would be dead code here.
const CSS = `
.adsDash {
  --bg: #eef2f7; --surface: #ffffff; --surface-2: #f8fafc;
  --border: #e2e8f0; --border-strong: #cbd5e1;
  --text: #0f172a; --muted: #64748b; --faint: #94a3b8;
  --accent: #2563eb; --accent-soft: #eff6ff;
  --good: #16a34a; --good-soft: #dcfce7;
  --warn: #b45309; --warn-soft: #fef3c7;
  --bad: #dc2626; --bad-soft: #fee2e2;
  --spend: #94a3b8; --revenue: #2563eb; --grid: #e8edf3; --target: #f59e0b;
  --shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.05);
  --radius: 14px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Helvetica Neue", sans-serif;
  background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.5; -webkit-font-smoothing: antialiased;
  border-radius: 16px;
}
@media (prefers-color-scheme: dark) {
  .adsDash {
    --bg: #0a1120; --surface: #0f172a; --surface-2: #131d31;
    --border: #1e293b; --border-strong: #334155;
    --text: #e5ecf5; --muted: #93a3b8; --faint: #647289;
    --accent: #4b8bff; --accent-soft: #14213f;
    --good: #34d399; --good-soft: rgba(52,211,153,.15);
    --warn: #fbbf24; --warn-soft: rgba(251,191,36,.15);
    --bad: #f87171; --bad-soft: rgba(248,113,113,.15);
    --spend: #64748b; --revenue: #6ea8ff; --grid: #1a2740; --target: #fbbf24;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35);
  }
}
.adsDash * { box-sizing: border-box; }
.adsDash .wrap { max-width: 1140px; margin: 0 auto; padding: 26px 20px 56px; }
.adsDash .tnum { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
.adsDash .top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.adsDash .h-title { font-size: 25px; font-weight: 800; letter-spacing: -.02em; margin: 0; }
.adsDash .h-sub { color: var(--muted); font-size: 13px; margin-top: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adsDash .ranges { display: flex; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 4px; box-shadow: var(--shadow); }
.adsDash .chip { border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; padding: 6px 13px; border-radius: 8px; cursor: pointer; }
.adsDash .chip[aria-pressed="true"] { background: var(--accent); color: #fff; }
.adsDash .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.adsDash .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.adsDash .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin-bottom: 14px; }
.adsDash .callout { padding: 13px 16px; display: flex; align-items: center; gap: 12px; border-left: 3px solid; }
.adsDash .callout.best { border-left-color: var(--good); }
.adsDash .callout.worst { border-left-color: var(--bad); }
.adsDash .callout .ico { font-size: 20px; line-height: 1; }
.adsDash .callout .c-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.adsDash .callout .c-k { font-size: 11.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--faint); }
.adsDash .callout .c-v { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adsDash .callout .c-note { margin-left: auto; font-size: 12.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.adsDash .callout.best .c-note { color: var(--good); background: var(--good-soft); }
.adsDash .callout.worst .c-note { color: var(--bad); background: var(--bad-soft); }
.adsDash .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; margin-bottom: 13px; }
.adsDash .kpi { padding: 15px 16px 14px; display: flex; flex-direction: column; gap: 6px; }
.adsDash .kpi .label { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--faint); }
.adsDash .kpi .val { font-size: 27px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
.adsDash .kpi .val small { font-size: 15px; font-weight: 700; color: var(--muted); margin-right: 1px; }
.adsDash .kpi .ctx { font-size: 11.5px; color: var(--muted); }
.adsDash .kpi.hero .val { color: var(--good); font-size: 33px; }
.adsDash .kpi.hero { background: linear-gradient(180deg, var(--good-soft), transparent 72%); }
.adsDash .cmp { color: var(--muted); }
.adsDash .subkpis { display: grid; grid-template-columns: repeat(6, 1fr); padding: 4px 2px; margin-bottom: 18px; }
.adsDash .mini { padding: 12px 15px; display: flex; flex-direction: column; gap: 3px; border-left: 1px solid var(--border); }
.adsDash .mini:first-child { border-left: 0; }
.adsDash .mini .m-label { font-size: 11px; color: var(--faint); font-weight: 600; }
.adsDash .mini .m-val { font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
.adsDash .panel { padding: 15px 18px 12px; }
.adsDash .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
.adsDash .panel-title { font-size: 14.5px; font-weight: 700; }
.adsDash .panel-sub { font-size: 11.5px; color: var(--faint); }
.adsDash .legend { display: flex; gap: 14px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
.adsDash .legend b { font-weight: 600; }
.adsDash .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.adsDash .swatch.dash { width: 14px; height: 0; border-top: 2px dashed var(--target); border-radius: 0; }
.adsDash .scroll-x { overflow-x: auto; }
.adsDash svg { display: block; }
.adsDash .trend { margin-bottom: 14px; }
.adsDash .chartSvg { width: 100%; height: auto; min-width: 520px; }
.adsDash .analysis { display: grid; grid-template-columns: 1.32fr 1fr; gap: 14px; margin-bottom: 14px; align-items: stretch; }
.adsDash .col { display: flex; flex-direction: column; gap: 14px; }
.adsDash .scatterSvg { width: 100%; height: auto; }
.adsDash .alloc-bar { display: flex; width: 100%; height: 30px; border-radius: 7px; overflow: hidden; gap: 2px; background: var(--surface); }
.adsDash .seg { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; color: #fff; min-width: 2px; }
.adsDash .alloc-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; margin-top: 12px; font-size: 12px; }
.adsDash .alloc-legend .li { display: flex; align-items: center; gap: 7px; color: var(--muted); }
.adsDash .alloc-legend .li .nm { color: var(--text); }
.adsDash .alloc-legend .li .pc { margin-left: auto; font-weight: 700; }
.adsDash .funnel { display: flex; flex-direction: column; gap: 7px; }
.adsDash .fstage { display: flex; align-items: center; gap: 10px; }
.adsDash .fbar-wrap { flex: 1; min-width: 0; }
.adsDash .fbar { height: 26px; background: var(--accent); border-radius: 6px; display: flex; align-items: center; padding: 0 9px; color: #fff; font-size: 12px; font-weight: 700; }
.adsDash .fmeta { width: 84px; font-size: 12px; color: var(--muted); text-align: right; }
.adsDash .fmeta .fn { display: block; color: var(--text); font-weight: 600; }
.adsDash .fdrop { font-size: 10.5px; color: var(--faint); padding-left: 94px; margin: -3px 0; }
.adsDash .t-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 2px 2px 10px; flex-wrap: wrap; }
.adsDash .t-head h2 { font-size: 15px; font-weight: 700; margin: 0; }
.adsDash .t-head .hint { font-size: 12px; color: var(--faint); }
.adsDash .table-scroll { overflow-x: auto; }
.adsDash table { width: 100%; border-collapse: collapse; min-width: 900px; }
.adsDash th, .adsDash td { text-align: right; padding: 11px 12px; font-size: 12.5px; white-space: nowrap; }
.adsDash th:first-child, .adsDash td:first-child { text-align: left; }
.adsDash thead th { font-size: 10.5px; font-weight: 600; letter-spacing: .03em; color: var(--faint); text-transform: uppercase; border-bottom: 1px solid var(--border); background: var(--surface-2); }
.adsDash tbody tr { border-bottom: 1px solid var(--border); }
.adsDash tbody tr:last-child { border-bottom: 0; }
.adsDash tbody tr:hover { background: var(--surface-2); }
.adsDash tbody tr.loss { background: color-mix(in srgb, var(--bad) 6%, transparent); }
.adsDash .camp { font-weight: 600; color: var(--text); }
.adsDash tfoot td { font-weight: 800; border-top: 2px solid var(--border-strong); background: var(--surface-2); }
.adsDash .pill { display: inline-block; font-weight: 800; font-size: 12px; padding: 3px 9px; border-radius: 999px; }
.adsDash .pill.good { color: var(--good); background: var(--good-soft); }
.adsDash .pill.warn { color: var(--warn); background: var(--warn-soft); }
.adsDash .pill.bad { color: var(--bad); background: var(--bad-soft); }
.adsDash .muted { color: var(--muted); }
.adsDash .cwarn { color: var(--warn); font-weight: 700; }
.adsDash .spark { display: block; }
.adsDash .kbd { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; color: var(--text); }
.adsDash .emptyWrap { min-height: 340px; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
.adsDash .emptyCard { max-width: 480px; text-align: center; padding: 40px 32px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.adsDash .emptyIcon { font-size: 34px; }
.adsDash .emptyTitle { font-size: 18px; font-weight: 800; }
.adsDash .emptyDesc { font-size: 13.5px; color: var(--muted); line-height: 1.8; }
@media (max-width: 900px) {
  .adsDash .kpis { grid-template-columns: repeat(2, 1fr); }
  .adsDash .actions { grid-template-columns: 1fr; }
  .adsDash .subkpis { grid-template-columns: repeat(3, 1fr); }
  .adsDash .mini:nth-child(4) { border-left: 0; }
  .adsDash .mini:nth-child(n+4) { border-top: 1px solid var(--border); }
  .adsDash .analysis { grid-template-columns: 1fr; }
}
@media (max-width: 540px) {
  .adsDash .kpis { grid-template-columns: 1fr; }
  .adsDash .subkpis { grid-template-columns: repeat(2, 1fr); }
  .adsDash .mini:nth-child(odd) { border-left: 0; }
  .adsDash .mini:nth-child(n+3) { border-top: 1px solid var(--border); }
  .adsDash .alloc-legend { grid-template-columns: 1fr; }
}
`;

// ── Empty state ──────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="emptyWrap">
      <div className="card emptyCard">
        <span className="emptyIcon" aria-hidden="true">📊</span>
        <span className="emptyTitle">尚未有廣告數據</span>
        <span className="emptyDesc">
          請在 env 設定 <span className="kbd">META_ADS_ACCESS_TOKEN</span> / <span className="kbd">META_AD_ACCOUNT_ID</span>
          （並確認 Meta Pixel 已於追蹤碼分頁啟用），廣告投放後每日自動同步。
        </span>
      </div>
    </div>
  );
}

// ── Action callouts (best / worst campaign) ─────────────────────────────
function ActionCallouts({ best, worst }) {
  if (!best && !worst) return null;
  return (
    <section className="actions" aria-label="行動提示">
      {best && (
        <div className="card callout best">
          <span className="ico" aria-hidden="true">🏆</span>
          <div className="c-body"><span className="c-k">最賺 · 該擴量</span><span className="c-v">{best.campaign_name}</span></div>
          <span className="c-note tnum">ROAS {xf(best.trueRoas)} · CPA NT${nf(best.cpa)}</span>
        </div>
      )}
      {worst && (
        <div className="card callout worst">
          <span className="ico" aria-hidden="true">⚠️</span>
          <div className="c-body"><span className="c-k">虧損 · 該檢視或暫停</span><span className="c-v">{worst.campaign_name}</span></div>
          <span className="c-note tnum">ROAS {xf(worst.trueRoas)} · CPA NT${nf(worst.cpa)}</span>
        </div>
      )}
    </section>
  );
}

// ── KPI hero row ─────────────────────────────────────────────────────────
function KpiSection({ totals, days }) {
  const t = totals || {};
  const trueRoas = Number(t.trueRoas) || 0;
  const metaRoas = Number(t.metaRoas) || 0;
  const overReportPct = trueRoas > 0 && metaRoas > 0 ? Math.round(((metaRoas - trueRoas) / trueRoas) * 100) : null;
  return (
    <section className="kpis" aria-label="總覽">
      <div className="card kpi hero">
        <span className="label">真 ROAS</span>
        <span className="val tnum">{trueRoas.toFixed(2)}<small>×</small></span>
        <span className="ctx">每投 NT$1 帶回 NT${trueRoas.toFixed(2)}</span>
        {metaRoas > 0 && (
          <span className="ctx cmp">
            Meta 回報 {metaRoas.toFixed(2)}×{overReportPct != null ? `（${overReportPct >= 0 ? "高報" : "低報"} ${Math.abs(overReportPct)}%）` : ""}
          </span>
        )}
      </div>
      <div className="card kpi">
        <span className="label">CPA 每次成交成本</span>
        <span className="val tnum"><small>NT$</small>{nf(t.cpa)}</span>
        <span className="ctx">{nf(t.orders)} 筆成交</span>
      </div>
      <div className="card kpi">
        <span className="label">廣告花費</span>
        <span className="val tnum"><small>NT$</small>{nf(t.spend)}</span>
        <span className="ctx">過去 {days} 天</span>
      </div>
      <div className="card kpi">
        <span className="label">真實營收（歸因）</span>
        <span className="val tnum"><small>NT$</small>{nf(t.revenue)}</span>
        <span className="ctx">你的訂單資料，非 Meta 估計</span>
      </div>
    </section>
  );
}

// ── Mini metrics row (funnel + audience) ────────────────────────────────
function MiniMetrics({ totals }) {
  const t = totals || {};
  const items = [
    ["曝光", kf(t.impressions)],
    ["觸及", kf(t.reach)],
    ["頻率", (Number(t.frequency) || 0).toFixed(2)],
    ["點擊", nf(t.clicks)],
    ["CTR", pf(t.ctr)],
    ["轉換率 CVR", pf(t.cvr)],
  ];
  return (
    <section className="card subkpis" aria-label="漏斗與受眾指標">
      {items.map(([label, val]) => (
        <div className="mini" key={label}><span className="m-label">{label}</span><span className="m-val tnum">{val}</span></div>
      ))}
    </section>
  );
}

// ── Trend area chart: daily spend vs revenue ────────────────────────────
function TrendChart({ series }) {
  const data = Array.isArray(series) ? series : [];
  const N = data.length;
  if (N === 0) {
    return <div style={{ padding: "24px 0", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>尚無每日趨勢資料</div>;
  }
  const W = 900, H = 240, pL = 8, pR = 8, pT = 12, pB = 22, iw = W - pL - pR, ih = H - pT - pB;
  const spend = data.map((d) => Number(d.spend) || 0);
  const rev = data.map((d) => Number(d.revenue) || 0);
  const maxY = Math.max(1, ...spend, ...rev) * 1.08;
  const x = (i) => (N > 1 ? pL + (i / (N - 1)) * iw : pL + iw / 2);
  const y = (v) => pT + ih - (v / maxY) * ih;
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = (arr) => `${line(arr)} L${x(N - 1).toFixed(1)} ${(pT + ih).toFixed(1)} L${x(0).toFixed(1)} ${(pT + ih).toFixed(1)} Z`;
  const gridYs = [0, 1, 2, 3].map((k) => pT + (ih / 3) * k);
  const tickIdx = N <= 1 ? [0] : Array.from(new Set([0, Math.round((N - 1) / 3), Math.round(((N - 1) * 2) / 3), N - 1]));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tickLabel = (i) => (i === N - 1 && data[i]?.date === todayStr ? "今天" : fmtDate(data[i]?.date));

  return (
    <div className="scroll-x">
      <svg className="chartSvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="每日花費與真實營收趨勢圖">
        <defs>
          <linearGradient id="adsGradRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--revenue)", stopOpacity: 0.2 }} />
            <stop offset="1" style={{ stopColor: "var(--revenue)", stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id="adsGradSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--spend)", stopOpacity: 0.16 }} />
            <stop offset="1" style={{ stopColor: "var(--spend)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {gridYs.map((gy, i) => <line key={i} x1={pL} y1={gy} x2={W - pR} y2={gy} stroke="var(--grid)" strokeWidth="1" />)}
        {tickIdx.map((i) => (
          <text key={i} x={x(i).toFixed(1)} y={H - 6} fill="var(--faint)" fontSize="11"
            textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"}>
            {tickLabel(i)}
          </text>
        ))}
        <path d={area(spend)} fill="url(#adsGradSpend)" />
        <path d={line(spend)} fill="none" stroke="var(--spend)" strokeWidth="2" strokeLinejoin="round" />
        <path d={area(rev)} fill="url(#adsGradRev)" />
        <path d={line(rev)} fill="none" stroke="var(--revenue)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(N - 1).toFixed(1)} cy={y(rev[N - 1]).toFixed(1)} r="4.5" fill="var(--revenue)" />
        <circle cx={x(N - 1).toFixed(1)} cy={y(spend[N - 1]).toFixed(1)} r="3.5" fill="var(--spend)" />
      </svg>
    </div>
  );
}

// ── Scatter: spend x ROAS, bubble = revenue, color = status, dashed target line ──
function ScatterChart({ campaigns, targetRoas }) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  if (!list.length) {
    return <div style={{ padding: "24px 0", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>尚無活動資料</div>;
  }
  const W = 470, H = 320, pL = 44, pR = 16, pT = 14, pB = 34, iw = W - pL - pR, ih = H - pT - pB;
  const tgt = Number(targetRoas) || 3;
  const maxX = Math.max(1, ...list.map((c) => Number(c.spend) || 0)) * 1.15;
  const maxY = Math.max(tgt * 1.5, ...list.map((c) => Number(c.trueRoas) || 0)) * 1.15 || 1;
  const X = (v) => pL + (v / maxX) * iw;
  const Y = (v) => pT + ih - (v / maxY) * ih;
  const R = (rev) => Math.max(7, Math.min(26, Math.sqrt(Math.max(0, Number(rev) || 0)) / 9));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => f * maxX);
  const tgtY = Y(tgt);

  return (
    <svg className="scatterSvg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="各廣告活動的花費與 ROAS 散點圖">
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={pL} y1={Y(v).toFixed(1)} x2={W - pR} y2={Y(v).toFixed(1)} stroke="var(--grid)" strokeWidth="1" />
          <text x={pL - 8} y={(Y(v) + 3.5).toFixed(1)} fill="var(--faint)" fontSize="10" textAnchor="end">{v.toFixed(1)}×</text>
        </g>
      ))}
      {xTicks.map((v, i) => (
        <text key={i} x={X(v).toFixed(1)} y={H - 14} fill="var(--faint)" fontSize="10" textAnchor="middle">{v >= 1000 ? (v / 1000).toFixed(1) + "K" : Math.round(v)}</text>
      ))}
      <line x1={pL} y1={tgtY.toFixed(1)} x2={W - pR} y2={tgtY.toFixed(1)} stroke="var(--target)" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={W - pR} y={(tgtY - 5).toFixed(1)} fill="var(--target)" fontSize="10" textAnchor="end" fontWeight="700">目標 {roasLabel(tgt)}</text>
      <text x={W - pR} y={H - 1} fill="var(--muted)" fontSize="10.5" textAnchor="end">花費 →</text>
      <text transform={`translate(13 ${pT + 6}) rotate(-90)`} fill="var(--muted)" fontSize="10.5" textAnchor="end">ROAS ↑</text>
      {list.map((c) => {
        const tr = Number(c.trueRoas) || 0;
        const cx = X(Number(c.spend) || 0), cy = Y(Math.min(tr, maxY)), r = R(c.revenue);
        const col = statusColorVar(c.status);
        const short = shortName(c.campaign_name).slice(0, 14);
        const lx = cx + r + 5 > W - pR - 46 ? cx - r - 5 : cx + r + 5;
        const anc = cx + r + 5 > W - pR - 46 ? "end" : "start";
        return (
          <g key={c.campaign_id}>
            <title>{`${c.campaign_name}｜花費 NT$${nf(c.spend)}｜ROAS ${xf(tr)}｜營收 NT$${nf(c.revenue)}`}</title>
            <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={r.toFixed(1)} fill={col} fillOpacity="0.22" stroke={col} strokeWidth="2" />
            <text x={lx.toFixed(1)} y={(cy + 3).toFixed(1)} fill="var(--muted)" fontSize="10.5" fontWeight="600" textAnchor={anc}>{short}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Spend allocation bar + legend ────────────────────────────────────────
function AllocationPanel({ allocation }) {
  const list = Array.isArray(allocation) ? allocation : [];
  if (!list.length) return <div style={{ padding: "12px 0", color: "var(--faint)", fontSize: 13 }}>尚無花費資料</div>;
  return (
    <>
      <div className="alloc-bar">
        {list.map((a, i) => {
          const pct = Number(a.pct) || 0;
          const col = statusColorVar(a.status);
          return (
            <div key={i} className="seg" style={{ width: `${pct}%`, background: col }} title={`${a.campaign_name}：NT$${nf(a.spend)}（${pct.toFixed(0)}%）`}>
              {pct >= 12 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="alloc-legend">
        {list.map((a, i) => (
          <div key={i} className="li">
            <span className="swatch" style={{ background: statusColorVar(a.status) }} />
            <span className="nm">{shortName(a.campaign_name)}</span>
            <span className="pc tnum">{(Number(a.pct) || 0).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Conversion funnel: impressions -> clicks -> purchases ───────────────
// (No InitiateCheckout data is fetched by /api/admin/ad-insights today, so this
// stays a 3-stage funnel rather than the mockup's 4-stage impressions/clicks/
// add-to-cart/purchase version.)
function FunnelPanel({ funnel }) {
  const f = funnel || {};
  const stages = [
    { l: "曝光", n: Number(f.impressions) || 0 },
    { l: "點擊", n: Number(f.clicks) || 0 },
    { l: "購買", n: Number(f.purchases) || 0 },
  ];
  const vals = stages.map((s) => Math.max(1, s.n));
  const lo = Math.log(Math.min(...vals)), hi = Math.log(Math.max(...vals));
  const span = hi - lo || 1;
  return (
    <div className="funnel">
      {stages.map((s, i) => {
        const w = hi > lo ? 22 + 78 * ((Math.log(Math.max(1, s.n)) - lo) / span) : 100;
        const op = 1 - i * 0.16;
        const next = stages[i + 1];
        const conv = next && s.n > 0 ? (next.n / s.n) * 100 : null;
        return (
          <div key={s.l}>
            <div className="fstage">
              <div className="fmeta"><span className="fn">{kf(s.n)}</span>{s.l}</div>
              <div className="fbar-wrap"><div className="fbar" style={{ width: `${w.toFixed(1)}%`, opacity: op }} /></div>
            </div>
            {next && <div className="fdrop">↓ {conv == null ? "—" : (conv < 1 ? conv.toFixed(2) : conv.toFixed(1))}% 進入下一步</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Per-campaign 7-day sparkline ─────────────────────────────────────────
function Sparkline({ trend }) {
  const sp = Array.isArray(trend) && trend.length ? trend : [0, 0];
  const sw = 74, sh = 22;
  const mn = Math.min(...sp), mx = Math.max(...sp), rng = mx - mn || 1;
  const sx = (i) => (sp.length > 1 ? (i / (sp.length - 1)) * (sw - 4) + 2 : sw / 2);
  const sy = (v) => sh - 2 - ((v - mn) / rng) * (sh - 6);
  const d = sp.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
  const dirColor = sp[sp.length - 1] >= sp[0] ? "var(--good)" : "var(--bad)";
  return (
    <svg className="spark" width={sw} height={sh} viewBox={`0 0 ${sw} ${sh}`}>
      <path d={d} fill="none" stroke={dirColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(sp.length - 1).toFixed(1)} cy={sy(sp[sp.length - 1]).toFixed(1)} r="2.4" fill={dirColor} />
    </svg>
  );
}

// ── Campaign detail table ────────────────────────────────────────────────
function CampaignTable({ campaigns, totals, targetRoas }) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const t = totals || {};
  return (
    <div className="card table-scroll">
      <table>
        <thead>
          <tr>
            <th>廣告活動</th><th>7 天走勢</th><th>花費</th><th>CPA</th><th>點擊</th><th>CVR</th><th>頻率</th><th>你的訂單</th><th>你的營收</th><th>Meta ROAS</th><th>真 ROAS</th>
          </tr>
        </thead>
        <tbody>
          {!list.length ? (
            <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--faint)", padding: 20 }}>尚無廣告活動資料</td></tr>
          ) : list.map((c) => (
            <tr key={c.campaign_id} className={c.status === "bad" ? "loss" : ""}>
              <td className="camp">{c.campaign_name}</td>
              <td><Sparkline trend={c.trend} /></td>
              <td className="tnum">{nf(c.spend)}</td>
              <td className="tnum">{nf(c.cpa)}</td>
              <td className="tnum">{nf(c.clicks)}</td>
              <td className="tnum muted">{pf(c.cvr)}</td>
              <td className={`tnum ${Number(c.frequency) > 3.5 ? "cwarn" : "muted"}`}>{(Number(c.frequency) || 0).toFixed(1)}</td>
              <td className="tnum">{nf(c.orders)}</td>
              <td className="tnum">{nf(c.revenue)}</td>
              <td className="tnum muted">{xf(c.metaRoas)}</td>
              <td><span className={`pill ${c.status} tnum`}>{xf(c.trueRoas)}</span></td>
            </tr>
          ))}
        </tbody>
        {list.length > 0 && (
          <tfoot>
            <tr>
              <td>總計</td><td></td>
              <td className="tnum">{nf(t.spend)}</td>
              <td className="tnum">{nf(t.cpa)}</td>
              <td className="tnum">{nf(t.clicks)}</td>
              <td className="tnum muted">{pf(t.cvr)}</td>
              <td className="tnum muted">{(Number(t.frequency) || 0).toFixed(2)}</td>
              <td className="tnum">{nf(t.orders)}</td>
              <td className="tnum">{nf(t.revenue)}</td>
              <td className="tnum muted">{xf(t.metaRoas)}</td>
              <td><span className={`pill ${statusOf(t.trueRoas, targetRoas)} tnum`}>{xf(t.trueRoas)}</span></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AdsPerformancePage({ showToast }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [targetRoas, setTargetRoas] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminFetch("/api/admin/ad-insights?days=" + days)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || String(r.status));
        return d;
      })
      .then((d) => {
        if (cancelled) return;
        setReport(d?.data || null);
        setTargetRoas(Number(d?.targetRoas) || 3);
      })
      .catch(() => {
        if (cancelled) return;
        setReport(null);
        showToast?.("載入廣告成效資料失敗");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]); // eslint-disable-line

  if (loading && !report) return <div style={{ padding: 24 }}>載入中…</div>;

  const totals = report?.totals || {};
  const campaigns = report?.campaigns || [];
  const empty = !report || !report.configured || !(Number(totals.spend) > 0);

  return (
    <div className="adsDash">
      <style>{CSS}</style>
      <div className="wrap">
        <header className="top">
          <div>
            <h1 className="h-title">廣告成效</h1>
            <p className="h-sub">Meta 廣告 · 以真實訂單營收歸因 · 過去 {days} 天</p>
          </div>
          <div className="ranges" role="group" aria-label="日期範圍">
            {[7, 30, 90].map((d) => (
              <button key={d} className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d} 天</button>
            ))}
          </div>
        </header>

        {empty ? (
          <EmptyState />
        ) : (
          <>
            <ActionCallouts best={report.best} worst={report.worst} />
            <KpiSection totals={totals} days={days} />
            <MiniMetrics totals={totals} />

            <section className="card panel trend" aria-label="每日趨勢">
              <div className="panel-head">
                <span className="panel-title">每日花費 vs 真實營收</span>
                <div className="legend">
                  <span><span className="swatch" style={{ background: "var(--spend)" }} /><b>花費</b></span>
                  <span><span className="swatch" style={{ background: "var(--revenue)" }} /><b>真實營收</b></span>
                </div>
              </div>
              <TrendChart series={report.dailySeries} />
            </section>

            <div className="analysis">
              <section className="card panel" aria-label="賺賠散點圖">
                <div className="panel-head">
                  <div><span className="panel-title">賺賠地圖</span> <span className="panel-sub">花費 × ROAS · 泡泡＝營收</span></div>
                  <div className="legend"><span><span className="swatch dash" /><b>目標 {roasLabel(targetRoas)}</b></span></div>
                </div>
                <ScatterChart campaigns={campaigns} targetRoas={targetRoas} />
              </section>
              <div className="col">
                <section className="card panel" aria-label="花費分配">
                  <div className="panel-head"><span className="panel-title">花費分配</span><span className="panel-sub">依賺賠上色</span></div>
                  <AllocationPanel allocation={report.allocation} />
                </section>
                <section className="card panel" aria-label="轉換漏斗">
                  <div className="panel-head"><span className="panel-title">轉換漏斗</span><span className="panel-sub">曝光 → 購買</span></div>
                  <FunnelPanel funnel={report.funnel} />
                </section>
              </div>
            </div>

            <div className="t-head">
              <h2>各廣告活動</h2>
              <span className="hint">真 ROAS＝你的真實營收 ÷ 花費（綠=獲利 · 琥珀=接近打平 · 紅=虧損）；並列 Meta 自報供比對</span>
            </div>
            <CampaignTable campaigns={campaigns} totals={totals} targetRoas={targetRoas} />
          </>
        )}
      </div>
    </div>
  );
}

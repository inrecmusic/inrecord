// lib/ops-report/email.js — 週報摘要信（Markdown → renderAdminEmailHtml）。
export const PAGE_LABEL = { dashboard: "儀表板", courses: "課程管理", messages: "留言管理", media: "媒體中心", students: "學員管理", orders: "訂單管理", customer: "客戶查詢", subscriptions: "遊戲存取", coupons: "優惠券", analytics: "數據分析", ads: "廣告成效", sale: "銷售設定", tracking: "追蹤碼", audit: "操作紀錄", newsletter: "電子報", announcements: "教室公告", ops: "營運助理" };
const LEVEL_ICON = { high: "🔴", medium: "🟠", low: "🟢" };

export function buildReportEmail(report, periodLabel) {
  const lines = ["## 本週一句話", report.headline, "", "## 重點", ...report.highlights.map((h) => `- ${h}`)];
  if (report.risks?.length) lines.push("", "## 風險", ...report.risks.map((r) => `- ${LEVEL_ICON[r.level] || "🟠"} ${r.text}`));
  if (report.suggestions?.length) lines.push("", "## 建議", ...report.suggestions.map((s) => `- **${s.title}**（後台 → ${PAGE_LABEL[s.admin_path] || s.admin_path}）：${s.why}`));
  const entries = Object.entries(report.metrics || {}).filter(([, v]) => typeof v !== "object");
  if (entries.length) lines.push("", "## 關鍵數字", "| 指標 | 值 |", "|---|---|", ...entries.map(([k, v]) => `| ${k} | ${v} |`));
  lines.push("", "完整報告與歷史紀錄在後台「營運助理」。此信由系統每週自動產生，數字皆由程式計算。");
  return { subject: `InRecord 營運週報 ${periodLabel}`, bodyMd: lines.join("\n") };
}

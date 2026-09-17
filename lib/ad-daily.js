// lib/ad-daily.js — 廣告日報信（純函式）。
//
// 為什麼日報不經過模型：日報要天天寄、要快、數字絕不能錯，而它要講的東西（昨天花多少、
// 收多少、哪個活動該停）規則很固定。交給模型只是多花錢多一層出錯機會。
// 週報才需要模型——那是跨面向的綜合解讀。
import { renderAdminEmailHtml } from "./newsletter.js";
import { adAdvice } from "./ad-advice.js";

const nt = (n) => "NT$" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const r2 = (n) => Number((Number(n) || 0).toFixed(2));
const LEVEL_MARK = { high: "🔴", medium: "🟡", low: "🟢" };

// dayLabel：報告的日期（台灣時間 M/D）。report 為 buildAdReport 的輸出。
// 回 null 代表「昨天沒花錢」——不寄空信，免得每天收到一封沒內容的信而開始無視它。
export function buildAdDailyEmail({ report, dayLabel, targetRoas = 3, siteUrl = "https://inrecordmusic.com" } = {}) {
  const t = report?.totals;
  if (!t || (Number(t.spend) || 0) <= 0) return null;

  const advice = adAdvice(report, { targetRoas });
  const roas = r2(t.trueRoas);
  const net = Math.round((Number(t.revenue) || 0) - (Number(t.spend) || 0));
  const subject = `廣告日報 ${dayLabel}｜花費 ${nt(t.spend)}・ROAS ${roas}`;

  const rows = (report.campaigns || []).filter((c) => (Number(c.spend) || 0) > 0)
    .map((c) => `- **${c.campaign_name || c.campaign_id}**：花 ${nt(c.spend)}、${c.orders} 筆成交、收 ${nt(c.revenue)}、ROAS ${r2(c.trueRoas)}`);

  const adviceRows = (advice?.items || []).map((i) => `- ${LEVEL_MARK[i.level] || ""} **${i.name}**：${i.text}`);

  const re = advice?.reallocation;
  const reLine = re
    ? `把上述建議減碼的 ${nt(re.freed)} 挪到「${re.to}」（ROAS ${re.toRoas}），同樣效率下約可多帶 ${nt(re.estRevenue)} 營收。此為粗估，搬過去不保證維持同樣效率。`
    : null;

  const bodyMd = [
    "@badge 廣告日報",
    `@subtitle ${dayLabel} 投放概況`, "",
    `昨日花費 **${nt(t.spend)}**，成交 **${t.orders}** 筆、營收 **${nt(t.revenue)}**，ROAS **${roas}**（目標 ${targetRoas}），淨${net >= 0 ? "賺" : "損"} **${nt(Math.abs(net))}**。`, "",
    "## 各活動表現",
    ...(rows.length ? rows : ["- 昨日沒有活動花費。"]), "",
    ...(adviceRows.length ? ["## 建議動作", ...adviceRows, ""] : []),
    ...(reLine ? ["## 預算配置", reLine, ""] : []),
    "---",
    `[打開後台廣告成效](${siteUrl}/admin)`, "",
    "數字來源：Meta 廣告數據與本站真實訂單比對（以廣告網址的 utm_campaign 對應活動）。ROAS 為真實訂單營收 ÷ 花費，不採用 Meta 自報的轉換價值。",
  ].join("\n");

  return { subject, html: renderAdminEmailHtml({ subject, bodyMd, siteUrl }) };
}

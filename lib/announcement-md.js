// lib/announcement-md.js — 公告內容 Markdown → HTML。
// 共用電子報的受限 Markdown（lib/newsletter.js mdToHtml，會跳脫 HTML、連結只認 http(s)），
// 外加「裸網址自動變連結」；並拿掉 email 專用的 inline style，顏色交給頁面 CSS（深色主題才上得了色）。
import { mdToHtml } from "./newsletter.js";

// 前面不是 ( 或 ] 或英數的 http(s) 網址 → 包成 [url](url)；已是 [文字](網址) 的不動。
const BARE_URL = /(^|[^(\]\w])(https?:\/\/[^\s<>()]+)/g;

// 句號後面還有字就換行（Alan 2026-10-31：公告一句一行）。條列、標題、引言行不動，避免拆壞清單；」）等收尾符號跟著上一句。
const LIST_LINE = /^[ \t]*(?:[-*+]|\d+[.)]|#{1,6}|>)[ \t]/;
export function breakSentences(md) {
  return String(md ?? "").split("\n").map((line) => (LIST_LINE.test(line) ? line : line.replace(/。(?=[^\s」』）)\]。])/g, "。\n"))).join("\n");
}

export function announcementHtml(md) {
  const src = breakSentences(md).replace(BARE_URL, (_, pre, url) => `${pre}[${url}](${url})`);
  return mdToHtml(src, { plain: true }).replace(/ style="[^"]*"/g, "");
}

// 列表用的一行摘要：把 Markdown 語法拿掉只留純文字（不要把 ** 或 - 印出來），超過長度補「…」。
export function announcementSummary(md, max = 40) {
  const text = String(md ?? "")
    .replace(/```[\s\S]*?```/g, " ")                        // 程式碼區塊
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")                  // 圖片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                // 連結只留文字
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm, "") // 標題／引言／條列符號
    .replace(/[*`~]/g, "")                                 // 粗體／斜體／行內程式碼
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

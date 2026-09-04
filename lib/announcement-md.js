// lib/announcement-md.js — 公告內容 Markdown → HTML。
// 共用電子報的受限 Markdown（lib/newsletter.js mdToHtml，會跳脫 HTML、連結只認 http(s)），
// 外加「裸網址自動變連結」；並拿掉 email 專用的 inline style，顏色交給頁面 CSS（深色主題才上得了色）。
import { mdToHtml } from "./newsletter.js";

// 前面不是 ( 或 ] 或英數的 http(s) 網址 → 包成 [url](url)；已是 [文字](網址) 的不動。
const BARE_URL = /(^|[^(\]\w])(https?:\/\/[^\s<>()]+)/g;

export function announcementHtml(md) {
  const src = String(md ?? "").replace(BARE_URL, (_, pre, url) => `${pre}[${url}](${url})`);
  return mdToHtml(src, { plain: true }).replace(/ style="[^"]*"/g, "");
}

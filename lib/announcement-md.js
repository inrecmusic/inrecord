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

// 公告裡的「留言小卡」：
//   :::letter 講師 Rick 給大家的留言
//   內文（同樣是受限 Markdown）
//   :::
// 切成 [{ type:"md", text }, { type:"letter", title, text }]，教室把 letter 畫成可點開的小卡。沒寫結尾 ::: 就吃到最後。
const LETTER_START = /^:::letter[ \t]*(.*)\n/m;
const LETTER_END = /\n:::[ \t]*(?:\n|$)/; // 不加 m：$ 只認字串結尾
export function splitLetters(md) {
  const out = [];
  let rest = String(md ?? "");
  for (let m = LETTER_START.exec(rest); m; m = LETTER_START.exec(rest)) {
    if (m.index > 0) out.push({ type: "md", text: rest.slice(0, m.index) });
    const inner = rest.slice(m.index + m[0].length);
    const e = LETTER_END.exec("\n" + inner);
    const text = e ? inner.slice(0, Math.max(0, e.index - 1)) : inner;
    out.push({ type: "letter", title: m[1].trim() || "留言", text: text.trim() });
    rest = e ? inner.slice(e.index - 1 + e[0].length) : "";
  }
  if (rest.trim() || !out.length) out.push({ type: "md", text: rest });
  return out;
}

// 列表用的一行摘要：把 Markdown 語法拿掉只留純文字（不要把 ** 或 - 印出來），超過長度補「…」。
export function announcementSummary(md, max = 40) {
  const text = String(md ?? "")
    .replace(/^:::(?:letter)?.*$/gm, " ")                    // 留言小卡標記
    .replace(/```[\s\S]*?```/g, " ")                        // 程式碼區塊
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")                  // 圖片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                // 連結只留文字
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm, "") // 標題／引言／條列符號
    .replace(/[*`~]/g, "")                                 // 粗體／斜體／行內程式碼
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// lib/newsletter.js — 電子報純函式：受限 Markdown→Email HTML、品牌化外框、名單去重。

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 行內格式：先跳脫，再套連結 [文字](網址)、粗體 **x** 與斜體 *y*（粗體先做，避免被單星號吃掉）。
// 連結只認 http(s)，其他 scheme（javascript: 等）原樣當文字，不產生 <a>。
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

// 受限 Markdown：# ## ### 標題、**粗** *斜*、- 清單、--- 分隔線、其餘為段落。文字一律跳脫。
export function mdToHtml(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) {
      out.push("<ul>" + list.map((li) => "<li>" + inline(li) + "</li>").join("") + "</ul>");
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") { flush(); continue; }
    if (line === "---") { flush(); out.push("<hr>"); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flush(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }
    const li = line.match(/^-\s+(.*)$/);
    if (li) { list.push(li[1]); continue; }
    // 整行只有一個連結 → 置中按鈕（CTA）。有其他文字則走一般段落（行內連結）。
    // 用 table + bgcolor 做「防彈按鈕」：<a> 上的 background 在 Gmail/Outlook 會被吃掉，
    // 藍底要下在 <td bgcolor> 才可靠；圓角同時給屬性與 style。
    const btn = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (btn) {
      flush();
      out.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto;"><tr><td align="center" bgcolor="#2563eb" style="background-color:#2563eb;border-radius:999px;"><a href="${esc(btn[2])}" style="display:inline-block;padding:14px 40px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">${inline(btn[1])}</a></td></tr></table>`);
      continue;
    }
    flush();
    out.push("<p>" + inline(line) + "</p>");
  }
  flush();
  return out.join("");
}

// 品牌化 email 外框：頂部藍色條＋Logo，白卡片內容，底部品牌列。footer 句由呼叫端帶入。
// Logo 用絕對網址（email 不吃外部 CSS/data URI 圖，須 hosted PNG）。
function wrap({ subject, bodyMd, siteUrl, footer }) {
  const subj = esc(subject);
  const body = mdToHtml(bodyMd);
  const site = siteUrl || "https://inrecordmusic.com";
  // 內文元素排版走 <style>（Gmail/Apple Mail 支援）；按鈕與外框關鍵樣式另有 inline 保底。
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  .nl-body p { margin:0 0 14px; }
  .nl-body h2 { font-size:15px; font-weight:800; color:#2563eb; margin:26px 0 10px; padding-left:11px; border-left:3px solid #2563eb; letter-spacing:.01em; }
  .nl-body ul { margin:6px 0 16px; padding-left:0; list-style:none; }
  .nl-body li { position:relative; padding:2px 0 2px 20px; margin:0 0 6px; }
  .nl-body li:before { content:"›"; position:absolute; left:4px; top:1px; color:#2563eb; font-weight:700; }
  .nl-body a { color:#2563eb; }
  .nl-body hr { border:0; border-top:1px solid #eef2f6; margin:26px 0; }
  .nl-body strong { color:#0f172a; }
</style></head>
<body style="margin:0;background:#eef2f7;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 20px;">
    <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.08);">
      <div style="height:5px;background:#2563eb;"></div>
      <div style="text-align:center;padding:30px 32px 4px;">
        <a href="${site}" style="text-decoration:none;"><img src="${site}/logo-wordmark.png" alt="InRecord" width="148" style="width:148px;max-width:58%;height:auto;border:0;display:inline-block;" /></a>
      </div>
      <div style="padding:16px 36px 40px;">
        <h1 style="font-size:21px;line-height:1.45;color:#0f172a;margin:0 0 22px;font-weight:800;letter-spacing:-.01em;">${subj}</h1>
        <div class="nl-body" style="color:#3a4657;font-size:15px;line-height:1.85;">${body}</div>
        <p style="color:#a6b0bd;font-size:12px;line-height:1.7;margin:32px 0 0;border-top:1px solid #f1f5f9;padding-top:18px;">${footer}</p>
      </div>
    </div>
    <p style="color:#a6b0bd;font-size:12px;text-align:center;margin:20px 0 0;">InRecord・音樂刻 · <a href="${site}" style="color:#94a3b8;">inrecordmusic.com</a></p>
  </div>
</body></html>`;
}

// 電子報群發：信末附退訂句。
export function renderNewsletterHtml({ subject, bodyMd, siteUrl }) {
  return wrap({ subject, bodyMd, siteUrl,
    footer: "你收到這封信，是因為你是 InRecord 的學員／註冊會員。<br>不想再收到請直接回信告知，我們會將你移除。" });
}

// 後台「單封自訂信」（追單/客服）：footer 改中性句，不寫「你是學員」退訂句。
export function renderAdminEmailHtml({ subject, bodyMd, siteUrl }) {
  return wrap({ subject, bodyMd, siteUrl, footer: "如有任何問題，直接回覆此信與我們聯絡。" });
}

// 正規化 + 去重 + 濾掉空/無 @ 的 email。
export function dedupeEmails(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const e = String(raw ?? "").trim().toLowerCase();
    if (!e || !e.includes("@") || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

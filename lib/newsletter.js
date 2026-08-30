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
    const btn = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (btn) {
      flush();
      out.push(`<p style="text-align:center;margin:24px 0;"><a href="${esc(btn[2])}" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:999px;text-decoration:none;">${inline(btn[1])}</a></p>`);
      continue;
    }
    flush();
    out.push("<p>" + inline(line) + "</p>");
  }
  flush();
  return out.join("");
}

// 把標題＋內文包進品牌化 email 外框，信末附退訂句。
export function renderNewsletterHtml({ subject, bodyMd, siteUrl }) {
  const subj = esc(subject);
  const body = mdToHtml(bodyMd);
  const site = siteUrl || "https://inrecordmusic.com";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:20px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,.08);">
      <h1 style="font-size:22px;color:#0f172a;margin:0 0 20px;letter-spacing:-.01em;">${subj}</h1>
      <div style="color:#334155;font-size:15px;line-height:1.8;">${body}</div>
      <p style="color:#94a3b8;font-size:12px;line-height:1.7;margin:28px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">
        你收到這封信，是因為你是 InRecord 的學員／註冊會員。<br>不想再收到請直接回信告知，我們會將你移除。
      </p>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:18px 0 0;">InRecord · <a href="${site}" style="color:#94a3b8;">${site}</a></p>
  </div>
</body></html>`;
}

// 後台「單封自訂信」用的品牌外框：與電子報同框，但footer 改中性句（追單/客服信不該寫「你是學員」退訂句）。
export function renderAdminEmailHtml({ subject, bodyMd, siteUrl }) {
  const subj = esc(subject);
  const body = mdToHtml(bodyMd);
  const site = siteUrl || "https://inrecordmusic.com";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:20px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,.08);">
      <h1 style="font-size:22px;color:#0f172a;margin:0 0 20px;letter-spacing:-.01em;">${subj}</h1>
      <div style="color:#334155;font-size:15px;line-height:1.8;">${body}</div>
      <p style="color:#94a3b8;font-size:12px;line-height:1.7;margin:28px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">
        如有任何問題，直接回覆此信與我們聯絡。
      </p>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:18px 0 0;">InRecord · <a href="${site}" style="color:#94a3b8;">${site}</a></p>
  </div>
</body></html>`;
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

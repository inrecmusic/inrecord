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
// 連結 URL 先抽成佔位符再套粗體／斜體，最後放回：否則 URL 內的 * （或兩個連結 URL 之間的 *）
// 會被當成強調標記，把 href 切壞（實寄壞、後台 React 預覽是另一套程式所以看不出來）。
function inline(s) {
  const urls = [];
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, text, url) => { urls.push(url); return `[${text}](\u0000${urls.length - 1}\u0000)`; })
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a;">$1</strong>')
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(\u0000(\d+)\u0000\)/g, (_, text, i) => `<a href="${urls[i]}" style="color:#2563eb;">${text}</a>`);
}

// 各元素的 inline 樣式：email 必須全 inline（Gmail 會丟掉 <style> 與 :before 等偽元素）。
const S = {
  h1: 'font-size:19px;font-weight:800;color:#0f172a;margin:24px 0 12px;letter-spacing:-.01em;',
  h2: 'font-size:16px;font-weight:800;color:#2563eb;margin:26px 0 10px;padding-left:11px;border-left:3px solid #2563eb;line-height:1.4;',
  h3: 'font-size:15px;font-weight:800;color:#1e293b;margin:18px 0 8px;',
  p:  'margin:0 0 14px;',
  // 清單用 <div> 而非 <ul>/<li>：Gmail 不吃 <ul> 的 list-style:none，會冒出雙重圓點。
  ul: 'margin:8px 0 18px;',
  // 懸掛縮排＋真的 › 字元 span（Gmail 不吃 ::before）
  li: 'margin:0 0 9px;padding-left:20px;text-indent:-20px;',
  mark: 'color:#2563eb;font-weight:800;display:inline-block;width:20px;text-indent:0;',
  hr: 'border:0;border-top:1px solid #eef2f6;margin:26px 0;',
  // 表格（法律頁退費級距等）：email 端 border-collapse 需 inline，欄框線下在 th/td
  table: 'width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0 16px;',
  th: 'text-align:left;padding:8px 12px;border:1px solid #e2e8f0;font-weight:800;color:#0f172a;',
  td: 'padding:8px 12px;border:1px solid #e2e8f0;',
};

// 時間軸卡片：一列「徽章 | 標題 | 次文字或 dim」。dim = 灰階（尚未開放）。
// 用於「早鳥搶先看」那種日期圓圈清單；徽章 4 字以上自動縮字級塞進圓圈。
function parseTimelineRow(line) {
  const parts = String(line).split("|").map((s) => s.trim());
  let sub = "", dim = false;
  for (const extra of parts.slice(2)) {
    if (extra.toLowerCase() === "dim") dim = true;
    else if (extra) sub = extra;
  }
  return { badge: parts[0] || "", title: parts[1] || "", sub, dim };
}
function timelineHtml(rows) {
  const step = (r) => {
    const bg = r.dim ? "#cbd5e1" : "#2563eb";
    const titleColor = r.dim ? "#94a3b8" : "#0f172a";
    const fs = r.badge.length >= 4 ? 11 : 12;
    const sub = r.sub ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${inline(r.sub)}</div>` : "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 13px;"><tr>`
      + `<td width="46" valign="top" style="width:46px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="${bg}" style="width:40px;height:40px;background-color:${bg};border-radius:20px;color:#ffffff;font-size:${fs}px;font-weight:800;line-height:40px;">${esc(r.badge)}</td></tr></table></td>`
      + `<td valign="middle" style="padding-left:13px;"><div style="font-size:15px;font-weight:800;color:${titleColor};">${inline(r.title)}</div>${sub}</td>`
      + `</tr></table>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eff4ff" style="background-color:#eff4ff;border-radius:16px;margin:6px 0 22px;"><tr><td style="padding:20px 18px 8px;">`
    + rows.map(step).join("")
    + `</td></tr></table>`;
}

// 受限 Markdown：# ## ### 標題、**粗** *斜*、[文字](網址)連結/按鈕、![alt](圖url)、- 清單、--- 分隔線、
// :::timeline …::: 時間軸卡片。文字一律跳脫。全部樣式 inline（不靠 <style>，才能在 Gmail 一致呈現）。
// plain=true：不輸出 inline style，交給呼叫端的 CSS（網頁用；email 端 Gmail 會丟 <style>，
// 故預設仍全 inline）。清單在 plain 模式改用真的 <ul>/<li>，語意正確也讓 CSS 好接。
export function mdToHtml(md, { plain = false } = {}) {
  const st = (k) => (plain ? "" : ` style="${S[k]}"`);
  const lines = String(md ?? "").split(/\r?\n/);
  const out = [];
  let list = [];
  let tbl = [];  // 收集連續的 | 表格列
  let tl = null; // 收集 :::timeline 區塊列；非 null 代表正在區塊內
  // 管線表格：每列 | a | b |，第二列若為分隔列（---）則首列為表頭。
  // 只認「整行以 | 開頭」，故 :::timeline 內用 | 分隔的列不受影響。
  const flushTable = () => {
    if (!tbl.length) return;
    const rows = tbl.map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    tbl = [];
    const isSep = (r) => r.every((c) => /^:?-{2,}:?$/.test(c));
    const head = rows.length >= 2 && isSep(rows[1]) ? rows[0] : null;
    const body = head ? rows.slice(2) : rows.filter((r) => !isSep(r));
    const thead = head
      ? `<thead><tr${plain ? "" : ' bgcolor="#f8fafc" style="background-color:#f8fafc;"'}>${head.map((c) => `<th${st("th")}>${inline(c)}</th>`).join("")}</tr></thead>`
      : "";
    const tbody = `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td${st("td")}>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${st("table")}>${thead}${tbody}</table>`);
  };
  const flush = () => {
    if (list.length) {
      out.push(plain
        ? "<ul>" + list.map((li) => `<li>${inline(li)}</li>`).join("") + "</ul>"
        : `<div style="${S.ul}">` + list.map((li) =>
          `<div style="${S.li}"><span style="${S.mark}">›</span>${inline(li)}</div>`).join("") + "</div>");
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!tl && line.startsWith("|")) { flush(); tbl.push(line); continue; }
    flushTable();
    // 時間軸區塊：:::timeline 起、::: 收；區塊內每行為一列（空行略過）。
    if (tl) {
      if (line === ":::") { out.push(timelineHtml(tl)); tl = null; }
      else if (line !== "") tl.push(parseTimelineRow(line));
      continue;
    }
    if (line === ":::timeline") { flush(); tl = []; continue; }
    if (line === "") { flush(); continue; }
    if (line === "---") { flush(); out.push(`<hr${st("hr")}>`); continue; }
    // 整行只有一張圖 ![alt](url) → 置中圖片（只認 http(s)，寬度自適應）。可選 |數字 指定顯示寬 px。
    const img = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s|]+)(?:\|(\d{1,4}))?\)$/);
    if (img) {
      flush();
      const w = img[3] ? Math.min(560, Number(img[3])) : 160;
      out.push(`<p style="text-align:center;margin:8px 0 18px;"><img src="${esc(img[2])}" alt="${esc(img[1])}" width="${w}" style="width:${w}px;max-width:80%;height:auto;border:0;display:inline-block;" /></p>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flush(); const lvl = h[1].length; out.push(`<h${lvl}${st("h" + lvl)}>${inline(h[2])}</h${lvl}>`); continue; }
    const li = line.match(/^-\s+(.*)$/);
    if (li) { list.push(li[1]); continue; }
    // 整行只有一個連結 → 置中按鈕（CTA）。有其他文字則走一般段落（行內連結）。
    // 用 table + bgcolor 做「防彈按鈕」：<a> 上的 background 在 Gmail/Outlook 會被吃掉，
    // 藍底要下在 <td bgcolor> 才可靠；圓角同時給屬性與 style。
    const btn = plain ? null : line.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (btn) {
      flush();
      out.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto;"><tr><td align="center" bgcolor="#2563eb" style="background-color:#2563eb;border-radius:999px;"><a href="${esc(btn[2])}" style="display:inline-block;padding:14px 40px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">${inline(btn[1])}</a></td></tr></table>`);
      continue;
    }
    flush();
    out.push(`<p${st("p")}>` + inline(line) + "</p>");
  }
  if (tl) out.push(timelineHtml(tl)); // 未收尾的區塊也輸出
  flushTable();
  flush();
  return out.join("");
}

// 抽出開頭的 @badge / @subtitle 指令（頁首膠囊徽章＋副標），其餘為內文。
// 只認「開頭連續」的指令行（夾雜空行可），碰到第一個一般行即停 → 既有電子報無此行、完全不受影響。
function extractHero(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  let badge = "", subtitle = "", i = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    const b = t.match(/^@badge\s+(.+)$/);
    const s = t.match(/^@subtitle\s+(.+)$/);
    if (b) { badge = b[1].trim(); continue; }
    if (s) { subtitle = s[1].trim(); continue; }
    if (t === "") continue;
    break;
  }
  return { badge, subtitle, body: lines.slice(i).join("\n") };
}

// 品牌化 email 外框：頂部藍色條＋Logo，白卡片內容，底部品牌列。footer 句由呼叫端帶入。
// Logo 用絕對網址（email 不吃外部 CSS/data URI 圖，須 hosted PNG）。
function wrap({ subject, bodyMd, siteUrl, footer }) {
  const subj = esc(subject);
  const { badge, subtitle, body: heroBody } = extractHero(bodyMd);
  const body = mdToHtml(heroBody);
  const site = siteUrl || "https://inrecordmusic.com";
  // 選配頁首膠囊徽章（自帶下方間距）＋副標；無指令時兩者皆空字串 → 頁首與原本一致。
  const badgeHtml = badge
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td bgcolor="#2563eb" style="background-color:#2563eb;border-radius:999px;padding:5px 15px;color:#ffffff;font-size:12px;font-weight:800;letter-spacing:.06em;">${esc(badge)}</td></tr></table><div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>`
    : "";
  const subtitleHtml = subtitle
    ? `<p style="margin:12px 0 0;color:#aab6c8;font-size:14px;line-height:1.7;">${esc(subtitle)}</p>`
    : "";
  // 品牌深色頁首（白字 Logo＋標題反白）＋白色內文。全 table 佈局＋全 inline 樣式，
  // Gmail/Apple Mail/Outlook 一致（Gmail 會丟掉 <style>，故不使用）。
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f7;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.10);">
        <!-- 深色頁首 -->
        <tr><td align="center" bgcolor="#0f172a" style="background-color:#0f172a;padding:38px 40px 34px;">
          <a href="${site}" style="text-decoration:none;"><img src="${site}/logo-wordmark-white.png" alt="InRecord" width="150" style="width:150px;max-width:56%;height:auto;border:0;display:inline-block;" /></a>
          <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>
          ${badgeHtml}<h1 style="margin:0;color:#ffffff;font-size:23px;line-height:1.5;font-weight:800;letter-spacing:-.01em;">${subj}</h1>
          ${subtitleHtml}
        </td></tr>
        <!-- 白色內文 -->
        <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:34px 36px 38px;color:#3a4657;font-size:15px;line-height:1.85;">
          ${body}
          <p style="color:#a6b0bd;font-size:12px;line-height:1.7;margin:32px 0 0;border-top:1px solid #f1f5f9;padding-top:18px;">${footer}</p>
        </td></tr>
      </table>
      <!-- 品牌簽名檔（卡片下方；連結刻意用低調灰，不與內文 CTA 搶視覺） -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 0;">
        <tr><td align="center" style="color:#8a94a3;font-size:12.5px;line-height:2.1;font-family:inherit;">
          <span style="font-weight:800;color:#64748b;">InRecord 音樂刻</span><span style="color:#c3cad4;">｜</span>玩轉音樂的每一課<br>
          官網<span style="color:#c3cad4;">｜</span><a href="${site}" style="color:#64748b;text-decoration:underline;text-underline-offset:2px;">inrecordmusic.com</a>
          <span style="color:#c3cad4;">　·　</span>Email<span style="color:#c3cad4;">｜</span><a href="mailto:support@inrecordmusic.com" style="color:#64748b;text-decoration:underline;text-underline-offset:2px;">support@inrecordmusic.com</a><br>
          Instagram<span style="color:#c3cad4;">｜</span><a href="https://www.instagram.com/inrecord.music" style="color:#64748b;text-decoration:underline;text-underline-offset:2px;">@inrecord.music</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// 電子報群發：信末附退訂。有 unsubscribeUrl（每位收件人專屬簽章連結；Brevo 範本則放 {{ params.unsubscribe_url }}）
// 就出「取消訂閱」按鈕；沒有則退回舊的「回信告知」句。
export function renderNewsletterHtml({ subject, bodyMd, siteUrl, unsubscribeUrl }) {
  const base = "你收到這封信，是因為你是 InRecord 的學員／註冊會員。";
  const footer = unsubscribeUrl
    ? `${base}<br>不想再收到課程消息，點下方按鈕即可取消訂閱（登入驗證碼、購課與開通通知不受影響）。<br><a href="${esc(unsubscribeUrl)}" style="display:inline-block;margin-top:12px;padding:8px 18px;border:1px solid #cbd5e1;border-radius:999px;color:#64748b;font-size:12px;font-weight:700;text-decoration:none;">取消訂閱</a>`
    : `${base}<br>不想再收到請直接回信告知，我們會將你移除。`;
  return wrap({ subject, bodyMd, siteUrl, footer });
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

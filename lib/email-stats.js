// lib/email-stats.js — 電子報「寄送成效」：把 email_log 分組成一次群發，再對進 Brevo 事件（純函式，可測）。
//
// 為什麼要這樣繞：電子報是用 Brevo 交易信 API 逐封寄（見 lib/brevo-email.js 的 sendNewsletterEmail），
// 不是 Campaign，所以 Brevo 的「行銷活動」報表永遠是空的，只能查交易信事件。
// 而事件端點回傳的欄位裡**沒有主旨**，無法用主旨篩 → 只能靠「收件人 ＋ 寄送時間（＋ tag）」反推。
//
// ⚠️ 這裡最容易寫錯、而且錯了不會報錯的地方是「事件歸屬」：
// 若只用「事件時間 ≥ 寄送時間」當條件、每一組各自去掃全部事件，那麼同一份名單只要寄過第二封，
// 第二封的開信／點擊／退訂會**同時**滿足第一封的條件 → 愈舊的群發吸收愈多，開信率被無聲灌到 100%。
// 正解是先替每位收件人建一條寄送時間軸，每個事件只歸給「該收件人在此事件之前、最近一次收到的信」。
// 時間軸必須涵蓋**所有**寄信類型（購買確認、開課通知、發票…），否則那些信的開信會被算到電子報頭上。

const TW_OFFSET_MS = 8 * 3600 * 1000; // 台灣固定 UTC+8、無夏令時間

// email_log.created_at 是 UTC。直接切 ISO 前十碼會把台灣 00:00–08:00 的寄送算到前一天，
// 同一次群發就會被切成兩組。換算方式同 lib/ad-report.js：先加 8 小時再取 UTC 日期欄位。
export function twDay(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t + TW_OFFSET_MS).toISOString().slice(0, 10) : "";
}

// sendNewsletterEmail 會帶 tags:[kind]，但只有「該版本上線之後」寄的信才有。
// ⚠️ 不要用日期常數判斷有沒有 tag —— 寫程式的日期 ≠ 部署日期，寫死會讓部署前寄的信被誤判成
// 「應該要有 tag」，於是所有沒帶 tag 的事件全被丟掉，整列變成 0。
// 改成看事件本身：這組實際收到的事件裡只要出現過自己的 tag，就用精準模式，否則用推算模式。
export const TAG_SINCE_TW_DAY = null; // 保留匯出避免外部引用炸掉；已不再用於判斷

// 保留給舊呼叫端；語意改為「無從得知」，實際判斷交給 summarizeGroup 自動偵測。
export function hasTag() {
  return false;
}

// Brevo 的 requests/delivered 事件時間可能「早於」email_log 的寫入瞬間（先呼叫 API 成功、才寫紀錄），
// 歸屬時給一點寬容，免得把開頭幾封的送達事件切到前一封信去。
const GRACE_MS = 10 * 60 * 1000;
// 超過這段時間才發生的事件不再歸給這封信：收件人之後沒再收到任何信時，
// 沒有上界會讓一年後的開信仍記在這封頭上。
const MAX_AGE_MS = 14 * 86_400_000;

const OPEN_EVENTS = new Set(["opened", "uniqueOpened"]);
const BOUNCE_EVENTS = new Set(["hardBounces", "softBounces"]);

// Brevo 事件的 tag 欄位官方是字串，保險起見也接受陣列。
function eventTags(ev) {
  const raw = ev?.tag ?? ev?.tags;
  return (Array.isArray(raw) ? raw : [raw]).map((t) => String(t ?? "").trim()).filter(Boolean);
}

const norm = (e) => String(e ?? "").trim().toLowerCase();

// 一次群發的識別鍵：同一天（台灣）＋ 同一類型 ＋ 同一主旨。
// kind 必須進鍵——同日同主旨但不同類型若併成一組，tag 過濾會誤殺另一半的事件。
export function sendKey(row) {
  return `${twDay(row?.created_at)}|${row?.kind || ""}|${String(row?.subject || "").trim() || "（無主旨）"}`;
}

// 把 email_log 列分組成「一次群發」。新到舊排序。
// failedCount 含 failed 與 skipped —— 兩者都沒真的寄出去，不該算進寄出數。
export function groupSends(rows = []) {
  const byKey = new Map();
  for (const r of rows) {
    const at = Date.parse(r?.created_at || "");
    if (!Number.isFinite(at)) continue;
    const key = sendKey(r);
    let g = byKey.get(key);
    if (!g) {
      g = {
        key, subject: String(r.subject || "").trim() || "（無主旨）", kind: r.kind || null,
        dateTW: twDay(r.created_at), sentCount: 0, failedCount: 0,
        recipients: new Set(), startedAt: at, endedAt: at,
      };
      byKey.set(key, g);
    }
    if (r.status === "sent") {
      g.sentCount += 1;
      const em = norm(r.to_email);
      if (em) g.recipients.add(em);
    } else {
      g.failedCount += 1;
    }
    if (at < g.startedAt) g.startedAt = at;
    if (at > g.endedAt) g.endedAt = at;
  }
  return [...byKey.values()].sort((a, b) => b.startedAt - a.startedAt);
}

// 每位收件人的寄送時間軸（由新到舊排序，方便歸屬時取第一個符合的）。
// 傳進來的 rows 應涵蓋**所有**寄信類型，不能只有要顯示的那幾種。
export function buildSendIndex(rows = []) {
  const idx = new Map();
  for (const r of rows) {
    if (r?.status !== "sent") continue; // 沒寄出去的不可能有事件
    const em = norm(r.to_email);
    const at = Date.parse(r?.created_at || "");
    if (!em || !Number.isFinite(at)) continue;
    const list = idx.get(em) || [];
    list.push({ at, key: sendKey(r), kind: r.kind || null });
    idx.set(em, list);
  }
  for (const list of idx.values()) list.sort((a, b) => b.at - a.at);
  return idx;
}

// 把每個 Brevo 事件歸給「該收件人在此事件之前、最近一次收到的信」。一個事件只會落進一組。
// 回傳 Map<sendKey, events[]>；歸不到任何一封（收件人不在名單／太久以前／超出上界）就丟棄。
export function attributeEvents(index, events = []) {
  const out = new Map();
  const stats = { total: 0, attributed: 0, noRecipient: 0, noSend: 0, tooOld: 0 };
  for (const ev of events) {
    stats.total += 1;
    const em = norm(ev?.email);
    const at = Date.parse(ev?.date || "");
    if (!em || !Number.isFinite(at)) continue;
    const list = index.get(em); // 由新到舊
    if (!list) { stats.noRecipient += 1; continue; }
    // 先找「確實在事件之前」的最近一次寄送。
    // ⚠️ 不能直接拿 GRACE_MS 去比，否則「事件之後 10 分鐘內才寄出的下一封信」會把這封的事件搶走
    //（逐封群發時，同一個人在幾分鐘內收到第二封是常態）。寬容只作為找不到時的退路。
    let hit = list.find((sd) => sd.at <= at);
    if (!hit) hit = list.find((sd) => at >= sd.at - GRACE_MS); // 時鐘/寫紀錄落差：事件略早於 log
    if (!hit) { stats.noSend += 1; continue; }
    if (at - hit.at > MAX_AGE_MS) { stats.tooOld += 1; continue; }
    const arr = out.get(hit.key) || [];
    arr.push(ev);
    out.set(hit.key, arr);
    stats.attributed += 1;
  }
  out.diagnostics = stats; // 診斷用：面板顯示「抓到幾筆事件、對到幾筆」，好分辨「查不到」與「對錯組」
  return out;
}

// 彙整某一組已歸屬的事件。所有數字都是「去重人數」（一組裡每人只收一封，人數＝封數）。
//
// requireTag：事件必須帶對的 tag 才採計。省略時自動偵測——這組的事件裡只要出現過自己的 tag，
// 就代表這批信是帶 tag 寄出的，於是轉成精準模式（沒帶 tag 的事件就不是這封）；
// 完全沒看到 tag 就維持推算模式。回傳的 precise 會告訴 UI 這組到底是哪一種。
//
// ⚠️ 開信率的誠實性：開信追蹤靠收件人載入一張追蹤圖片。Apple Mail 的隱私保護會「自動」載入而灌高數字，
// Gmail 圖片不載入又會壓低 → 開信率只能當趨勢看。Brevo 把前者另記成 loadedByProxy，
// 故這裡拆成 proxyOpened 單獨一欄，不混進 opened（比較接近真人開信）。
export function summarizeGroup(group, events = [], { requireTag } = {}) {
  const recipients = group?.recipients instanceof Set
    ? group.recipients
    : new Set((group?.recipients || []).map(norm));
  const kind = group?.kind || null;
  // 自動偵測：這組事件裡只要看過自己的 tag，就代表這批是帶 tag 寄的 → 轉精準模式
  const strict = requireTag ?? (!!kind && events.some((ev) => eventTags(ev).includes(kind)));

  const s = { delivered: new Set(), opened: new Set(), proxy: new Set(), clicked: new Set(), bounced: new Set(), unsub: new Set() };
  for (const ev of events) {
    const em = norm(ev?.email);
    if (!em || !recipients.has(em)) continue;
    const tags = eventTags(ev);
    if (kind) {
      if (strict && !tags.includes(kind)) continue;       // 精準模式：沒帶對 tag 就不是這封
      if (!strict && tags.length && !tags.includes(kind)) continue; // 推算模式：帶了別人的 tag 才排除
    }
    const type = ev?.event;
    if (type === "delivered") s.delivered.add(em);
    else if (OPEN_EVENTS.has(type)) s.opened.add(em);
    else if (type === "loadedByProxy") s.proxy.add(em);
    else if (type === "clicks") s.clicked.add(em);
    else if (BOUNCE_EVENTS.has(type)) s.bounced.add(em);
    else if (type === "unsubscribed") s.unsub.add(em);
  }

  const delivered = s.delivered.size;
  const opened = [...s.opened].filter((em) => !s.proxy.has(em)).length; // 扣掉代理載入，剩下比較接近真人
  const openedAll = new Set([...s.opened, ...s.proxy]).size;
  // 分母是送達數（業界標準）；拿不到送達事件就回 null，由 UI 顯示「—」，不要假裝 0%
  const rate = (n) => (delivered ? Math.min(1, n / delivered) : null);
  return {
    precise: strict, // true＝靠 tag 精準比對；false＝以收件人＋時間推算，UI 要標註
    delivered,
    opened,
    proxyOpened: s.proxy.size,
    openedAll,
    clicked: s.clicked.size,
    bounced: s.bounced.size,
    unsubscribed: s.unsub.size,
    openRate: rate(opened),
    openRateAll: rate(openedAll),
    clickRate: rate(s.clicked.size),
  };
}

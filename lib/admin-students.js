// 後台「學員管理」名單合併（純函式，便於測試）。
//
// 學員管理要呈現的是「實際學員」＝有課程存取權（enrollments）的人，加上尚未購課的
// 「體驗名單」（course_preview_leads，demo 留信箱的潛在客戶）。兩者以 email（小寫）去重：
//   - 有 enrollment → 已購課（purchased），電話/方案/來源取自其最近一筆已付款 order。
//   - 只有體驗名單 → 潛在客戶，狀態沿用 lead.status。
//
// 注意：concert / WordPress 現場購買者只進 orders + enrollments，「不會」寫入
// course_preview_leads，所以舊版只讀 leads 的學員管理永遠看不到他們——這支函式補上這個缺口。

const norm = (e) => (e || "").trim().toLowerCase();

export function mergeStudents({ enrollments = [], orders = [], leads = [], profiles = [] } = {}) {
  // email → 最近一筆已付款訂單（取聯絡電話 / 方案 / 來源 / 時間）
  const orderByEmail = new Map();
  // email → 最早一筆已付款訂單時間（早鳥搶先看的自動判斷原料）
  const firstPaidByEmail = new Map();
  for (const o of orders) {
    const k = norm(o.email);
    if (!k) continue;
    const prev = orderByEmail.get(k);
    if (!prev || new Date(o.created_at || 0) > new Date(prev.created_at || 0)) orderByEmail.set(k, o);
    const first = firstPaidByEmail.get(k);
    if (!first || new Date(o.created_at || 0) < new Date(first)) firstPaidByEmail.set(k, o.created_at);
  }

  // email → 最早一筆 enrollment（入學時間）
  const enrByEmail = new Map();
  for (const e of enrollments) {
    const k = norm(e.email);
    if (!k) continue;
    const prev = enrByEmail.get(k);
    if (!prev || new Date(e.enrolled_at || 0) < new Date(prev.enrolled_at || 0)) enrByEmail.set(k, e);
  }

  // email → 最新一筆體驗名單（leads 已依 created_at desc 傳入，取第一筆）
  const leadByEmail = new Map();
  for (const l of leads) {
    const k = norm(l.email);
    if (!k) continue;
    if (!leadByEmail.has(k)) leadByEmail.set(k, l);
  }

  // email → 學員資料頁填寫的 profile（student_profiles，一人一列）
  const profileByEmail = new Map();
  for (const p of profiles) {
    const k = norm(p.email);
    if (!k) continue;
    profileByEmail.set(k, p);
  }

  // 學員名單 = 有開通(enrollments) ∪ 已付款訂單(orders, paid) ∪ 體驗名單(leads)。
  // 已付款但尚未開通者（演奏會預購、開課前）也要算學員（已購課、未開通）。
  const emails = new Set([...enrByEmail.keys(), ...orderByEmail.keys(), ...leadByEmail.keys()]);
  const out = [];
  for (const k of emails) {
    const enr = enrByEmail.get(k);
    const ord = orderByEmail.get(k);
    const lead = leadByEmail.get(k);
    const profile = profileByEmail.get(k);
    const enrolled = !!enr;
    const hasPaidOrder = !!ord;
    out.push({
      // 有體驗名單 → 用其 id（讓後台「標記」可 PATCH /api/admin/leads）；
      // 純學員（無 lead）→ 用 enr: 前綴的合成 id，僅作 React key，不可 PATCH。
      id: lead?.id || `enr:${k}`,
      email: ord?.email || lead?.email || enr?.email || k,
      phone: ord?.phone || null,
      plan: ord?.plan || null,
      plan_label: ord?.plan_label || null,
      source: ord?.source || lead?.source || null,
      enrolled,
      isLead: !!lead,
      // 已付款 = 已購課（即使尚未開通）；enrolled 另存供區分「未開通」
      purchased: enrolled || hasPaidOrder || lead?.status === "purchased",
      status: (enrolled || hasPaidOrder) ? "purchased" : (lead?.status || "requested"),
      created_at: enr?.enrolled_at || ord?.created_at || lead?.created_at || null,
      // 學員資料頁（student_profiles）填寫狀態，供後台名單顯示程度與「已填」篩選
      hasProfile: !!profile,
      profileName: profile?.real_name || null,
      level: profile?.level || null,
      // 早鳥搶先看：後台覆寫值與自動判斷原料（最早付款時間／開通時間），tier 由前端算
      early_override: enr?.early_override || null,
      first_paid_at: firstPaidByEmail.get(k) || null,
      enrolled_at: enr?.enrolled_at || null,
    });
  }

  // 最新在前
  out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return out;
}

// 後台「課程管理」的已購人數：確實付款的人頭數（不是訂單筆數）。
// 只認 orders.status='paid'（pending/notified/refunded/failed 都不算），email 去重、忽略大小寫；
// 現場成交的手動開通單（source='manual'、amount 0）同樣是真實買家，一併計入。
export function countPaidBuyers(orders = []) {
  const emails = new Set();
  for (const o of orders) {
    if (o?.status !== "paid") continue;
    const k = norm(o.email);
    if (k) emails.add(k);
  }
  return emails.size;
}

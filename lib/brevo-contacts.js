// lib/brevo-contacts.js — Brevo「官網潛客」聯絡人清單（BREVO_LIST_ID）：加入／列出／移除。
// 首頁留信箱寫入、後台電子報「潛客名單」讀取、退訂時同步移除。fetchImpl 可注入方便測試。
const API = "https://api.brevo.com/v3";

function config() {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  return apiKey && Number.isInteger(listId) && listId > 0 ? { apiKey, listId } : null;
}
const headers = (apiKey) => ({ "Content-Type": "application/json", accept: "application/json", "api-key": apiKey });

// 加入清單。已存在則更新（updateEnabled）→ 201／204 皆成功。
// 屬性（SOURCE／CONSENT_AT／UTM_*）在 Brevo 帳號不存在時會被 400 拒絕；此時去掉屬性重試一次，人一定要收得到。
export async function addLeadContact({ email, attributes }, { fetchImpl = fetch } = {}) {
  const c = config();
  if (!c) return { ok: false, error: "missing_brevo_config" };
  const post = (attrs) => fetchImpl(`${API}/contacts`, {
    method: "POST", headers: headers(c.apiKey),
    body: JSON.stringify({ email, listIds: [c.listId], updateEnabled: true, ...(attrs ? { attributes: attrs } : {}) }),
  });
  try {
    let res = await post(attributes);
    if (!res.ok && res.status === 400 && attributes) {
      const detail = await res.text().catch(() => "");
      if (/attribute/i.test(detail)) res = await post(undefined);
      else return { ok: false, error: "brevo_400", detail: detail.slice(0, 200) };
    }
    if (res.ok) return { ok: true };
    return { ok: false, error: `brevo_${res.status}`, detail: (await res.text().catch(() => "")).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e?.message || "fetch_failed" };
  }
}

// 讀出清單全部 email（分頁），跳過 Brevo 端已黑名單者。失敗直接丟錯：群發不可拿半份名單寄。
export async function listLeadEmails({ fetchImpl = fetch, pageSize = 500 } = {}) {
  const c = config();
  if (!c) throw new Error("missing_brevo_config");
  const emails = [];
  for (let offset = 0, page = 0; page < 200; offset += pageSize, page++) {
    const res = await fetchImpl(`${API}/contacts/lists/${c.listId}/contacts?limit=${pageSize}&offset=${offset}`, { headers: headers(c.apiKey), cache: "no-store" });
    if (!res.ok) throw new Error(`brevo_${res.status}`);
    const d = await res.json().catch(() => ({}));
    const contacts = d.contacts || [];
    for (const ct of contacts) if (ct.email && !ct.emailBlacklisted) emails.push(ct.email);
    if (contacts.length < pageSize) break;
  }
  return emails;
}

// 從清單移除（退訂用）。純 best-effort：失敗只回 ok:false，呼叫端不得因此讓退訂失敗。
export async function removeLeadContact(email, { fetchImpl = fetch } = {}) {
  const c = config();
  if (!c) return { ok: false, error: "missing_brevo_config" };
  try {
    const res = await fetchImpl(`${API}/contacts/lists/${c.listId}/contacts/remove`, {
      method: "POST", headers: headers(c.apiKey), body: JSON.stringify({ emails: [email] }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `brevo_${res.status}` };
  } catch (e) {
    return { ok: false, error: e?.message || "fetch_failed" };
  }
}

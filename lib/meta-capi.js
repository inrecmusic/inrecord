// lib/meta-capi.js — Meta Conversions API 伺服器端事件（Purchase／Lead）。純 builder + guarded send（永不拋）。
//
// 為什麼 Lead 也要從伺服器送：瀏覽器端的 fbq 會被追蹤保護、廣告攔截器、或送出後立刻換頁
// 給打斷，而 Meta 的廣告優化只認「它自己收到的事件」。伺服器送不受這些影響。
// 兩邊用同一個 event_id，Meta 會自動去重，不會變成兩筆。
import crypto from "crypto";
import { getTrackingSettings } from "./tracking.js";

const sha256 = (s) => crypto.createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");

// 純：組 CAPI event 物件
export function buildPurchaseEvent({ merTradeNo, amount, plan, email, capiData, attribution, eventTime }) {
  const cd = capiData || {};
  const user_data = {};
  if (email) user_data.em = [sha256(email)];
  if (cd.fbp) user_data.fbp = cd.fbp;
  // fbc fallback：Meta 格式 fb.1.<毫秒>.<fbclid>（event_time 是秒，此處需 *1000）；fbclid 限型別+長度（首次外送 Meta）
  const fbclid = attribution?.fbclid;
  const fbc = cd.fbc || (typeof fbclid === "string" && fbclid.length <= 512 ? `fb.1.${eventTime * 1000}.${fbclid}` : null);
  if (fbc) user_data.fbc = fbc;
  if (cd.ip) user_data.client_ip_address = cd.ip;
  if (cd.ua) user_data.client_user_agent = cd.ua;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  return {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: merTradeNo,
    action_source: "website",
    event_source_url: `${siteUrl}/success`,
    user_data,
    custom_data: { currency: "TWD", value: Number(amount) || 0, content_ids: [plan], content_type: "product" },
  };
}

// 純：組 Lead event 物件。eventId 要與瀏覽器端 fbq 的 eventID 相同，Meta 才會去重。
export function buildLeadEvent({ email, eventId, fbp, fbc, ip, ua, eventTime, sourceUrl }) {
  const user_data = {};
  if (email) user_data.em = [sha256(email)];
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;
  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const event = {
    event_name: "Lead",
    event_time: eventTime,
    action_source: "website",
    event_source_url: sourceUrl || `${siteUrl}/`,
    user_data,
    custom_data: { content_name: "trial" },
  };
  // 沒帶 eventId 就不填 event_id：Meta 對「缺 id」的處理是各自計數，
  // 填假值反而可能跟別人的事件撞在一起被誤刪。
  if (eventId) event.event_id = eventId;
  return event;
}

// guarded 送出：僅在 token 有設 且 Meta 已於追蹤碼分頁啟用時送。永不拋。
// 4s timeout 涵蓋「連線＋body 讀取」，Meta API 慢/掛也不拖累呼叫端
// （付款 notify 的確認信、留信箱的 API 回應）；超時→abort→catch 回 {ok:false}。
async function postEvent(event) {
  try {
    const token = process.env.META_CAPI_ACCESS_TOKEN;
    if (!token) return { skipped: "no_token" };
    const platforms = await getTrackingSettings();
    const pixelId = platforms?.meta?.id;
    if (!pixelId) return { skipped: "meta_disabled" };
    const ver = process.env.META_API_VERSION || "v25.0";
    const body = { data: [event], access_token: token };
    if (process.env.META_CAPI_TEST_CODE) body.test_event_code = process.env.META_CAPI_TEST_CODE;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`https://graph.facebook.com/${ver}/${pixelId}/events`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (json.error) return { ok: false, error: `capi_${json.error.code || "err"}` };
      if (!res.ok) return { ok: false, error: `capi_http_${res.status}` };
      return { ok: true, fbtrace_id: json.fbtrace_id };
    } finally { clearTimeout(timer); }
  } catch (e) {
    return { ok: false, error: e?.message || "capi_failed" };
  }
}

export async function sendPurchase({ merTradeNo, amount, plan, email, capiData, attribution }) {
  const eventTime = Math.floor(Date.now() / 1000);
  return postEvent(buildPurchaseEvent({ merTradeNo, amount, plan, email, capiData, attribution, eventTime }));
}

// 留信箱換試看：瀏覽器端 fbq 已送一次，這裡補一份伺服器端（同 event_id 去重）。
export async function sendLead({ email, eventId, fbp, fbc, ip, ua, sourceUrl }) {
  const eventTime = Math.floor(Date.now() / 1000);
  return postEvent(buildLeadEvent({ email, eventId, fbp, fbc, ip, ua, eventTime, sourceUrl }));
}

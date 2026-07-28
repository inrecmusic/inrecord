// lib/meta-capi.js — Meta Conversions API 伺服器端 Purchase。純 builder + guarded send（永不拋）。
import crypto from "crypto";
import { getTrackingSettings } from "./tracking.js";

const sha256 = (s) => crypto.createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");

// 純：組 CAPI event 物件
export function buildPurchaseEvent({ merTradeNo, amount, plan, email, capiData, attribution, eventTime }) {
  const cd = capiData || {};
  const user_data = {};
  if (email) user_data.em = [sha256(email)];
  if (cd.fbp) user_data.fbp = cd.fbp;
  const fbc = cd.fbc || (attribution?.fbclid ? `fb.1.${eventTime}.${attribution.fbclid}` : null);
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

// guarded：僅在 token 有設 且 Meta 已於追蹤碼分頁啟用時送。永不拋。
export async function sendPurchase({ merTradeNo, amount, plan, email, capiData, attribution }) {
  try {
    const token = process.env.META_CAPI_ACCESS_TOKEN;
    if (!token) return { skipped: "no_token" };
    const platforms = await getTrackingSettings();
    const pixelId = platforms?.meta?.id;
    if (!pixelId) return { skipped: "meta_disabled" };
    const ver = process.env.META_API_VERSION || "v25.0";
    const eventTime = Math.floor(Date.now() / 1000);
    const event = buildPurchaseEvent({ merTradeNo, amount, plan, email, capiData, attribution, eventTime });
    const body = { data: [event], access_token: token };
    if (process.env.META_CAPI_TEST_CODE) body.test_event_code = process.env.META_CAPI_TEST_CODE;
    // 付款 notify webhook 內：加 4s timeout，Meta API 慢/掛也不拖累確認信與 webhook 回應（超時→abort→外層 catch 回 {ok:false}）
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    let res;
    try {
      res = await fetch(`https://graph.facebook.com/${ver}/${pixelId}/events`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    const json = await res.json().catch(() => ({}));
    if (json.error) return { ok: false, error: `capi_${json.error.code || "err"}` };
    return { ok: true, fbtrace_id: json.fbtrace_id };
  } catch (e) {
    return { ok: false, error: e?.message || "capi_failed" };
  }
}

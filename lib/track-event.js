// lib/track-event.js — 前台事件分派（client）。Meta + GA4 通用事件；Google Ads/LINE 轉換另呼叫。
const GA4_MAP = { PageView: "page_view", ViewContent: "view_item", InitiateCheckout: "begin_checkout", Purchase: "purchase" };

function metaParams(name, p) {
  const out = {};
  if (p.value != null) out.value = p.value;
  if (p.currency) out.currency = p.currency;
  if (p.contentIds) out.content_ids = p.contentIds;
  if (p.contentName) out.content_name = p.contentName;
  if (name === "ViewContent" || name === "Purchase") out.content_type = "product";
  return out;
}

function ga4Params(name, p) {
  const out = {};
  if (p.currency) out.currency = p.currency;
  if (p.value != null) out.value = p.value;
  if (name === "Purchase" && p.transactionId) out.transaction_id = p.transactionId;
  if (p.contentIds || p.contentName) out.items = [{ item_id: p.contentIds?.[0], item_name: p.contentName }];
  return out;
}

export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") window.fbq("track", name, metaParams(name, params));
  if (typeof window.gtag === "function") window.gtag("event", GA4_MAP[name] || name, ga4Params(name, params));
}

export function trackGoogleAdsConversion({ sendTo, value, currency, transactionId } = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function" || !sendTo) return;
  window.gtag("event", "conversion", { send_to: sendTo, value, currency, transaction_id: transactionId });
}

export function trackLineConversion(tagId) {
  if (typeof window === "undefined" || typeof window._lt !== "function" || !tagId) return;
  window._lt("send", "cv", [tagId]);
}

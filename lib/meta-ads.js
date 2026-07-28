// lib/meta-ads.js — Meta Marketing API insights（guarded）。純轉換可測，網路呼叫真跑於部署後。
const PURCHASE_TYPES = new Set(["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);

function sumActions(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => s + (PURCHASE_TYPES.has(a?.action_type) ? Number(a.value) || 0 : 0), 0);
}

export function normalizeInsightRow(raw = {}) {
  return {
    campaign_id: String(raw.campaign_id || ""),
    campaign_name: raw.campaign_name || null,
    date: String(raw.date_start || "").slice(0, 10),
    spend: Number(raw.spend) || 0,
    impressions: Number(raw.impressions) || 0,
    clicks: Number(raw.clicks) || 0,
    reach: Number(raw.reach) || 0,
    frequency: Number(raw.frequency) || 0,
    meta_conversions: sumActions(raw.actions),
    meta_conversion_value: sumActions(raw.action_values),
  };
}

export function isConfigured() {
  return !!(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

export async function fetchInsights({ since, until } = {}) {
  if (!isConfigured()) throw new Error("not_configured");
  const ver = process.env.META_API_VERSION || "v25.0";
  const acct = process.env.META_AD_ACCOUNT_ID; // 形如 act_123 或 123
  const actId = acct.startsWith("act_") ? acct : "act_" + acct;
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values";
  const params = new URLSearchParams({
    level: "campaign", time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields, limit: "200", access_token: process.env.META_ADS_ACCESS_TOKEN,
  });
  let url = `https://graph.facebook.com/${ver}/${actId}/insights?${params.toString()}`;
  const rows = [];
  for (let page = 0; page < 50 && url; page++) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`meta_api_${json.error.code || "err"}: ${json.error.message || "unknown"}`);
    for (const r of json.data || []) rows.push(normalizeInsightRow(r));
    url = json.paging?.next || null;
  }
  return rows;
}

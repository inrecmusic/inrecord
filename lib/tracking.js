// lib/tracking.js — 追蹤碼設定：純函式（可測）+ server 讀取
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "./supabase.js";

const PLATFORMS = ["meta", "ga4", "google_ads", "line"];
const SAFE_ID = /^[\w.-]+$/; // 只允許英數 _ . - ，擋掉引號/反引號/角括號/空白等注入字元

// 儲存用 config -> 注入用「已啟用平台」（缺鍵/未啟用/無 id 一律 null）
export function enabledPlatforms(config = {}) {
  const c = config || {};
  const on = (p) => p && p.enabled === true && String(p.id || "").trim();
  return {
    meta: on(c.meta) ? { id: String(c.meta.id).trim() } : null,
    ga4: on(c.ga4) ? { id: String(c.ga4.id).trim() } : null,
    googleAds: on(c.google_ads)
      ? { id: String(c.google_ads.id).trim(), purchaseLabel: String(c.google_ads.purchase_label || "").trim() }
      : null,
    line: on(c.line) ? { id: String(c.line.id).trim() } : null,
  };
}

// 後臺 PATCH body -> normalize 後的 config；啟用卻無 id 視為錯誤
export function sanitizeTrackingConfig(body = {}) {
  const b = body || {};
  const out = {};
  for (const key of PLATFORMS) {
    const p = b[key] || {};
    const id = String(p.id || "").trim();
    const enabled = !!p.enabled;
    if (enabled && !id) return { ok: false, error: `${key}_id_required` };
    if (id && !SAFE_ID.test(id)) return { ok: false, error: `${key}_id_invalid` };
    if (key === "google_ads") {
      const label = String(p.purchase_label || "").trim();
      if (label && !SAFE_ID.test(label)) return { ok: false, error: "google_ads_label_invalid" };
      out[key] = { id, purchase_label: label, enabled };
    } else {
      out[key] = { id, enabled };
    }
  }
  return { ok: true, config: out };
}

export function metaSnippet(id) {
  if (!SAFE_ID.test(String(id))) return "";
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`;
}

export function googleConfigSnippet({ ga4Id, adsId } = {}) {
  const g = ga4Id && SAFE_ID.test(String(ga4Id)) ? ga4Id : "";
  const a = adsId && SAFE_ID.test(String(adsId)) ? adsId : "";
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${g ? `gtag('config','${g}');` : ""}${a ? `gtag('config','${a}');` : ""}`;
}

export function lineSnippet(id) {
  if (!SAFE_ID.test(String(id))) return "";
  return `(function(g,d,o){g._ltq=g._ltq||[];g._lt=g._lt||function(){g._ltq.push(arguments)};var s=d.createElement('script');s.async=1;s.src=o||'https://d.line-scdn.net/n/line_tag/public/release/v1/lt.js';var t=d.getElementsByTagName('script')[0];t.parentNode.insertBefore(s,t)})(window,document);_lt('init',{customerType:'lap',tagId:'${id}'});_lt('send','pv',['${id}']);`;
}

async function readConfig() {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return {};
    const { data } = await sb.from("tracking_settings").select("config").eq("id", "default").maybeSingle();
    return data?.config || {};
  } catch (e) {
    console.error("[tracking] readConfig failed", e);
    return {};
  }
}

// layout 用：跨請求快取，後臺存檔時以 revalidateTag("tracking-settings") 失效
export const getTrackingSettings = unstable_cache(
  async () => enabledPlatforms(await readConfig()),
  ["tracking-settings-v1"],
  { tags: ["tracking-settings"] }
);

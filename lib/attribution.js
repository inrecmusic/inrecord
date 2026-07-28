// lib/attribution.js — UTM 歸因（last-touch）。純函式可測 + browser cookie helpers。
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["gclid", "fbclid"];
const COOKIE_NAME = "ir_attr";
const COOKIE_DAYS = 30;

export function parseAttribution(search) {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const out = {};
  for (const k of [...UTM_KEYS, ...CLICK_KEYS]) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export function hasTouch(attr) {
  return !!attr && Object.keys(attr).some((k) => attr[k]);
}

export function mergeLastTouch(prev, next) {
  if (hasTouch(next)) return { ...next };
  return prev || null;
}

export function readAttributionCookie() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )ir_attr=([^;]*)/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

function writeAttributionCookie(obj) {
  const val = encodeURIComponent(JSON.stringify(obj));
  const maxAge = COOKIE_DAYS * 86400;
  document.cookie = `${COOKIE_NAME}=${val}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

// 落地擷取：本次帶 UTM/click id 才覆蓋（last-touch）；direct 保留既有
export function captureAttribution() {
  if (typeof window === "undefined") return null;
  const parsed = parseAttribution(window.location.search);
  const prev = readAttributionCookie();
  if (!hasTouch(parsed)) return prev;
  const next = {
    ...parsed,
    landing_path: window.location.pathname,
    referrer: document.referrer || "",
    captured_at: new Date().toISOString(),
  };
  writeAttributionCookie(next);
  return next;
}

// Meta CAPI 匹配用：讀 Pixel 設的 _fbp / _fbc cookie（browser）
export function readFbCookies() {
  if (typeof document === "undefined") return {};
  const get = (n) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch { return m[1]; } // 壞的百分比編碼(如 fbclid=%zz)不拋、保留原值——絕不擋結帳
  };
  const fbp = get("_fbp"), fbc = get("_fbc");
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
}

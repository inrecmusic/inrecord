import crypto from "crypto";

// 共用：呼叫 Amego JSON API（沿用 amego-invoice.js 的簽章慣例）
async function amegoPost(endpoint, dataObj) {
  const appKey = process.env.AMEGO_APP_KEY;
  const data = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);
  const sign = crypto.createHash("md5").update(data + time + appKey).digest("hex");
  const params = new URLSearchParams({
    invoice: process.env.AMEGO_IDENTIFIER,
    data,
    time: String(time),
    sign,
  });
  const res = await fetch(`${process.env.AMEGO_API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.json();
}

// 驗證手機載具（手機條碼）是否真實存在
// 回傳：{ valid:true } | { valid:false, error } | { valid:true, degraded:true }（API 失敗時放行）
export async function verifyCarrier(barcode) {
  if (!process.env.AMEGO_APP_KEY || !process.env.AMEGO_IDENTIFIER) {
    console.warn("[amego-verify] 手機條碼驗證降級放行：缺少 AMEGO_APP_KEY / AMEGO_IDENTIFIER");
    return { valid: true, degraded: true }; // 缺設定不擋
  }
  try {
    const r = await amegoPost("/json/barcode", { barCode: barcode });
    if (r.code === 0) return { valid: true };
    // 9000113 = 手機條碼不存在；其餘視為明確無效
    return { valid: false, error: r.msg || `amego_${r.code}` };
  } catch (e) {
    console.warn("[amego-verify] 手機條碼驗證降級放行：Amego 連線失敗，由開票失敗機制兜底", e?.message || e);
    return { valid: true, degraded: true }; // 連線失敗→放行，由開票失敗機制兜底
  }
}

// 驗證統一編號是否真實存在（g0v 公司登記聚合 API，涵蓋公司+商號），並回公司名
// 回傳：{ valid:true, name } | { valid:false } | { valid:true, degraded:true }
export async function verifyTaxId(taxId) {
  try {
    const res = await fetch(`https://company.g0v.ronny.tw/api/show/${encodeURIComponent(taxId)}`, {
      headers: { "User-Agent": "inrecord" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[amego-verify] 統編驗證降級放行：g0v API 回應 ${res.status}`);
      return { valid: true, degraded: true };
    }
    const j = await res.json();
    const name = j?.data?.["公司名稱"] || j?.data?.["商業名稱"];
    if (name) return { valid: true, name };
    return { valid: false };
  } catch (e) {
    console.warn("[amego-verify] 統編驗證降級放行：g0v API 連線/逾時", e?.message || e);
    return { valid: true, degraded: true }; // 連線/逾時→放行
  }
}

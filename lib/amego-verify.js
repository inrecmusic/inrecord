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
    return { valid: true, degraded: true }; // 缺設定不擋
  }
  try {
    const r = await amegoPost("/json/barcode", { barCode: barcode });
    if (r.code === 0) return { valid: true };
    // 9000113 = 手機條碼不存在；其餘視為明確無效
    return { valid: false, error: r.msg || `amego_${r.code}` };
  } catch {
    return { valid: true, degraded: true }; // 連線失敗→放行，由開票失敗機制兜底
  }
}

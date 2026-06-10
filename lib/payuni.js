import crypto from "crypto";

// ── PAYUNi 統一金流 共用加解密 ──────────────────────────────────────────────
// 與官方 SDK 一致：AES-256-GCM，輸出 hex( base64(密文) + ':::' + base64(GCM tag) )

export function aesEncrypt(plaintext, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let enc = cipher.update(plaintext, "utf8", "base64");
  enc += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return Buffer.from(`${enc}:::${tag}`, "utf8").toString("hex");
}

export function aesDecrypt(encryptStr, key, iv) {
  const combined = Buffer.from(encryptStr, "hex").toString("utf8");
  const [ctB64, tagB64] = combined.split(":::");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  let dec = decipher.update(ctB64, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

// SHA256(HashKey + EncryptInfo + HashIV) 轉大寫
export function makeHashInfo(encryptInfo, key, iv) {
  return crypto
    .createHash("sha256")
    .update(key + encryptInfo + iv)
    .digest("hex")
    .toUpperCase();
}

// 由 PAYUNI_API_URL（.../api/upp）推導其他 API endpoint，例：path="trade/close"
export function payuniEndpoint(path) {
  const base = process.env.PAYUNI_API_URL || "https://sandbox-api.payuni.com.tw/api/upp";
  return base.replace(/\/upp\/?$/, `/${path}`);
}

// 呼叫幕後 API（trade/close、trade/cancel、trade/query 等），自動加解密並驗 Hash
// 回傳 { success, status, data }；data 為解密後的物件
export async function payuniTrade(path, encryptFields) {
  const merID   = process.env.PAYUNI_MERCHANT_ID;
  const hashKey = process.env.PAYUNI_HASH_KEY;
  const hashIV  = process.env.PAYUNI_HASH_IV;
  if (!merID || !hashKey || !hashIV) {
    return { success: false, status: "CONFIG", data: { error: "missing_payuni_config" } };
  }

  const payload = {
    MerID:     merID,
    Timestamp: String(Math.floor(Date.now() / 1000)),
    ...encryptFields,
  };
  const qs          = new URLSearchParams(payload).toString();
  const encryptInfo = aesEncrypt(qs, hashKey, hashIV);
  const hashInfo    = makeHashInfo(encryptInfo, hashKey, hashIV);

  const res = await fetch(payuniEndpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      MerID:       merID,
      Version:     "1.0",
      EncryptInfo: encryptInfo,
      HashInfo:    hashInfo,
    }).toString(),
  });

  const json = await res.json();
  if (json.Status === "ERROR" || !json.EncryptInfo) {
    return { success: false, status: json.Status, data: json };
  }
  // 驗證回傳 Hash
  if (json.HashInfo && makeHashInfo(json.EncryptInfo, hashKey, hashIV) !== json.HashInfo) {
    return { success: false, status: "HASH_MISMATCH", data: json };
  }
  const decrypted = Object.fromEntries(new URLSearchParams(aesDecrypt(json.EncryptInfo, hashKey, hashIV)));
  return { success: json.Status === "SUCCESS", status: json.Status, data: decrypted };
}

import { createHash, timingSafeEqual } from "crypto";

// lib/partner-auth.js — 合作夥伴唯讀金鑰（給外部工具／AI 助理接廣告數據用）。
//
// 為什麼不共用後台的 admin token：後台那把是「全權」——能退款、改價格、群發電子報給全部學員。
// 廣告分析只需要讀數字，給全權等於把整個平台交出去，而且稽核紀錄會分不出是誰做的。
// 這裡走完全獨立的一把金鑰，只開放 /api/partner/* 的唯讀端點，可單獨撤銷（改 env 後重新部署）。
//
// 金鑰放 env PARTNER_ADS_KEY。未設＝功能整個關閉（fail-closed），不會因為漏設就變成無條件放行。
const MIN_LEN = 24;

function safeEqual(a, b) {
  // 先雜湊再比：長度不同也不會提早回傳，避免由回應時間推算金鑰長度
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function partnerKeyConfigured(env = process.env) {
  const k = env.PARTNER_ADS_KEY;
  return typeof k === "string" && k.length >= MIN_LEN;
}

// 從 Authorization: Bearer <key> 取金鑰並比對。回 { ok, label } 或 { ok:false, error }。
export function verifyPartnerKey(req, env = process.env) {
  if (!partnerKeyConfigured(env)) return { ok: false, error: "not_configured" };
  const auth = (req?.headers?.get?.("authorization") || "").trim();
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!key) return { ok: false, error: "unauthorized" };
  if (!safeEqual(key, env.PARTNER_ADS_KEY)) return { ok: false, error: "unauthorized" };
  return { ok: true, label: env.PARTNER_ADS_LABEL || "partner" };
}

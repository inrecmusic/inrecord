// 早鳥資格解析（server-only，需 service-role client）。
// 資格 = 後台覆寫（enrollments.early_override）優先，否則依「最早的付款訂單或開通時間 ≤ 9/9」自動判斷。
// 回傳含 error 旗標：呼叫端自行決定故障時要 fail-open（bootstrap，避免誤鎖真早鳥）
// 還是 fail-closed（video-embed 硬閘門，避免故障時門戶大開）。
import { isEarlyAccess } from "./early-access.js";

// email 來自已驗證 JWT，仍嚴格白名單化，避免帶 , ( ) 破壞 PostgREST .or() 過濾語法
const EMAIL_RE = /^[^,()\s]+@[^,()\s]+$/;

export async function resolveEarlyAccess(supabase, email) {
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    console.error("[early-access] email 格式異常，視為錯誤:", email);
    return { early: false, override: null, error: true };
  }
  try {
    // 不用字串組 .or()：拆成 email / grant_email 兩查詢再合併，移除注入 sink
    const [ordA, ordB, enrRes] = await Promise.all([
      supabase.from("orders").select("created_at").eq("status", "paid").eq("email", email),
      supabase.from("orders").select("created_at").eq("status", "paid").eq("grant_email", email),
      supabase.from("enrollments").select("enrolled_at, early_override").eq("email", email),
    ]);
    if (ordA.error || ordB.error || enrRes.error) {
      console.error("[early-access] 查詢失敗:", ordA.error?.message || ordB.error?.message || enrRes.error?.message);
      return { early: false, override: null, error: true };
    }
    const override = (enrRes.data || []).map((e) => e.early_override).find((v) => v === "early" || v === "standard") || null;
    if (override) return { early: override === "early", override, error: false };
    const early = isEarlyAccess({
      orderTimes: [...(ordA.data || []), ...(ordB.data || [])].map((o) => o.created_at),
      enrollTimes: (enrRes.data || []).map((e) => e.enrolled_at),
    });
    return { early, override: null, error: false };
  } catch (e) {
    console.error("[early-access] 例外:", e?.message || e);
    return { early: false, override: null, error: true };
  }
}

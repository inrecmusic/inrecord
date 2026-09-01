// 早鳥資格解析（server-only，需 service-role client）。
// 資格 = 後台覆寫（enrollments.early_override）優先，否則依「最早的付款訂單或開通時間 ≤ 9/9」自動判斷。
// 查詢失敗時 fail-open 視為早鳥：分層是行銷限制而非安全邊界，寧可多放行也不要把付費學員擋在門外。
import { isEarlyAccess } from "./early-access.js";

export async function resolveEarlyAccess(supabase, email) {
  try {
    const [ordRes, enrRes] = await Promise.all([
      supabase.from("orders").select("created_at")
        .eq("status", "paid")
        .or(`email.eq.${email},grant_email.eq.${email}`),
      supabase.from("enrollments").select("enrolled_at, early_override").eq("email", email),
    ]);
    if (ordRes.error || enrRes.error) {
      console.error("[early-access] 查詢失敗，fail-open 視為早鳥:", ordRes.error?.message || enrRes.error?.message);
      return { early: true, override: null };
    }
    const override = (enrRes.data || []).map((e) => e.early_override).find((v) => v === "early" || v === "standard") || null;
    if (override) return { early: override === "early", override };
    const early = isEarlyAccess({
      orderTimes: (ordRes.data || []).map((o) => o.created_at),
      enrollTimes: (enrRes.data || []).map((e) => e.enrolled_at),
    });
    return { early, override: null };
  } catch (e) {
    console.error("[early-access] 例外，fail-open 視為早鳥:", e?.message || e);
    return { early: true, override: null };
  }
}

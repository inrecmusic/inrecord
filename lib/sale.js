// lib/sale.js — 銷售期間判定（純函式可測）+ 設定讀取
import { PLAN_CATALOG } from "./plans.js";
import { getSupabaseAdmin } from "./supabase.js";
import { FAN_PRICE, FAN_DIRECT_PRICE, FAN_PROOF_DEADLINE, FAN_PROOF_DISCOUNT } from "./fan-proof.js";

// settings: { open_at, lock_override, launch_notified_at, list_price:{[plan]:Int}, waves:[{starts_at,ends_at,prices:{[plan]:Int}}] } | null

export function isClassroomOpen(settings, now = new Date()) {
  if (!settings) return false;
  if (settings.lock_override === "open") return true;
  if (settings.lock_override === "locked") return false;
  if (!settings.open_at) return false;
  return now.getTime() >= new Date(settings.open_at).getTime();
}

export function isPresale(settings, now = new Date()) {
  return !isClassroomOpen(settings, now);
}

// 依 starts_at 排序的有效波段
function sortedWaves(settings) {
  const ws = Array.isArray(settings?.waves) ? settings.waves : [];
  return ws
    .filter((w) => w && w.starts_at && w.ends_at)
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

// now ∈ [starts_at, ends_at) 的第一個波段；無則 null
export function activeWave(settings, now = new Date()) {
  const t = now.getTime();
  return (
    sortedWaves(settings).find(
      (w) => t >= new Date(w.starts_at).getTime() && t < new Date(w.ends_at).getTime()
    ) || null
  );
}

export function listPrice(plan, settings) {
  const lp = settings?.list_price?.[plan];
  return Number.isFinite(lp) ? lp : (PLAN_CATALOG[plan]?.price ?? 0);
}

// 劃線原價（顯示用的錨點）。可與「波段結束後的常態售價 list_price」不同
// （例：劃線 $10,800、正式售價 $7,999）。未設 list_anchor 時回退 list_price，行為與舊版一致。
export function listAnchor(plan, settings) {
  const a = settings?.list_anchor?.[plan];
  return Number.isFinite(a) ? a : listPrice(plan, settings);
}

export function currentPrice(plan, settings, now = new Date()) {
  const w = activeWave(settings, now);
  if (w && Number.isFinite(w.prices?.[plan])) return Math.min(w.prices[plan], listAnchor(plan, settings));
  return listPrice(plan, settings);
}

// 這筆成交價真正結束的時刻（ms）：從現在的波段往後掃相接的波段，價格一變就是截止；
// 同價相接的波段不算截止；一路到牌價都沒變、或現在不在波段內 → null（沒有截止）。
// toFinal：把基準價換成成交價（結帳用 applyCoupon(base, coupon)；指定價券的成交價不隨波段變，就會回 null）。
export function priceEndsAt(plan, settings, now = new Date(), toFinal = (p) => p) {
  let w = activeWave(settings, now);
  if (!w) return null;
  const final = toFinal(currentPrice(plan, settings, now));
  let at = null;
  for (let i = 0; w && i < 100; i++) {
    at = new Date(w.ends_at);
    if (toFinal(currentPrice(plan, settings, at)) !== final) return at.getTime();
    w = activeWave(settings, at); // ends_at 不含，剛好落在相接的下一波段
  }
  // 走到沒有下一波段＝一路同價到牌價 → 沒有截止；還有波段但掃滿上限 → 回最後掃到的迄（提早截止是安全方向）
  return w ? at.getTime() : null;
}

// 'pre_launch'（早於第一波）| 'wave'（命中波段）| 'list'（其餘：無波段/波段後/間隙）
export function saleState(settings, now = new Date()) {
  if (activeWave(settings, now)) return "wave";
  const ws = sortedWaves(settings);
  if (ws.length && now.getTime() < new Date(ws[0].starts_at).getTime()) return "pre_launch";
  return "list";
}

export function isOnSale(settings, now = new Date()) {
  return saleState(settings, now) !== "pre_launch";
}

export function salePhase(settings, now = new Date()) {
  const state = saleState(settings, now);
  const ws = sortedWaves(settings);
  const w = activeWave(settings, now);
  const plans = {};
  for (const key of Object.keys(PLAN_CATALOG)) {
    const price = currentPrice(key, settings, now);
    const anchor = listAnchor(key, settings);
    plans[key] = { price, originalPrice: anchor, isEarlyBird: state === "wave" && price < anchor };
  }
  return {
    state,
    classroomOpen: isClassroomOpen(settings, now),
    onSale: state !== "pre_launch",
    salesStartAt: ws.length ? ws[0].starts_at : null,
    nextIncreaseAt: w ? w.ends_at : null,
    plans,
    // enabled 對外＝「現在可買粉絲方案」：後台開關 且 未過截止（首頁粉絲卡／hero 價格／sticky 依此切換）
    fanPlan: { ...getFanPlan(settings), enabled: fanCouponActive(settings, now) },
  };
}

// 購買當下的銷售階段名稱，給購買確認信的「購買方案」欄用。
// 買家在意的是「我用什麼身分／什麼價格買的」，不是方案代號——同一個課程包，
// 粉絲優惠買的和早鳥期間買的，信上要看得出差別。
// 判定順序：粉絲券（FAN 開頭，含直購 FAN3999 與憑證 FAN-XXXX）→ 下單當下有波段＝早鳥期間 → 正式售價。
export function purchasePhaseLabel({ couponCode, createdAt, settings } = {}) {
  if (String(couponCode || "").trim().toUpperCase().startsWith("FAN")) return "粉絲優惠";
  const at = createdAt ? new Date(createdAt) : null;
  if (at && Number.isFinite(at.getTime()) && activeWave(settings, at)) return "早鳥期間";
  return "正式售價";
}

// 預售鎖站期間仍需可達的 /classroom 工具頁段（登入／忘記密碼／帳號／證書）。
// ⚠️ 只放「登入/帳號/工具頁」；課程內容頁（教室主頁、影片）絕不可加入，否則開課前外洩付費內容。
// 規則：路徑須為 /classroom/<段> 或其子路徑才豁免；預設 fail-closed，未列入者一律鎖站。
export const CLASSROOM_TOOL_SEGMENTS = ["login", "reset-password", "account", "certificate"];
export function isClassroomLockExempt(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/classroom")) return false;
  return CLASSROOM_TOOL_SEGMENTS.some(
    (seg) => pathname === `/classroom/${seg}` || pathname.startsWith(`/classroom/${seg}/`)
  );
}

// 粉絲方案設定正規化：缺/壞值 fallback 到 lib/fan-proof 常數（enabled 預設 true）
export function getFanPlan(settings) {
  const fp = (settings && typeof settings.fan_plan === "object" && settings.fan_plan) || {};
  const enabled = typeof fp.enabled === "boolean" ? fp.enabled : true;
  const deadlineMs = fp.deadline && !isNaN(Date.parse(fp.deadline)) ? Date.parse(fp.deadline) : FAN_PROOF_DEADLINE;
  const proofPrice = Number.isInteger(fp.proof_price) && fp.proof_price > 0 ? fp.proof_price : FAN_PRICE;
  const directPrice = Number.isInteger(fp.direct_price) && fp.direct_price > 0 ? fp.direct_price : FAN_DIRECT_PRICE;
  // 憑證折抵獨立於「粉絲限定方案」：直購價 FAN3999 隨 deadline 結束，但憑證福利要能持續開放。
  const proofEnabled = typeof fp.proof_enabled === "boolean" ? fp.proof_enabled : true;
  const proofDiscount = Number.isInteger(fp.proof_discount) && fp.proof_discount > 0 ? fp.proof_discount : FAN_PROOF_DISCOUNT;
  return { enabled, deadlineMs, proofPrice, directPrice, proofEnabled, proofDiscount };
}

// 粉絲直購券代碼（fanPlanCoupon 建立、checkout／validate 以此辨識）
export const FAN_COUPON_CODE = "FAN3999";

// 粉絲直購券是否仍可用：方案啟用且尚未過 fan_plan.deadline。
// 截止後首頁粉絲卡與 FAN3999 一起關（使用者 2026-09-01 定案：deadline 結束的是整個粉絲方案，不只憑證入口）。
export function fanCouponActive(settings, now = new Date()) {
  const fp = getFanPlan(settings);
  return fp.enabled && now.getTime() <= fp.deadlineMs;
}

// 憑證上傳入口是否開放：只看自己的開關，不受粉絲直購方案的 deadline 影響。
export function fanProofActive(settings) {
  return getFanPlan(settings).proofEnabled;
}

// 後台 PATCH 用的輸入驗證（不信任前端）
export function validateFanPlan(fp) {
  if (typeof fp !== "object" || fp === null) return { ok: false, error: "invalid_fan_plan" };
  if (typeof fp.enabled !== "boolean") return { ok: false, error: "invalid_fan_plan_enabled" };
  if (!fp.deadline || isNaN(Date.parse(fp.deadline))) return { ok: false, error: "invalid_fan_plan_deadline" };
  if (!Number.isInteger(fp.proof_price) || fp.proof_price <= 0) return { ok: false, error: "invalid_fan_plan_proof_price" };
  if (!Number.isInteger(fp.direct_price) || fp.direct_price <= 0) return { ok: false, error: "invalid_fan_plan_direct_price" };
  if (fp.proof_price > fp.direct_price) return { ok: false, error: "fan_plan_proof_gt_direct" };
  if ("proof_enabled" in fp && typeof fp.proof_enabled !== "boolean") return { ok: false, error: "invalid_fan_plan_proof_enabled" };
  if ("proof_discount" in fp && (!Number.isInteger(fp.proof_discount) || fp.proof_discount <= 0)) return { ok: false, error: "invalid_fan_plan_proof_discount" };
  return { ok: true };
}

// 由粉絲方案設定衍生「直購固定價券 FAN3999」的 upsert 內容（value=直購價；停用時券 disabled）。
export function fanPlanCoupon(fanPlan) {
  return {
    code: FAN_COUPON_CODE,
    name: "粉絲直購",
    type: "price",
    value: fanPlan.direct_price,
    plan: "bundle",
    usage_limit: null,
    status: fanPlan.enabled ? "active" : "disabled",
  };
}

// 讀取單列設定（service role；server component / API / cron 用）
// strict=true：查詢出錯就拋，讓呼叫端 fail-closed。**結帳一定要用 strict**——
// 吞掉錯誤回 null 會讓 saleState 變 'list'（isOnSale=true 放行購買），售價再退回
// PLAN_CATALOG 的 fallback，等於資料庫瞬斷時用遠低於現行波段價的金額把課賣出去。
// 首頁等純顯示用途維持寬鬆（strict=false），避免一次查詢失敗讓整頁掛掉。
export async function getSaleSettings({ strict = false } = {}) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    if (strict) throw new Error("sale_settings_unavailable: no db client");
    return null;
  }
  const { data, error } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  if (error) {
    console.error("[sale] 讀取 sale_settings 失敗:", error.message);
    if (strict) throw new Error("sale_settings_unavailable: " + error.message);
    return null;
  }
  return data || null;
}

// lib/sale.js — 銷售期間判定（純函式可測）+ 設定讀取
import { PLAN_CATALOG } from "./plans.js";
import { getSupabaseAdmin } from "./supabase.js";

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

export function currentPrice(plan, settings, now = new Date()) {
  const lp = listPrice(plan, settings);
  const w = activeWave(settings, now);
  if (w && Number.isFinite(w.prices?.[plan])) return Math.min(w.prices[plan], lp);
  return lp;
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
    const lp = listPrice(key, settings);
    plans[key] = { price, originalPrice: lp, isEarlyBird: state === "wave" && price < lp };
  }
  return {
    state,
    classroomOpen: isClassroomOpen(settings, now),
    onSale: state !== "pre_launch",
    salesStartAt: ws.length ? ws[0].starts_at : null,
    nextIncreaseAt: w ? w.ends_at : null,
    plans,
  };
}

// 讀取單列設定（service role；server component / API / cron 用）
export async function getSaleSettings() {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  return data || null;
}

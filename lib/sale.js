// lib/sale.js — 銷售期間判定（純函式可測）+ 設定讀取
import { PLAN_CATALOG } from "./plans.js";
import { getSupabaseAdmin } from "./supabase.js";

// settings: { open_at, early_bird_ends_at, plan_pricing, lock_override, launch_notified_at } | null
export function isClassroomOpen(settings, now = new Date()) {
  if (!settings) return false;
  if (settings.lock_override === "open") return true;
  if (settings.lock_override === "locked") return false;
  if (!settings.open_at) return false;
  return now.getTime() >= new Date(settings.open_at).getTime();
}

export function isEarlyBird(settings, now = new Date()) {
  if (!settings || !settings.early_bird_ends_at) return false;
  return now.getTime() < new Date(settings.early_bird_ends_at).getTime();
}

export function currentPrice(plan, settings, now = new Date()) {
  const fallback = PLAN_CATALOG[plan]?.price ?? 0;
  const pricing = settings?.plan_pricing?.[plan];
  if (!pricing) return fallback;
  const original = Number.isFinite(pricing.original) ? pricing.original : fallback;
  if (isEarlyBird(settings, now) && Number.isFinite(pricing.earlyBird)) return Math.min(pricing.earlyBird, original);
  return original;
}

export function isPresale(settings, now = new Date()) {
  return !isClassroomOpen(settings, now);
}

export function salePhase(settings, now = new Date()) {
  return { classroomOpen: isClassroomOpen(settings, now), earlyBird: isEarlyBird(settings, now) };
}

// 讀取單列設定（service role；server component / API / cron 用）
export async function getSaleSettings() {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  return data || null;
}

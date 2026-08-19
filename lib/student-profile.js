// lib/student-profile.js — 學員資料驗證/核心完整判定/預填（純函式，可測；前台引導、帳號頁、後端共用）
export const LEVELS = ["none", "little", "some"];
export const SOURCES = ["ig", "friend", "concert", "search", "other"];
export const EQUIPMENT = ["acoustic", "digital", "none"];
export const AGE_GROUPS = ["under18", "18_29", "30_44", "45_59", "60plus"];
export const GENDERS = ["male", "female", "other", "prefer_not"];
const GOAL_MAX = 500;
const PHONE_RE = /^09\d{8}$/;

export function isValidMobile(phone) {
  return PHONE_RE.test(String(phone || "").trim());
}

export function isProfileCoreComplete(p) {
  return !!p
    && !!String(p.real_name ?? "").trim()
    && !!String(p.phone ?? "").trim()
    && LEVELS.includes(p.level);
}

export function validateProfile(input = {}) {
  const real_name = String(input.real_name ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const level = input.level ?? null;
  if (!real_name) return { ok: false, error: "missing_real_name" };
  if (!PHONE_RE.test(phone)) return { ok: false, error: "invalid_phone" };
  if (!LEVELS.includes(level)) return { ok: false, error: "invalid_level" };

  const opt = (val, list) => {
    const v = val == null || val === "" ? null : String(val);
    return v !== null && !list.includes(v) ? { bad: true } : { v };
  };
  const source = opt(input.source, SOURCES);
  const equipment = opt(input.equipment, EQUIPMENT);
  const age_group = opt(input.age_group, AGE_GROUPS);
  const gender = opt(input.gender, GENDERS);
  if (source.bad || equipment.bad || age_group.bad || gender.bad) return { ok: false, error: "invalid_option" };

  const goal = String(input.goal ?? "").trim().slice(0, GOAL_MAX) || null;
  return { ok: true, value: { real_name, phone, level, goal,
    source: source.v, equipment: equipment.v, age_group: age_group.v, gender: gender.v } };
}

export function mergePrefill(profile, order) {
  const p = profile || {};
  return {
    real_name: p.real_name || order?.buyer_name || "",
    phone: p.phone || order?.phone || "",
    level: p.level || "",
    goal: p.goal || "", source: p.source || "", equipment: p.equipment || "",
    age_group: p.age_group || "", gender: p.gender || "",
  };
}

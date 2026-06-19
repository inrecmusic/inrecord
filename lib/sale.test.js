import { describe, it, expect } from "vitest";
import { isClassroomOpen, isEarlyBird, currentPrice, isPresale, salePhase } from "./sale.js";

const T0 = new Date("2026-08-15T00:00:00+08:00"); // 開課日
const EB = new Date("2026-07-31T23:59:59+08:00"); // 早鳥截止
const base = {
  open_at: T0.toISOString(),
  early_bird_ends_at: EB.toISOString(),
  plan_pricing: { course: { original: 3800, earlyBird: 3200 }, bundle: { original: 3999, earlyBird: 3499 } },
  lock_override: null,
  launch_notified_at: null,
};
const before = new Date("2026-07-01T00:00:00+08:00"); // 開課前 + 早鳥中
const between = new Date("2026-08-01T00:00:00+08:00"); // 早鳥已過 + 開課前
const after = new Date("2026-08-20T00:00:00+08:00"); // 開課後 + 早鳥已過

describe("isClassroomOpen", () => {
  it("override 'open' 一律開", () => expect(isClassroomOpen({ ...base, lock_override: "open" }, before)).toBe(true));
  it("override 'locked' 一律鎖", () => expect(isClassroomOpen({ ...base, lock_override: "locked" }, after)).toBe(false));
  it("無 open_at → 鎖", () => expect(isClassroomOpen({ ...base, open_at: null }, after)).toBe(false));
  it("now < open_at → 鎖", () => expect(isClassroomOpen(base, before)).toBe(false));
  it("now == open_at → 開", () => expect(isClassroomOpen(base, T0)).toBe(true));
  it("now > open_at → 開", () => expect(isClassroomOpen(base, after)).toBe(true));
  it("settings null → 鎖", () => expect(isClassroomOpen(null, after)).toBe(false));
});

describe("isEarlyBird", () => {
  it("now < 截止 → true", () => expect(isEarlyBird(base, before)).toBe(true));
  it("now >= 截止 → false", () => expect(isEarlyBird(base, between)).toBe(false));
  it("無截止日 → false", () => expect(isEarlyBird({ ...base, early_bird_ends_at: null }, before)).toBe(false));
  it("settings null → false", () => expect(isEarlyBird(null, before)).toBe(false));
});

describe("currentPrice", () => {
  it("早鳥中回早鳥價", () => expect(currentPrice("course", base, before)).toBe(3200));
  it("早鳥過回原價", () => expect(currentPrice("course", base, between)).toBe(3800));
  it("bundle 早鳥中", () => expect(currentPrice("bundle", base, before)).toBe(3499));
  it("方案缺 earlyBird → 回原價", () => expect(currentPrice("course", { ...base, plan_pricing: { course: { original: 3800 } } }, before)).toBe(3800));
  it("方案缺整筆 pricing → fallback PLAN_CATALOG", () => expect(currentPrice("course", { ...base, plan_pricing: {} }, before)).toBe(3800));
  it("settings null → fallback PLAN_CATALOG", () => expect(currentPrice("bundle", null, before)).toBe(3999));
});

describe("isPresale / salePhase", () => {
  it("開課前 isPresale=true", () => expect(isPresale(base, before)).toBe(true));
  it("開課後 isPresale=false", () => expect(isPresale(base, after)).toBe(false));
  it("salePhase 開課前+早鳥", () => expect(salePhase(base, before)).toEqual({ classroomOpen: false, earlyBird: true }));
  it("salePhase 開課後+原價", () => expect(salePhase(base, after)).toEqual({ classroomOpen: true, earlyBird: false }));
});

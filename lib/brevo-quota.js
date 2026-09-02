// lib/brevo-quota.js — 後台 Brevo 額度儀表的期間判定（純函式，可測）。
//
// 免費方案的 sendLimit 是「每天 300 封」，統計日走 UTC（台灣早上 8 點重置）。
// 2026-09 升上付費方案（Starter）後規則變了：額度按計費週期給、沒有每日上限——
// 若還拿「今天已寄」去減整期額度，面板就會嚴重高估剩餘量。故期間一律由方案決定：
// 免費看今天，付費看計費週期（起日取 plan.startDate；Brevo 沒回就退回當月 1 日，
// 並把起算日一併回給 UI 標示，不假裝精準）。

export function pickSendLimitPlan(account) {
  return (account?.plan || []).find((p) => p?.creditsType === "sendLimit") || null;
}

export function planWindow(plan, now = new Date()) {
  const today = now.toISOString().slice(0, 10); // UTC，與 Brevo 統計日一致
  const daily = (plan?.type || "free") === "free";
  const start = daily
    ? today
    : (String(plan?.startDate || "").slice(0, 10) || `${today.slice(0, 8)}01`);
  return { daily, period: daily ? "day" : "cycle", start, end: today };
}

// 上限拿不到就回 null（只報已寄數，不臆測剩餘）——硬上限本來就由 Brevo 把關。
export function quotaSummary(account, requests, now = new Date()) {
  const plan = pickSendLimitPlan(account);
  const { daily, period, start, end } = planWindow(plan, now);
  const limit = Number.isFinite(plan?.credits) ? plan.credits : null;
  const used = Number.isFinite(requests) ? requests : 0;
  return {
    planType: plan?.type || null,
    period, periodStart: start, periodEnd: end, daily,
    limit, used,
    remaining: limit == null ? null : Math.max(0, limit - used),
  };
}

// lib/ops-report/schema.js — 模型輸出的結構化 schema、後台頁面白名單、輸出清洗（模型只能建議導向既有後台頁）。
export const ADMIN_PAGES = ["dashboard", "courses", "messages", "media", "students", "orders", "customer", "subscriptions", "coupons", "analytics", "ads", "sale", "tracking", "audit", "newsletter", "announcements", "ops"];

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "一句話總結上週（台灣繁中）" },
    highlights: { type: "array", items: { type: "string" }, description: "3 到 5 個重點，每條引用資料包內的數字並與上週比較" },
    risks: {
      type: "array",
      items: { type: "object", properties: { level: { type: "string", enum: ["high", "medium", "low"] }, text: { type: "string" } }, required: ["level", "text"], additionalProperties: false },
    },
    suggestions: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, why: { type: "string" }, admin_path: { type: "string", description: `後台頁面 id，只能是：${ADMIN_PAGES.join(", ")}` } }, required: ["title", "why", "admin_path"], additionalProperties: false },
    },
    metrics: { type: "object", description: "從資料包原樣回填的關鍵數字（本週 vs 上週），值為數字或字串", additionalProperties: true },
  },
  required: ["headline", "highlights", "risks", "suggestions", "metrics"],
  additionalProperties: false,
};

const LEVELS = new Set(["high", "medium", "low"]);
export function sanitizeReport(raw = {}) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    headline: String(raw?.headline || ""),
    highlights: arr(raw?.highlights).map(String).slice(0, 5),
    risks: arr(raw?.risks).map((r) => ({ level: LEVELS.has(r?.level) ? r.level : "medium", text: String(r?.text || "") })).filter((r) => r.text),
    suggestions: arr(raw?.suggestions).filter((s) => s && ADMIN_PAGES.includes(s.admin_path)).map((s) => ({ title: String(s.title || ""), why: String(s.why || ""), admin_path: s.admin_path })),
    metrics: raw?.metrics && typeof raw.metrics === "object" && !Array.isArray(raw.metrics) ? raw.metrics : {},
  };
}

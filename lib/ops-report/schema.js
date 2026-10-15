// lib/ops-report/schema.js — 模型輸出的結構化 schema、後台頁面白名單、輸出清洗（模型只能建議導向既有後台頁）。
export const ADMIN_PAGES = ["dashboard", "courses", "messages", "media", "students", "orders", "customer", "subscriptions", "coupons", "analytics", "ads", "sale", "tracking", "audit", "newsletter", "announcements", "ops"];

// ⚠️ 結構化輸出（output_config.format = json_schema）只接受 additionalProperties:false 的物件，
// 不接受「自由 key 的物件」。metrics 因此改成指標陣列 [{ name, value }]，sanitizeReport 再轉回
// { name: value } 物件，後台（OpsAssistantPage）與摘要信（email.js）畫表的程式不用動。
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
    metrics: {
      type: "array",
      description: "從資料包原樣回填的關鍵數字（本週 vs 上週），每個指標一筆：name 寫清楚是本週或上週（例如「本週已付款訂單」「上週已付款訂單」），value 原樣填入資料包的數字或字串，不要換算",
      items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"], additionalProperties: false },
    },
  },
  required: ["headline", "highlights", "risks", "suggestions", "metrics"],
  additionalProperties: false,
};

const LEVELS = new Set(["high", "medium", "low"]);
const MAX_METRICS = 40;

// 指標：新格式是陣列 [{ name, value }]，轉成 { name: value }；舊格式（物件）照收。只留純量值。
function toMetrics(v) {
  if (Array.isArray(v)) {
    const out = {};
    for (const m of v) {
      const name = String(m?.name ?? "").trim();
      const value = m?.value;
      if (!name || value == null || typeof value === "object") continue;
      out[name] = value;
      if (Object.keys(out).length >= MAX_METRICS) break;
    }
    return out;
  }
  if (v && typeof v === "object") return v;
  return {};
}

export function sanitizeReport(raw = {}) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    headline: String(raw?.headline || ""),
    highlights: arr(raw?.highlights).map(String).slice(0, 5),
    risks: arr(raw?.risks).map((r) => ({ level: LEVELS.has(r?.level) ? r.level : "medium", text: String(r?.text || "") })).filter((r) => r.text),
    suggestions: arr(raw?.suggestions).filter((s) => s && ADMIN_PAGES.includes(s.admin_path)).map((s) => ({ title: String(s.title || ""), why: String(s.why || ""), admin_path: s.admin_path })),
    metrics: toMetrics(raw?.metrics),
  };
}

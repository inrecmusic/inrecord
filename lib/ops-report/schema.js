// lib/ops-report/schema.js — 模型輸出的結構化 schema、後台頁面白名單、輸出清洗（模型只能建議導向既有後台頁）。
export const ADMIN_PAGES = ["dashboard", "courses", "messages", "media", "students", "orders", "customer", "subscriptions", "coupons", "analytics", "ads", "sale", "tracking", "audit", "newsletter", "announcements", "ops"];

// 六個核心指標（本週／上週）：由 collect.js 的程式算好放進資料包 core，generateReport 直接附到報告的 core 上，
// 不經模型抄寫——數字由程式算、模型只解讀。後台小表與摘要信都依 CORE_KEYS 的順序畫。
export const CORE_KEYS = ["revenue", "paid_orders", "created_orders", "active_students", "ad_spend", "newsletter_sent"];
export const CORE_LABEL = { revenue: "營收", paid_orders: "已付款訂單", created_orders: "建立訂單", active_students: "活躍學員", ad_spend: "廣告花費", newsletter_sent: "電子報寄出" };
const MONEY_KEYS = new Set(["revenue", "ad_spend"]);

// 版式上限（精簡版：站主每週只花一分鐘看）。模型端靠 SYSTEM_PROMPT 約束，這裡是最後一道裁切。
export const LIMITS = { highlights: 3, risks: 3, suggestions: 3, metrics: 12 };

// ⚠️ 結構化輸出（output_config.format = json_schema）只接受 additionalProperties:false 的物件，
// 不接受「自由 key 的物件」。metrics 因此是指標陣列 [{ name, value }]，sanitizeReport 再轉回
// { name: value } 物件給後台（OpsAssistantPage）與摘要信（email.js）畫表。
export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "一句話總結本週（台灣繁中，40 字內）" },
    highlights: { type: "array", items: { type: "string" }, description: "最多 3 條重點，每條一句話、只帶一個數字並與上週比較" },
    risks: {
      type: "array",
      description: "只列 high 等級（真的會掉錢、壞掉或違規的事），最多 3 條；沒有就空陣列",
      items: { type: "object", properties: { level: { type: "string", enum: ["high", "medium", "low"] }, text: { type: "string" } }, required: ["level", "text"], additionalProperties: false },
    },
    suggestions: {
      type: "array",
      description: "最多 3 條，每條只寫「做什麼」與對應後台頁面",
      items: { type: "object", properties: { title: { type: "string", description: "做什麼，一句話 20 字內" }, admin_path: { type: "string", description: `後台頁面 id，只能是：${ADMIN_PAGES.join(", ")}` } }, required: ["title", "admin_path"], additionalProperties: false },
    },
    metrics: {
      type: "array",
      description: "核心六指標以外、值得一看的其他數字，最多 10 筆：name 寫清楚是本週或上週（例如「本週退款」），value 原樣填入資料包的數字或字串，不要換算",
      items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"], additionalProperties: false },
    },
  },
  required: ["headline", "highlights", "risks", "suggestions", "metrics"],
  additionalProperties: false,
};

// 指標：新格式是陣列 [{ name, value }]，轉成 { name: value }；舊格式（物件）照收。只留純量值。
function toMetrics(v) {
  if (Array.isArray(v)) {
    const out = {};
    for (const m of v) {
      const name = String(m?.name ?? "").trim();
      const value = m?.value;
      if (!name || value == null || typeof value === "object") continue;
      out[name] = value;
      if (Object.keys(out).length >= LIMITS.metrics) break;
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
    highlights: arr(raw?.highlights).map((h) => String(h || "").trim()).filter(Boolean).slice(0, LIMITS.highlights),
    // 風險只留 high：模型若仍寫了 medium／low，直接丟掉（不要把它升成 high）
    risks: arr(raw?.risks).filter((r) => r?.level === "high" && String(r?.text || "").trim()).map((r) => ({ level: "high", text: String(r.text).trim() })).slice(0, LIMITS.risks),
    suggestions: arr(raw?.suggestions).filter((s) => s && ADMIN_PAGES.includes(s.admin_path) && String(s.title || "").trim()).map((s) => ({ title: String(s.title).trim(), admin_path: s.admin_path })).slice(0, LIMITS.suggestions),
    metrics: toMetrics(raw?.metrics),
  };
}

// core：每個指標 { this_week, last_week }，只收有限數字，其餘一律 null（＝尚未接上／查詢失敗，畫成「—」）。
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export function sanitizeCore(core) {
  const out = {};
  for (const k of CORE_KEYS) out[k] = { this_week: num(core?.[k]?.this_week), last_week: num(core?.[k]?.last_week) };
  return out;
}

export function formatCoreValue(key, v) {
  if (v == null) return "—";
  return MONEY_KEYS.has(key) ? `NT$${Math.round(v).toLocaleString("en-US")}` : String(v);
}

// 後台小表與摘要信共用：[{ key, label, now, prev }]（已格式化）。舊報告沒有 core 就回空陣列、不畫表。
export function coreRows(report) {
  const core = report?.core;
  if (!core || typeof core !== "object") return [];
  return CORE_KEYS.map((k) => ({ key: k, label: CORE_LABEL[k], now: formatCoreValue(k, core[k]?.this_week), prev: formatCoreValue(k, core[k]?.last_week) }));
}

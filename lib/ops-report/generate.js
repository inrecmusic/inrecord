// lib/ops-report/generate.js — 把資料包交給 Claude 寫週報（單次呼叫、無工具、結構化輸出）。
import { REPORT_SCHEMA, sanitizeReport, ADMIN_PAGES } from "./schema.js";

export const MODEL = "claude-opus-5";
const PRICE = { "claude-opus-5": { input: 5, output: 25 } }; // 美元／百萬 tokens（2026-06 官方價）

export const SYSTEM_PROMPT = [
  "你是 InRecord（線上鋼琴課程平台）的營運顧問，每週一早上讀取「資料包」，寫一份給站主看的營運週報。",
  "規則：",
  "1. 只能引用資料包裡出現的數字與事實，不得推算或臆測沒有的資料；欄位為 null 代表尚未接上，直接說「尚未接上」。",
  "2. 繁體中文、台灣口語、簡潔。重點 3 到 5 條，每條帶數字並與上週比較。",
  "3. 風險依嚴重度標 high／medium／low；建議要具體、可執行，並指出對應的後台頁面 id（只能用：" + ADMIN_PAGES.join("、") + "）。",
  "4. 你沒有任何執行權限，不得建議自動化執行；所有動作都由站主在後台完成。",
  "5. metrics 欄位把本週與上週的關鍵數字原樣回填（純數字或字串），方便畫表。",
].join("\n");

export function buildMessages(pack) {
  return [{ role: "user", content: `資料包（本週與上週）：\n${JSON.stringify(pack)}` }];
}

export function estimateCostUsd(usage = {}, model = MODEL) {
  const p = PRICE[model] || PRICE[MODEL];
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1_000_000;
}

// client：new Anthropic() 實例（測試可注入 mock）
export async function generateReport(pack, { client, model = MODEL } = {}) {
  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: REPORT_SCHEMA } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: buildMessages(pack),
  });
  if (res.stop_reason === "refusal") throw new Error("model_refusal");
  const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("report_parse_failed"); }
  const usage = { input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0 };
  return { report: sanitizeReport(raw), model, usage, cost_usd: Number(estimateCostUsd(usage, model).toFixed(4)) };
}

// lib/ops-report/generate.js — 把資料包交給 Claude 寫週報（單次呼叫、無工具、結構化輸出）。
import { REPORT_SCHEMA, sanitizeReport, sanitizeCore, ADMIN_PAGES } from "./schema.js";

export const MODEL = "claude-opus-5-5";
// 美元／百萬 tokens（2026-10 官方價）。保留 claude-opus-5 讓舊列的成本換算不變。
const PRICE = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
};

// 精簡版式（2026-10-15 站主回饋「太複雜、不好看」）：一句話＋重點≤3＋只留 high 風險＋建議≤3 只寫做什麼。
// 六個核心指標（資料包 core）由程式附上，模型不抄數字；其他數字最多 10 筆收進「更多數字」。
export const SYSTEM_PROMPT = [
  "你是 InRecord（線上鋼琴課程平台）的營運顧問，每週一早上讀取「資料包」，寫一份給站主看的營運週報。站主每週只花一分鐘看，所以要短、要好讀、一眼看完。",
  "規則：",
  "1. 只能引用資料包裡出現的數字與事實，不得推算或臆測沒有的資料；欄位為 null 代表尚未接上或查詢失敗，直接說「尚未接上」。",
  "2. 繁體中文、台灣口語。headline 一句話（40 字內）說本週最重要的事。highlights 最多 3 條，每條一句話（30 字內）、只帶一個數字並與上週比較（本週／上週對照在資料包 core 區塊）。",
  "3. risks 只列 high（真的會掉錢、壞掉或違規的事），最多 3 條，沒有就給空陣列；medium／low 一律不要寫。suggestions 最多 3 條，每條只寫「做什麼」（title，20 字內）與對應的後台頁面 id（admin_path，只能用：" + ADMIN_PAGES.join("、") + "），不用解釋原因。",
  "4. 你沒有任何執行權限，不得建議自動化執行；所有動作都由站主在後台完成。",
  "5. 核心六指標（core：營收、已付款訂單、建立訂單、活躍學員、廣告花費、電子報寄出）由程式自動附在報告上，不用回填。metrics 只放 core 以外、值得一看的其他數字，最多 10 筆 { name, value }：name 寫清楚本週或上週（例如「本週退款」），value 原樣填入資料包的數字或字串，不要換算。",
  "6. 日期時間一律用 upcoming[].label_tw（台灣時間）寫，不要自己從 at（UTC）換算。",
  "7. 廣告：ads.advice 已把每個活動該暫停／減碼／加碼算好，照它的結論寫，不要自己重算或改判斷；ROAS 一律用 trueRoas（真實訂單），不要引用 Meta 自報的 metaRoas。",
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
    max_tokens: 16000,   // adaptive thinking 的思考 tokens 也算在內，給足空間避免 JSON 被截斷
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
  // core 六指標直接從資料包附上（程式算的），不經模型
  const report = { ...sanitizeReport(raw), core: sanitizeCore(pack?.core) };
  return { report, model, usage, cost_usd: Number(estimateCostUsd(usage, model).toFixed(4)) };
}

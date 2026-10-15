import { describe, it, expect, vi } from "vitest";
import { generateReport, buildMessages, estimateCostUsd, SYSTEM_PROMPT, MODEL } from "./generate.js";

const pack = { period: { label: "9/7–9/13" }, orders: { paid: 2 } };

describe("generateReport", () => {
  it("用 claude-opus-5-5、adaptive thinking、effort medium、json_schema 輸出；解析文字區塊 JSON、清洗、算成本", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: JSON.stringify({ headline: "h", highlights: ["a"], risks: [], suggestions: [{ title: "t", why: "w", admin_path: "orders" }, { title: "bad", why: "w", admin_path: "nope" }], metrics: { paid: 2 } }) }],
      usage: { input_tokens: 30000, output_tokens: 2000 },
      stop_reason: "end_turn",
    }));
    const r = await generateReport(pack, { client: { messages: { create } } });
    const req = create.mock.calls[0][0];
    expect(MODEL).toBe("claude-opus-5-5");
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.max_tokens).toBeGreaterThanOrEqual(16000);
    expect(req.thinking).toEqual({ type: "adaptive" });
    expect(req.output_config.effort).toBe("medium");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages[0].content).toContain('"label":"9/7–9/13"');
    expect(r.report.suggestions).toEqual([{ title: "t", why: "w", admin_path: "orders" }]);
    expect(r.usage).toEqual({ input_tokens: 30000, output_tokens: 2000 });
    expect(r.cost_usd).toBeCloseTo(0.12 + 0.04, 4);   // Opus 5.5：$4 輸入／$20 輸出（每百萬）
  });

  it("metrics 以陣列回來時轉成 { name: value } 物件（後台與信件畫表用）", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: JSON.stringify({ headline: "h", highlights: [], risks: [], suggestions: [], metrics: [{ name: "本週已付款訂單", value: "2" }, { name: "上週已付款訂單", value: "5" }] }) }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    }));
    const r = await generateReport(pack, { client: { messages: { create } } });
    expect(r.report.metrics).toEqual({ "本週已付款訂單": "2", "上週已付款訂單": "5" });
  });

  it("refusal 或非 JSON 回應 → 丟可辨識錯誤", async () => {
    const refused = { messages: { create: vi.fn(async () => ({ content: [], stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 0 } })) } };
    await expect(generateReport(pack, { client: refused })).rejects.toThrow(/refusal/);
    const junk = { messages: { create: vi.fn(async () => ({ content: [{ type: "text", text: "not json" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })) } };
    await expect(generateReport(pack, { client: junk })).rejects.toThrow(/parse/);
  });

  it("buildMessages 序列化穩定；SYSTEM_PROMPT 含「資料包」規則；成本估算 Opus 5.5 輸入 $4、Opus 5 輸入 $5（每百萬）", () => {
    expect(buildMessages(pack)[0].content).toBe(buildMessages(pack)[0].content);
    expect(SYSTEM_PROMPT).toMatch(/資料包/);
    expect(SYSTEM_PROMPT).toMatch(/metrics 以陣列回填/);
    expect(estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5-5")).toBe(4);
    expect(estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5")).toBe(5);
  });
});

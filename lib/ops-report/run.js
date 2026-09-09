// lib/ops-report/run.js — cron 與手動共用的一次執行：期間 → 資料包 → 產生 → 寫表 → （cron）寄摘要信。
import Anthropic from "@anthropic-ai/sdk";
import { weeklyPeriod, rollingPeriod } from "./period.js";
import { loadPack } from "./load.js";
import { generateReport } from "./generate.js";
import { buildReportEmail } from "./email.js";
import { renderAdminEmailHtml } from "../newsletter.js";
import { sendNewsletterEmail } from "../brevo-email.js";

export async function runOpsReport(supabase, { triggeredBy = "cron", now = new Date(), env = process.env, client = null } = {}) {
  const period = triggeredBy === "cron" ? weeklyPeriod(now) : rollingPeriod(now);
  if (triggeredBy === "cron") {
    // 同一期間只產生一次（cron 重跑／手動觸發 cron 都冪等）
    const { data: existing } = await supabase.from("ops_reports").select("id").eq("triggered_by", "cron").eq("period_end", period.end.toISOString()).maybeSingle();
    if (existing) return { row: existing, existing: true };
  }
  const pack = await loadPack(supabase, period, { now, env });
  const anthropic = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const { report, model, usage, cost_usd } = await generateReport(pack, { client: anthropic });
  const { data: row, error } = await supabase.from("ops_reports").insert({
    period_start: period.start.toISOString(), period_end: period.end.toISOString(), triggered_by: triggeredBy,
    report, pack, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd,
  }).select("id, period_start, period_end, triggered_by, report, model, input_tokens, output_tokens, cost_usd, emailed_at, created_at").single();
  if (error) throw new Error(error.message);
  if (triggeredBy === "cron" && env.ADMIN_EMAIL) {
    const { subject, bodyMd } = buildReportEmail(report, period.label);
    const r = await sendNewsletterEmail({ to: env.ADMIN_EMAIL, subject, html: renderAdminEmailHtml({ subject, bodyMd, siteUrl: env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com" }), kind: "ops_report" });
    if (r.success) await supabase.from("ops_reports").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { row };
}

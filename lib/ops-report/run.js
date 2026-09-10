// lib/ops-report/run.js — cron 與手動共用的一次執行：期間 → 資料包 → 產生 → 寫表 → （cron）寄摘要信。
import Anthropic from "@anthropic-ai/sdk";
import { weeklyPeriod, rollingPeriod } from "./period.js";
import { loadPack } from "./load.js";
import { generateReport } from "./generate.js";
import { buildReportEmail } from "./email.js";
import { renderAdminEmailHtml } from "../newsletter.js";
import { sendNewsletterEmail } from "../brevo-email.js";

const ROW_COLS = "id, period_start, period_end, triggered_by, report, model, input_tokens, output_tokens, cost_usd, emailed_at, created_at";
const STALE_CLAIM_MS = 15 * 60 * 1000;  // 佔位這麼久還沒填內容＝上次執行中斷（逾時／當掉），可以接手重跑

// cron 冪等：先插一列佔位再產生（同 lib/newsletter-send.js 的 claimSend 想法）。
// 靠 ops_reports 的唯一索引（triggered_by='cron' 時同 period_end 只能一列）擋重疊觸發——
// 「先 select 再 insert」不是原子的，兩次觸發同時進來會產出兩份週報並多付一次模型錢。
export async function claimCronReport(supabase, period) {
  const periodEnd = period.end.toISOString();
  // 唯一索引是權威，但它要人工跑 SQL 才會有（本專案 SQL 一律手動步驟）。索引還沒建時 insert 永遠不會撞
  // 23505，每次 cron 都會多產一份週報並多付一次模型費。先做一次便宜的 select 當退路：
  // 已經有「產好的」那一期就直接回傳，不再重跑。
  const { data: prior } = await supabase.from("ops_reports").select(ROW_COLS)
    .eq("triggered_by", "cron").eq("period_end", periodEnd).maybeSingle();
  if (prior && prior.model) return { existing: prior };

  const { data, error } = await supabase.from("ops_reports")
    .insert({ period_start: period.start.toISOString(), period_end: periodEnd, triggered_by: "cron", report: {}, pack: {} })
    .select(ROW_COLS).single();
  if (!error) return { claimed: data };
  if (error.code !== "23505") throw new Error(error.message);   // 23505＝撞唯一索引
  const { data: existing } = await supabase.from("ops_reports").select(ROW_COLS)
    .eq("triggered_by", "cron").eq("period_end", periodEnd).maybeSingle();
  if (!existing) throw new Error("ops_report_claim_conflict");
  // 只有「還沒填內容又擱置太久」的佔位列才接手；已經產好的那份直接回傳
  if (!existing.model && Date.now() - Date.parse(existing.created_at) > STALE_CLAIM_MS) return { claimed: existing };
  return { existing };
}

export async function runOpsReport(supabase, { triggeredBy = "cron", now = new Date(), env = process.env, client = null } = {}) {
  const period = triggeredBy === "cron" ? weeklyPeriod(now) : rollingPeriod(now);
  let claimed = null;
  if (triggeredBy === "cron") {
    const r = await claimCronReport(supabase, period);
    if (!r.claimed) return { row: r.existing, existing: true };
    claimed = r.claimed;
  }
  let row;
  try {
    const pack = await loadPack(supabase, period, { now, env });
    const anthropic = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { report, model, usage, cost_usd } = await generateReport(pack, { client: anthropic });
    const fields = { report, pack, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd };
    const res = claimed
      ? await supabase.from("ops_reports").update(fields).eq("id", claimed.id).select(ROW_COLS).single()
      : await supabase.from("ops_reports").insert({
          period_start: period.start.toISOString(), period_end: period.end.toISOString(), triggered_by: triggeredBy, ...fields,
        }).select(ROW_COLS).single();
    if (res.error) throw new Error(res.error.message);
    row = res.data;
  } catch (e) {
    // 產生失敗就把佔位列收回（同 releaseSend），不然這一期永遠補不回來
    if (claimed) await supabase.from("ops_reports").delete().eq("id", claimed.id);
    throw e;
  }
  if (triggeredBy === "cron" && env.ADMIN_EMAIL) {
    const { subject, bodyMd } = buildReportEmail(row.report, period.label);
    const r = await sendNewsletterEmail({ to: env.ADMIN_EMAIL, subject, html: renderAdminEmailHtml({ subject, bodyMd, siteUrl: env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com" }), kind: "ops_report" });
    if (r.success) await supabase.from("ops_reports").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { row };
}

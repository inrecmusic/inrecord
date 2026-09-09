import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";
import { runOpsReport } from "@/lib/ops-report/run";

// 後台「立刻產生」：過去 7 天到現在，不寄信；10 分鐘內只允許一次（模型呼叫有成本）。
export const maxDuration = 120;
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data: last } = await sb.from("ops_reports").select("created_at").eq("triggered_by", "manual").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(last.created_at) < 10 * 60 * 1000) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const { row } = await runOpsReport(sb, { triggeredBy: "manual" });
    await logAudit(sb, { actor: payload.email, action: "ops_report.run", targetType: "ops_report", targetId: row.id, meta: { cost_usd: row.cost_usd }, req });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    console.error("[ops-report run]", e?.message || e);
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}

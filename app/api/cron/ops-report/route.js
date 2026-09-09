import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runOpsReport } from "@/lib/ops-report/run";

// 營運週報 cron（每週一 00:00 UTC＝台灣 08:00）。fail-safe：未設 ANTHROPIC_API_KEY 直接跳過，不影響任何功能。
export const maxDuration = 120;
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: true, skipped: "no_api_key" });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });
  try {
    const { row, existing } = await runOpsReport(supabase, { triggeredBy: "cron" });
    return NextResponse.json({ ok: true, id: row.id, existing: !!existing });
  } catch (e) {
    console.error("[ops-report cron]", e?.message || e);
    return NextResponse.json({ ok: false, error: "generate_failed" }, { status: 500 });
  }
}

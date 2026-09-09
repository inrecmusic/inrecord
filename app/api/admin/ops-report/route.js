import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { serverError } from "@/lib/api-error";

// 後台「營運助理」讀取週報：?id= 單份（含 pack）；否則列表（最新在前，不含 pack）。configured＝有沒有 ANTHROPIC_API_KEY。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const configured = !!process.env.ANTHROPIC_API_KEY;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: true, data: [], configured });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 12));
  const q = id
    ? sb.from("ops_reports").select("*").eq("id", id).maybeSingle()
    : sb.from("ops_reports").select("id, period_start, period_end, triggered_by, report, model, input_tokens, output_tokens, cost_usd, emailed_at, created_at").order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data: data ?? (id ? null : []), configured });
}

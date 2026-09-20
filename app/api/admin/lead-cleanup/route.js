import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { listLeadEmails, removeLeadContacts } from "@/lib/brevo-contacts";
import { fetchBuyerEmails, matchBoughtLeads } from "@/lib/lead-cleanup";
import { logAudit } from "@/lib/audit";

// 後台「潛客名單清理」：比對 Brevo 潛客名單與已購買者，把買過課的人移出名單。
// GET  ＝只比對不動作（先看數字與名單）
// POST ＝實際移出（best-effort，逐筆呼叫 Brevo）
//
// 購買當下自動退出名單的機制是 2026-09 才補齊的（notify／webhook／後台手動開通），
// 在那之前就買課又留過信箱的人還在名單裡，靠這支清掉。之後隨時可以再跑一次確認。
export const maxDuration = 300; // 名單可能上千筆，Brevo 移除是逐筆呼叫

async function compare() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: NextResponse.json({ error: "db_not_configured" }, { status: 503 }) };
  const [leads, buyers] = await Promise.all([listLeadEmails(), fetchBuyerEmails(supabase)]);
  return { supabase, leadTotal: leads.length, buyerTotal: buyers.size, matched: matchBoughtLeads(leads, buyers) };
}

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await compare();
    if (r.error) return r.error;
    return NextResponse.json({
      ok: true,
      leadTotal: r.leadTotal,
      buyerTotal: r.buyerTotal,
      matchedCount: r.matched.length,
      matched: r.matched.slice(0, 200), // 只回前 200 筆供檢視，避免回應過大
    });
  } catch (e) {
    // Brevo 未設定或 API 失敗：明確回報，不要讓畫面顯示成「0 筆待清理」
    return NextResponse.json({ error: e?.message || "compare_failed" }, { status: 502 });
  }
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await compare();
    if (r.error) return r.error;
    if (r.matched.length === 0) return NextResponse.json({ ok: true, removed: 0, matchedCount: 0 });

    const { removed } = await removeLeadContacts(r.matched);
    await logAudit(r.supabase, {
      actor: payload.email, action: "leads.cleanup", targetType: "brevo_list", targetId: "leads",
      meta: { leadTotal: r.leadTotal, matchedCount: r.matched.length, removed }, req,
    });
    return NextResponse.json({ ok: true, matchedCount: r.matched.length, removed, failed: r.matched.length - removed });
  } catch (e) {
    return serverError(e, "cleanup_failed");
  }
}

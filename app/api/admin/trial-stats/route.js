import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";
import { buildTrialStats } from "@/lib/trial-stats";

// 後台「試看領取」面板：每天有多少人領取免費試看。
// 資料來源是 email_log 的 kind='trial'——每有人留 Email 就寄一封試看信，寄出即代表領取。
// 用寄信紀錄而不是 Brevo 名單人數：名單只有總數、看不到每日變化，也算不出重複領取。
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const days = Math.min(180, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  const sinceISO = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const rows = await selectAll(sb, "email_log", (q) =>
      q.select("to_email, status, created_at").eq("kind", "trial").gte("created_at", sinceISO));
    return NextResponse.json({ ok: true, days, ...buildTrialStats(rows, { days }) });
  } catch (e) {
    console.error("[trial-stats] failed", e?.message || e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

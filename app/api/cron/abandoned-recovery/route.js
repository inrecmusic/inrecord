import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectRecoveryCandidates, buildRecoveryEmail } from "@/lib/recovery";
import { sendNewsletterEmail } from "@/lib/brevo-email";

// 未成交挽回信 cron（比照 release-coupons）
// 觸發：Vercel Cron（自動帶 Authorization: Bearer <CRON_SECRET>）或手動 curl。
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const minHours = Number(process.env.RECOVERY_AFTER_HOURS || 6);
  const maxHours = Number(process.env.RECOVERY_MAX_HOURS || 48);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const now = new Date();
  const minCutoff = new Date(now.getTime() - minHours * 3600 * 1000).toISOString(); // 早於此＝已滿 minHours
  const maxCutoff = new Date(now.getTime() - maxHours * 3600 * 1000).toISOString(); // 晚於此＝未超過 maxHours

  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, email, plan_label, created_at, status, recovery_sent_at")
    .eq("status", "pending")
    .is("recovery_sent_at", null)
    .lt("created_at", minCutoff)
    .gt("created_at", maxCutoff)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = selectRecoveryCandidates(rows, now, { minHours, maxHours });

  let sent = 0;
  let failed = 0;
  for (const o of candidates) {
    // 原子 claim：只在仍 pending 且未寄過時成功（防重寄＋防與 notify 競態）
    const { data: claimed } = await supabase
      .from("orders")
      .update({ recovery_sent_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("status", "pending")
      .is("recovery_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { subject, html } = buildRecoveryEmail({ planLabel: o.plan_label });
    const r = await sendNewsletterEmail({ to: o.email, subject, html, kind: "recovery" });
    if (r?.success) {
      sent++;
    } else {
      failed++;
      // 寄失敗還原旗標，下輪重試
      await supabase.from("orders").update({ recovery_sent_at: null }).eq("id", o.id);
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, failed, minHours, maxHours });
}

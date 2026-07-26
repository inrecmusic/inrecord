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

  const minHours = Number(process.env.RECOVERY_AFTER_HOURS) || 6;   // 非數字 env → 落回預設(避免 NaN → RangeError)
  const maxHours = Number(process.env.RECOVERY_MAX_HOURS) || 48;

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
  let errors = 0; // DB claim/reset 出錯（有別於「正常搶輸 race」的 !claimed 略過）
  for (const o of candidates) {
    // 原子 claim：只在仍 pending 且未寄過時成功（防重寄＋防與 notify 競態）
    const { data: claimed, error: claimErr } = await supabase
      .from("orders")
      .update({ recovery_sent_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("status", "pending")
      .is("recovery_sent_at", null)
      .select("id")
      .maybeSingle();
    if (claimErr) { errors++; console.error("[recovery] claim failed", o.id, claimErr.message); continue; }
    if (!claimed) continue; // 已被別輪或已 paid，正常略過

    let ok = false;
    try {
      const { subject, html } = buildRecoveryEmail({ planLabel: o.plan_label });
      const r = await sendNewsletterEmail({ to: o.email, subject, html, kind: "recovery" });
      ok = !!r?.success;
    } catch (e) {
      console.error("[recovery] send threw", o.id, e?.message || e);
    }
    if (ok) { sent++; continue; }

    // 寄失敗/拋錯 → 還原旗標，下輪重試（不讓該筆永久卡在 claimed）
    failed++;
    const { error: resetErr } = await supabase.from("orders").update({ recovery_sent_at: null }).eq("id", o.id);
    if (resetErr) { errors++; console.error("[recovery] reset failed", o.id, resetErr.message); }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, failed, errors, minHours, maxHours });
}

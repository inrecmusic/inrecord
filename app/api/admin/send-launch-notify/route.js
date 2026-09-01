import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { runLaunchNotify } from "@/lib/launch-notify";
import { sendLaunchEmail } from "@/lib/brevo-email";
import { logAudit } from "@/lib/audit";

export const maxDuration = 300; // 逐封寄開課信、給足執行時間（避免逾時中斷、靠 per-email 記錄續寄）

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  // 後台手動：不檢查 isClassroomOpen（營運者明確要寄）；CAS 仍保證只寄一次
  const r = await runLaunchNotify(sb, { sendLaunchEmail });
  await logAudit(sb, { actor: payload.email, action: "launch_notify.send", targetType: "launch_notify", meta: { total: r.total, sent: r.sent, pending: r.pending, errors: (r.errors || []).length }, req });
  return NextResponse.json({ ok: true, ...r });
}

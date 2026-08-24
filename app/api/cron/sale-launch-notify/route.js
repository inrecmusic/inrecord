import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runLaunchNotify } from "@/lib/launch-notify";
import { sendLaunchEmail } from "@/lib/brevo-email";
import { isClassroomOpen } from "@/lib/sale";

export const maxDuration = 300; // 逐封寄開課信、給足執行時間（避免逾時中斷、靠 per-email 記錄續寄）

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // fail-safe：開課通知預設「不自動寄」，改由後台「立即寄送開課通知」按鈕人工觸發
  // （避免課程內容尚未上架就自動通知全體買家）。要恢復自動＝設 AUTO_LAUNCH_NOTIFY=on。
  if (process.env.AUTO_LAUNCH_NOTIFY !== "on") {
    return NextResponse.json({ ok: true, skipped: "auto_disabled" });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 500 });

  // 僅在「課程已開放」時才寄（override='locked' 不誤發）
  const { data: settings } = await sb.from("sale_settings").select("open_at, lock_override").eq("id", "default").maybeSingle();
  if (!isClassroomOpen(settings, new Date())) {
    return NextResponse.json({ ok: true, skipped: "not_open" });
  }
  const r = await runLaunchNotify(sb, { sendLaunchEmail });
  return NextResponse.json({ ok: true, ...r });
}

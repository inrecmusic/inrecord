import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runLaunchNotify } from "@/lib/launch-notify";
import { sendLaunchEmail } from "@/lib/brevo-email";
import { isClassroomOpen } from "@/lib/sale";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

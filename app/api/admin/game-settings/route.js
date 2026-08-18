import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// 後台：互動遊戲設定（目前僅 device_limit，同時登入裝置上限）。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("game_settings")
    .select("device_limit")
    .eq("id", "default")
    .single();
  if (error) return serverError(error);
  return NextResponse.json({ device_limit: data?.device_limit ?? 3 });
}

export async function PATCH(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const n = parseInt(body.device_limit, 10);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    return NextResponse.json({ error: "device_limit 需為 1–20 整數" }, { status: 400 });
  }

  const { error } = await supabase
    .from("game_settings")
    .update({ device_limit: n, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, device_limit: n });
}

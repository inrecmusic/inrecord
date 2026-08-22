import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";

// 粗略解析 UA → { device, browser }（登入裝置顯示用，非精準）。
function parseUA(ua = "") {
  const s = String(ua || "").slice(0, 400); // 截斷：UA 為攻擊者可控，避免超長字串觸發正規式回溯（ReDoS）
  let device = "未知裝置";
  if (/iPhone/.test(s)) device = "iPhone";
  else if (/iPad/.test(s)) device = "iPad";
  else if (/Android/.test(s)) { const m = s.match(/Android[^;)]*;\s*([^;)]{1,60}?)\s*(?:Build|\))/); device = m ? m[1].trim() : "Android 裝置"; }
  else if (/Macintosh|Mac OS X/.test(s)) device = "Mac";
  else if (/Windows NT/.test(s)) device = "Windows";
  else if (/Linux/.test(s)) device = "Linux";

  let browser = "", m;
  if ((m = s.match(/Edg(?:e|A|iOS)?\/(\d+)/))) browser = "Edge " + m[1];
  else if ((m = s.match(/OPR\/(\d+)/))) browser = "Opera " + m[1];
  else if ((m = s.match(/Firefox\/(\d+)/))) browser = "Firefox " + m[1];
  else if (/Chrome|CriOS/.test(s) && (m = s.match(/(?:Chrome|CriOS)\/(\d+)/))) browser = "Chrome " + m[1];
  else if (/Safari/.test(s) && (m = s.match(/Version\/(\d+)/))) browser = "Safari " + m[1];
  return { device, browser };
}

// GET：列出本人所有上課裝置（新→舊）。
export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  const { data, error } = await supabase
    .from("game_devices")
    .select("device_id, user_agent, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });
  if (error) return serverError(error);

  const devices = (data || []).map((d) => ({
    device_id: d.device_id,
    ...parseUA(d.user_agent),
    created_at: d.created_at,
    last_seen_at: d.last_seen_at,
  }));
  return NextResponse.json({ ok: true, devices });
}

// DELETE ?device_id=X：登出（移除）某台裝置，釋出一個裝置名額。
export async function DELETE(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  const deviceId = new URL(req.url).searchParams.get("device_id");
  if (!deviceId) return NextResponse.json({ error: "missing_device_id" }, { status: 400 });

  const { error } = await supabase
    .from("game_devices").delete().eq("user_id", user.id).eq("device_id", deviceId);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}

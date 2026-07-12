// 學員端 API 共用授權閘：驗 Bearer JWT →（可選）驗已購課，回 { user, supabase } 或 { res }。
// 取代先前散落在各 classroom 路由的重複樣板（含 notes/quizzes 各自的 gate()）。
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { hasCourseAccess } from "./course-access";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// requireCourse=true（預設）：需已購課，未購課回 403。
// requireCourse=false：只需登入（如「我的訂單」），不驗購課。
// 成功回 { user, supabase(admin service-role) }；任何失敗回 { res: NextResponse }（呼叫端 `if (g.res) return g.res`）。
export async function requireClassroomAuth(req, { requireCourse = true } = {}) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: { user }, error } = await getUserClient(token).auth.getUser();
  if (error || !user || !user.email) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { res: NextResponse.json({ error: "db_not_configured" }, { status: 503 }) };
  if (requireCourse && !(await hasCourseAccess(supabase, user.email))) {
    return { res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user, supabase };
}

import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { mergeStudents } from "@/lib/admin-students";
import { selectAll } from "@/lib/supabase-paginate";

// auth.users 分頁取完（listUsers 單次上限 1000）
async function listAllAuthUsers(supabase) {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

// 後台「學員管理」名單：實際學員（enrollments＋已付款 orders 聯絡資訊）∪ 體驗名單（course_preview_leads）。
// 解決 concert / WordPress 現場購買者（只進 orders+enrollments、不進 leads）在學員管理看不到的問題。
export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [], total: 0 });

  try {
    // 全部走 selectAll 分頁：名單量超過 1000 列時不會被 PostgREST 預設上限截斷
    const [enrollments, orders, leads, profiles] = await Promise.all([
      selectAll(supabase, "enrollments", q => q.select("email,enrolled_at,course_id")),
      selectAll(supabase, "orders", q => q.select("email,phone,plan,plan_label,source,status,created_at").eq("status", "paid")),
      selectAll(supabase, "course_preview_leads", q => q.select("id,email,source,status,created_at").order("created_at", { ascending: false })),
      selectAll(supabase, "student_profiles", q => q.select("email, real_name, phone, level, source, age_group, gender")),
    ]);

    const data = mergeStudents({ enrollments, orders, leads, profiles });

    // 學習進度：progress 以 user_id 記錄、名單以 email 為主鍵 → 經 auth.users 對照。
    // 失敗不影響名單本體（進度欄留空即可）。
    try {
      const [prog, { count: totalVideos }, { data: authUsers }] = await Promise.all([
        selectAll(supabase, "progress", q => q.select("user_id, completed, viewed_seconds, watched_at")),
        supabase.from("videos").select("id", { count: "exact", head: true }).eq("published", true),
        listAllAuthUsers(supabase).then(users => ({ data: users })),
      ]);
      const idToEmail = new Map((authUsers || []).map(u => [u.id, (u.email || "").trim().toLowerCase()]));
      const byEmail = new Map();
      for (const p of prog || []) {
        const em = idToEmail.get(p.user_id);
        if (!em) continue;
        const acc = byEmail.get(em) || { completedCount: 0, viewedSeconds: 0, lastWatchedAt: null };
        if (p.completed) acc.completedCount++;
        acc.viewedSeconds += Number(p.viewed_seconds) || 0;
        if (p.watched_at && (!acc.lastWatchedAt || p.watched_at > acc.lastWatchedAt)) acc.lastWatchedAt = p.watched_at;
        byEmail.set(em, acc);
      }
      const total = totalVideos || 0;
      for (const s of data) {
        const acc = byEmail.get((s.email || "").trim().toLowerCase());
        s.progress = acc
          ? { ...acc, totalVideos: total, percentage: total ? Math.round((acc.completedCount / total) * 100) : 0 }
          : { completedCount: 0, viewedSeconds: 0, lastWatchedAt: null, totalVideos: total, percentage: 0 };
      }
    } catch (e) {
      console.error("[admin students] 進度彙整失敗（名單照常回傳）:", e?.message || e);
    }

    return NextResponse.json({ ok: true, data, total: data.length });
  } catch (err) {
    return serverError(err);
  }
}

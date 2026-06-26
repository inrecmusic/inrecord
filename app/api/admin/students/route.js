import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { mergeStudents } from "@/lib/admin-students";

// 後台「學員管理」名單：實際學員（enrollments＋已付款 orders 聯絡資訊）∪ 體驗名單（course_preview_leads）。
// 解決 concert / WordPress 現場購買者（只進 orders+enrollments、不進 leads）在學員管理看不到的問題。
export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [], total: 0 });

  try {
    const [enr, ord, lead] = await Promise.all([
      supabase.from("enrollments").select("email,enrolled_at,course_id"),
      supabase.from("orders").select("email,phone,plan,plan_label,source,status,created_at").eq("status", "paid"),
      supabase.from("course_preview_leads").select("id,email,source,status,created_at").order("created_at", { ascending: false }),
    ]);
    if (enr.error) throw enr.error;
    if (ord.error) throw ord.error;
    if (lead.error) throw lead.error;

    const data = mergeStudents({
      enrollments: enr.data || [],
      orders: ord.data || [],
      leads: lead.data || [],
    });
    return NextResponse.json({ ok: true, data, total: data.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

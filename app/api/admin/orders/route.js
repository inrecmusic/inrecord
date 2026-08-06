import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";
import { markEnrolled } from "@/lib/order-enrolled";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [] });

  try {
    const data = await selectAll(supabase, "orders", q =>
      q.select("*").order("created_at", { ascending: false })
    );
    // 撈已開通 email（enrollments 是官網訂單開通與否的權威來源；分頁避免 >1000 列 truncate）
    const enr = await selectAll(supabase, "enrollments", (q) =>
      q.select("email").eq("course_id", "piano-101")
    );
    const withEnrolled = markEnrolled(data, enr.map((e) => e.email));
    return NextResponse.json({ ok: true, data: withEnrolled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

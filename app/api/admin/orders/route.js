import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";
import { markEnrolled } from "@/lib/order-enrolled";
import { autoInvoiceEnabled } from "@/lib/order-fulfillment";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [], autoInvoice: autoInvoiceEnabled(process.env) });

  try {
    const data = await selectAll(supabase, "orders", q =>
      q.select("*").order("created_at", { ascending: false })
    );
    // 撈已開通 email（enrollments 是官網訂單開通與否的權威來源；分頁避免 >1000 列 truncate）
    const enr = await selectAll(supabase, "enrollments", (q) =>
      q.select("email").eq("course_id", "piano-101")
    );
    const withEnrolled = markEnrolled(data, enr.map((e) => e.email));
    // autoInvoice：自動開票關閉時（發票人工另外開），後台不顯示「發票待補開」告警；
    // 之後設 AUTO_INVOICE=on 恢復自動開票，告警會自己回來，不必改程式。
    return NextResponse.json({ ok: true, data: withEnrolled, autoInvoice: autoInvoiceEnabled(process.env) });
  } catch (err) {
    return serverError(err);
  }
}

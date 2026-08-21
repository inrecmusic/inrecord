import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantAccess } from "@/lib/fulfillment-grant";
import { pickUngrantedPayuni } from "@/lib/order-enrolled";
import { selectAll } from "@/lib/supabase-paginate";
import { logAudit } from "@/lib/audit";

// 後台手動開通官網(payuni)已付款訂單。body { ids?: string[] }：
//   給 ids → 只開通這些（仍過濾成 payuni+paid+未開通）；不給 → 全部未開通官網訂單。
// 現有 /api/admin/grant-access 硬篩 source∈{wordpress,concert}，官網單撈不到，故另立此端點。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : null;

  const supabase = getSupabaseAdmin();

  try {
    // 撈候選官網已付款訂單（給 ids 就限縮）。用 selectAll 分頁，避免 >1000 筆時「全部開通」被 PostgREST 預設上限靜默截斷而漏開。
    // ids===null（body 沒帶 ids）→ 全部；ids 為陣列（含空陣列 []）→ 用 .in 限縮，[] 撈 0 筆＝no-op（避免誤開全部）。
    const orders = await selectAll(supabase, "orders", (q) => {
      const base = q.select("id, email, grant_email, plan, plan_label, source, status")
        .eq("source", "payuni").eq("status", "paid");
      return ids ? base.in("id", ids) : base;
    });

    // 撈已開通 email → 篩出真正未開通者（分頁避免 >1000 列 truncate）
    const enr = await selectAll(supabase, "enrollments", (q) => q.select("email").eq("course_id", "piano-101"));
    const pending = pickUngrantedPayuni(orders || [], enr.map((e) => e.email));

    const now = new Date().toISOString();
    let granted = 0, failed = 0;
    const errors = [];
    for (const o of pending) {
      const g = await grantAccess(supabase, o);
      if (g.ok) {
        granted++;
        await supabase.from("orders").update({ access_granted_at: now }).eq("id", o.id);
      } else {
        failed++;
        errors.push(`${o.email}: ${g.errors.join("; ")}`);
      }
    }

    await logAudit(supabase, {
      actor: payload.email, action: "grant_orders",
      targetType: "orders", targetId: ids ? ids.join(",") : "all_pending",
      meta: { granted, failed }, req,
    });

    return NextResponse.json({ ok: true, granted, failed, errors });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { grantAccess } from "@/lib/fulfillment-grant";
import { fetchPendingLeads } from "@/lib/admin-leads";
import { logAudit } from "@/lib/audit";

// 後台手動批次「開通課程存取」給付款名單（WooCommerce + concert-shop），建 enrollments，bundle 另加 subscriptions。
// Body { ids?: string[] }：給 ids 只開通這些；不給則對「全部未開通」。已開通(access_granted_at 非空)自動跳過。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { ids } = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: orders, error } = await fetchPendingLeads(supabase, {
    columns: "id, email, plan",
    flagColumn: "access_granted_at",
    ids,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let granted = 0, failed = 0;
  const errors = [];
  for (const order of orders || []) {
    if (!order.email) { failed++; errors.push(`${order.id}: missing_email`); continue; }
    const res = await grantAccess(supabase, order);
    if (res.ok) {
      await supabase.from("orders").update({ access_granted_at: new Date().toISOString() }).eq("id", order.id);
      granted++;
    } else {
      failed++; errors.push(`${order.id}: ${res.errors.join("; ")}`);
    }
  }

  if (granted > 0) await logAudit(supabase, { actor: payload.email, action: "course.grant.batch", targetType: "leads", targetId: ids ? ids.join(",") : "all_pending", meta: { granted, failed }, req });

  return NextResponse.json({ ok: true, granted, failed, errors });
}

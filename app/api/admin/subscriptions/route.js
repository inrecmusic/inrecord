import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  let data;
  try {
    data = await selectAll(supabase, "subscriptions", q =>
      q.select("*").order("created_at", { ascending: false })
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { email, plan_type, expires_at } = await req.json();
  if (!email || !plan_type || !expires_at) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const { data, error } = await supabase.from("subscriptions").insert({
    email,
    plan_type,
    status:     "active",
    expires_at: new Date(expires_at).toISOString(),
    source:     "manual",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { id, action } = await req.json();
  if (!id || !action) return NextResponse.json({ error: "missing_params" }, { status: 400 });

  if (action === "cancel") {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "extend_month") {
    const { data: sub, error: fetchErr } = await supabase
      .from("subscriptions")
      .select("expires_at")
      .eq("id", id)
      .single();
    if (fetchErr || !sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const newExpiry = new Date(sub.expires_at);
    newExpiry.setMonth(newExpiry.getMonth() + 1);

    const { error } = await supabase
      .from("subscriptions")
      .update({ expires_at: newExpiry.toISOString(), status: "active" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

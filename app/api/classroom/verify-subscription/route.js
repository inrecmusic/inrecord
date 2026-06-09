import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

const EMPTY = { hasSubscription: false, daysLeft: 0, planType: null, expiresAt: null };

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json(EMPTY, { status: 401 });

  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json(EMPTY, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json(EMPTY);

  const { data } = await supabase
    .from("subscriptions")
    .select("id, plan_type, expires_at, status")
    .eq("email", user.email)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    hasSubscription: !!data,
    expiresAt: data?.expires_at || null,
    planType: data?.plan_type || null,
    daysLeft: data ? Math.ceil((new Date(data.expires_at) - new Date()) / 86400000) : 0,
  });
}

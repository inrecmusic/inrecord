import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ hasSubscription: false, daysLeft: 0, planType: null, expiresAt: null });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ hasSubscription: false, daysLeft: 0, planType: null, expiresAt: null });

  const { data } = await supabase
    .from("subscriptions")
    .select("id, plan_type, expires_at, status")
    .eq("email", email)
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

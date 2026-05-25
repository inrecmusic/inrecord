import { getSupabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ hasPurchased: false });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ hasPurchased: false });

  const { data } = await supabase
    .from("enrollments")
    .select("id")
    .eq("email", email)
    .eq("course_id", "piano-101")
    .single();

  return NextResponse.json({ hasPurchased: !!data });
}

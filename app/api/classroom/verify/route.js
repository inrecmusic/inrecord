import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getUserClient(token);
  const { data: { user }, error: authErr } = await db.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("orders")
    .select("id")
    .eq("email", user.email)
    .eq("status", "paid")
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ ok: false, error: "no_purchase" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

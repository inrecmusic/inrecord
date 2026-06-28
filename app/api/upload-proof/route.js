import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateProofImage } from "@/lib/proof-image";

export async function POST(req) {
  // Require authenticated Supabase user
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const v = validateProofImage(buf, file.type);
    if (!v.ok) return NextResponse.json({ url: null, error: v.error }, { status: 400 });
    const ext = v.ext;
    const filename = `proofs/${randomUUID()}.${ext}`; // CSPRNG 不可枚舉檔名（公開 bucket 下降低被猜中風險）

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ url: null });

    const { error } = await supabase.storage
      .from("proof-uploads")
      .upload(filename, buf, { contentType: file.type, upsert: false });

    if (error) {
      console.error("[upload-proof] storage error:", error.message);
      return NextResponse.json({ url: null });
    }

    const { data: urlData } = supabase.storage
      .from("proof-uploads")
      .getPublicUrl(filename);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("[upload-proof error]", err);
    return NextResponse.json({ url: null });
  }
}

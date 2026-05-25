import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function isValidImageBytes(buf, mime) {
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === "image/png")  return buf[0] === 0x89 && buf[1] === 0x50;
  return false;
}

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

    const allowed = ["image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "invalid_type" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 400 });
    }

    const buffer = Buffer.from(bytes);
    if (!isValidImageBytes(buffer, file.type)) {
      return NextResponse.json({ error: "invalid_file" }, { status: 400 });
    }
    const ext = file.type === "image/png" ? "png" : "jpg";
    const filename = `proofs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ url: null });

    const { error } = await supabase.storage
      .from("proof-uploads")
      .upload(filename, buffer, { contentType: file.type, upsert: false });

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

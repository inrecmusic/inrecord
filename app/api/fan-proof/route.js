import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateProofImage } from "@/lib/proof-image";
import { isFanProofOpen, buildFanCoupon } from "@/lib/fan-proof";
import { generateCode } from "@/lib/serial-codes";

export async function POST(req) {
  // 1) 截止 gate（伺服器端）
  if (!isFanProofOpen()) {
    return Response.json({ ok: false, error: "closed" }, { status: 403 });
  }

  // 2) 驗證登入（Bearer JWT）——比照 upload-proof 的實際寫法：
  //    以 anon key + Authorization header 建立 user client，再呼叫 getUser()
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user?.email) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 3) 讀檔 + 驗證
  let file;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return Response.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const v = validateProofImage(buf, file.type);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });

  // 4) 上傳到 proof-uploads（service role，比照 upload-proof 的 getSupabaseAdmin()）
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ ok: false, error: "db_not_configured" }, { status: 503 });
  }

  const filename = `proofs/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${v.ext}`;
  const { error: upErr } = await supabase.storage
    .from("proof-uploads")
    .upload(filename, buf, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[fan-proof] storage error:", upErr.message);
    return Response.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
  const { data: urlData } = supabase.storage.from("proof-uploads").getPublicUrl(filename);
  const proofUrl = urlData.publicUrl;

  // 5) 發一次性粉絲定價券（prefix="FAN" → 格式 FAN-XXXXXXXX；碰撞極低，最多重試一次）
  let couponCode = null;
  for (let i = 0; i < 2 && !couponCode; i++) {
    const code = generateCode("FAN", 8);
    const { error } = await supabase.from("coupons").insert(buildFanCoupon({ code }));
    if (!error) couponCode = code;
    // error.code === "23505" → 碰撞，下一輪重試；其他錯誤繼續嘗試一次
  }
  if (!couponCode) {
    return Response.json({ ok: false, error: "coupon_failed" }, { status: 500 });
  }

  return Response.json({ ok: true, couponCode, proofUrl });
}

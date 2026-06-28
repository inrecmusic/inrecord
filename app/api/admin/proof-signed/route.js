import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

const BUCKET = "proof-uploads";

// 從已存的 proof_url（supabase 公開式 URL 或 bucket 內路徑）解析出 bucket 內路徑
function extractPath(proofUrl) {
  if (typeof proofUrl !== "string" || !proofUrl) return null;
  const marker = `/${BUCKET}/`;
  const i = proofUrl.indexOf(marker);
  if (i >= 0) return proofUrl.slice(i + marker.length);
  if (/^proofs\//.test(proofUrl)) return proofUrl; // 已是路徑
  return null;
}

// 後台檢視粉絲/購買憑證：proof-uploads 改私有 bucket 後，公開 URL 失效；
// 由此端點（驗 admin token）以 service role 簽發短期 signed URL 給後台顯示。
export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { url } = await req.json().catch(() => ({}));
  const path = extractPath(url);
  if (!path) return NextResponse.json({ error: "invalid_proof" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300); // 5 分鐘
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signedUrl: data.signedUrl });
}

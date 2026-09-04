import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { summarizeBilling } from "@/lib/bunny-usage";

// 後台「訂閱費用」的 Bunny 即時用量：本月累計費用／流量／帳戶餘額。
// billing API 只認「帳號」層級 API key（影片庫 key 會 401），故先讀 BUNNY_ACCOUNT_API_KEY、沒有才退回 BUNNY_API_KEY。
// fetch 帶 revalidate 600 → 伺服器端快取 10 分鐘，後台怎麼開都不會狂打 Bunny。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.BUNNY_ACCOUNT_API_KEY || process.env.BUNNY_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "missing_bunny_config" });
  try {
    const res = await fetch("https://api.bunny.net/billing", {
      headers: { AccessKey: key, Accept: "application/json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `bunny_${res.status}` }, { status: 502 });
    const billing = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ...summarizeBilling(billing) });
  } catch {
    return NextResponse.json({ ok: false, error: "bunny_unreachable" }, { status: 502 });
  }
}

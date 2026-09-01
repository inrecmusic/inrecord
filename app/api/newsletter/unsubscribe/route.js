import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyUnsubscribeToken, recordUnsubscribe } from "@/lib/unsubscribe";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

// 公開端點：退訂電子報。憑 email＋HMAC 簽章（信中專屬連結）才有效，拿不到簽章就不能幫別人退訂。
// 兩種呼叫：① /unsubscribe 頁的確認表單（form POST 含 confirm=1）→ 303 回頁面顯示結果；
//           ② 信箱服務商 RFC 8058 一鍵退訂（List-Unsubscribe-Post，body=List-Unsubscribe=One-Click）→ JSON。
const limiter = createDistributedLimiter({ limit: 20, windowMs: 60_000, prefix: "rl:unsubscribe" });

export async function POST(req) {
  const rl = await limiter(clientIp(req));
  if (!rl.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const url = new URL(req.url);
  let email = url.searchParams.get("e") || "";
  let token = url.searchParams.get("t") || "";
  let isForm = false;
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (fd) {
      email = String(fd.get("e") || email);
      token = String(fd.get("t") || token);
      isForm = fd.get("confirm") === "1";
    }
  }
  const back = (qs) => NextResponse.redirect(new URL(`/unsubscribe?${qs}`, url.origin), 303);

  if (!verifyUnsubscribeToken(email, token)) {
    return isForm ? back("error=invalid") : NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return isForm ? back("error=server") : NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 503 });
  try {
    await recordUnsubscribe(supabase, email, isForm ? "link" : "one-click");
  } catch (e) {
    console.error("[unsubscribe]", e?.message || e);
    return isForm ? back("error=server") : NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
  return isForm ? back("done=1") : NextResponse.json({ ok: true });
}

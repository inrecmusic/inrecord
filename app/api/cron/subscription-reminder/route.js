import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const now            = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: expiringSubs, error } = await supabase
    .from("subscriptions")
    .select("email, plan_type, expires_at")
    .eq("status", "active")
    .gte("expires_at", now.toISOString())
    .lte("expires_at", sevenDaysLater.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!expiringSubs?.length) return NextResponse.json({ ok: true, sent: 0 });

  const brevoKey    = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@inrecord.com";
  const senderName  = process.env.BREVO_SENDER_NAME  || "InRecord";
  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecord-swart.vercel.app";

  let sent = 0;
  for (const sub of expiringSubs) {
    const expiresDate = new Date(sub.expires_at).toLocaleDateString("zh-TW");
    const daysLeft    = Math.ceil((new Date(sub.expires_at) - now) / 86400000);

    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method:  "POST",
        headers: { "api-key": brevoKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to:     [{ email: sub.email }],
          subject: "你的 InRecord AI 遊戲訂閱即將到期",
          htmlContent: `
            <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
              <h2 style="margin:0 0 16px;color:#1d1d1f">🎮 你的 AI 遊戲訂閱即將到期</h2>
              <p style="color:#374151">你好！</p>
              <p style="color:#374151">你的 InRecord AI 互動遊戲訂閱將於 <strong>${expiresDate}</strong>（還有 ${daysLeft} 天）到期。</p>
              <p style="color:#374151">為了不中斷你的學習，建議提前續訂：</p>
              <div style="margin:24px 0;display:flex;gap:12px;flex-wrap:wrap">
                <a href="${siteUrl}/#subscription"
                   style="display:inline-block;background:#0071E3;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;font-weight:600">
                  月繳 NT$399 立即續訂
                </a>
                <a href="${siteUrl}/#subscription"
                   style="display:inline-block;background:#1c1c1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:24px;font-weight:600">
                  年繳 NT$1,499 最划算
                </a>
              </div>
              <p style="color:#6b7280;font-size:13px">選擇年繳方案相當於多獲得 8 個月，省下 NT$3,289。</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
              <p style="color:#9ca3af;font-size:12px">InRecord｜零基礎流行鋼琴入門課</p>
            </div>
          `,
        }),
      });
      sent++;
    } catch (e) {
      console.error("[subscription-reminder] email error", sub.email, e);
    }
  }

  return NextResponse.json({ ok: true, sent, total: expiringSubs.length });
}

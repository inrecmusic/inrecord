import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { addLeadContact } from "@/lib/brevo-contacts";
import { normalizeEmail } from "@/lib/unsubscribe";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { buildTrialEmail, buildTrialPath } from "@/lib/trial";
import { sendLead } from "@/lib/meta-capi";

// 公開端點：首頁「留下 Email」→ 加進 Brevo 潛客清單。單次同意：勾選（consent=true）才收，送出即進名單。
// 名單只存 Brevo（BREVO_LIST_ID）；屬性記來源／同意時間／UTM 來源，之後看得出哪個廣告帶來多少名單。
// 進名單後立刻寄「免費試看」信（Email 專屬簽章連結 → /trial）；信寄失敗不影響已進名單，回 trialSent=false 讓前端提示。
// 三道閘門（都走 lib/rate-limit 的 Upstash 限流器，缺 Redis 退回記憶體）：
//   ① IP 5 次/分 —— 擋單機灌爆
//   ② 同一 email 1 小時 1 封 —— 擋「信箱轟炸」（拿別人的信箱狂按，一小時內只會寄出第一封）
//   ③ 全站每日 500 封（LEAD_TRIAL_DAILY_LIMIT 可調）—— 擋分散式灌爆把 Brevo 月額度燒光
//      （額度一空，登入驗證碼／重設密碼／購課信也全寄不出去）
// 第一封永遠即時寄出；被 ②③ 擋下的仍會進名單、回 200，只是不再重寄。
const limiter = createDistributedLimiter({ limit: 5, windowMs: 60_000, prefix: "rl:subscribe" });
const perEmail = createDistributedLimiter({ limit: 1, windowMs: 3_600_000, prefix: "rl:subscribe:email" });
const daily = createDistributedLimiter({ limit: Number(process.env.LEAD_TRIAL_DAILY_LIMIT) || 500, windowMs: 86_400_000, prefix: "rl:subscribe:day" });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 前端傳來、原樣要送給 Meta 的值：限字串＋長度，非法就當沒帶（不可讓客戶端塞任意內容）
const str = (v, max) => (typeof v === "string" && v && v.length <= max ? v : undefined);
const UTM_ATTRS = { utm_source: "UTM_SOURCE", utm_medium: "UTM_MEDIUM", utm_campaign: "UTM_CAMPAIGN" };

export async function POST(req) {
  // fail-safe 開關：LEAD_CAPTURE 未設＝功能未開放（首頁不顯示表單；直接打 API 也拒絕）
  if (process.env.LEAD_CAPTURE !== "on") return NextResponse.json({ ok: false, error: "not_available" }, { status: 503 });
  const rl = await limiter(clientIp(req));
  if (!rl.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });

  const attributes = { SOURCE: "website", CONSENT_AT: new Date().toISOString() };
  const attr = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  for (const [key, name] of Object.entries(UTM_ATTRS)) {
    if (typeof attr[key] === "string" && attr[key]) attributes[name] = attr[key].slice(0, 100);
  }

  const r = await addLeadContact({ email, attributes });
  if (!r.ok) {
    console.error("[subscribe] brevo failed:", r.error, r.detail || "");
    return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "missing_brevo_config" ? 503 : 502 });
  }
  // ② 同一 email 一小時只寄一封：名單照進（addLeadContact 冪等），但不再重寄試看信。
  //    放在 Brevo 成功之後才扣額度：Brevo 暫時故障回 502 時，使用者一小時內重試才不會被當成「已寄過」而收不到信。
  const fresh = (await perEmail(email)).allowed;
  // 之前按過「取消訂閱」又回來留信箱＝重新同意 → 從退訂名單移除（失敗不影響訂閱結果）
  try {
    const sb = getSupabaseAdmin();
    if (sb) await sb.from("newsletter_unsubscribes").delete().eq("email", email);
  } catch (e) {
    console.error("[subscribe] unsubscribe cleanup failed:", e?.message || e);
  }
  // 伺服器端補送 Meta Lead：瀏覽器端的 fbq 會被追蹤保護／廣告攔截器擋掉，送出後又緊接著跳頁，
  // 而 Meta 的廣告優化只認它自己收到的事件。這裡用與前端相同的 eventId，Meta 會自動去重。
  // 永不拋、不擋回應：CAPI 掛掉不能害人留不了信箱。
  // .catch 是保險：sendLead 內部已 guarded，但留信箱是主功能，
  // 絕不能因為附加的追蹤出事就讓使用者留不了信箱、看不到試看。
  const capi = await sendLead({
    email,
    // 白名單＋長度限制（同 checkout 的 capi_data）：這些值會原樣送給 Meta，不可讓前端塞任意內容
    eventId: str(body.eventId, 64),
    fbp: str(body.fbp, 128),
    fbc: str(body.fbc, 256),
    ip: clientIp(req),
    ua: (req.headers.get("user-agent") || "").slice(0, 512) || undefined,
  }).catch((e) => ({ ok: false, error: e?.message || "capi_threw" }));
  if (capi?.ok === false) console.error("[subscribe] meta capi lead failed:", capi.error);

  // trialPath＝當場就能看的簽章連結（相對路徑）。三種結果都回：廣告點擊已經付過錢，
  // 不該再讓人為了看試看跑去收信；② ③ 被擋下沒寄信的更需要它，否則畫面說「已寄出」但信箱什麼都沒有。
  const trialPath = buildTrialPath(email);
  if (!fresh) return NextResponse.json({ ok: true, trialSent: true, deduped: true, trialPath });
  // ③ 全站每日上限：超過就不寄（名單已進），trialSent=false 讓前端提示會補寄
  if (!(await daily("all")).allowed) {
    console.error("[subscribe] daily trial-email cap reached");
    return NextResponse.json({ ok: true, trialSent: false, capped: true, trialPath });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const { subject, html, unsubscribeUrl } = buildTrialEmail({ email, siteUrl });
  const mail = await sendNewsletterEmail({ to: email, subject, html, unsubscribeUrl, kind: "trial" });
  if (!mail.success) console.error("[subscribe] trial email failed:", mail.error);
  return NextResponse.json({ ok: true, trialSent: mail.success === true, trialPath });
}

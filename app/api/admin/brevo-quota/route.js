import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { pickSendLimitPlan, planWindow, quotaSummary } from "@/lib/brevo-quota";

// 後台電子報的 Brevo 額度儀表：方案上限 −「該期間已寄」（aggregatedReport requests，
// 含 SMTP 的 Auth 驗證信）。期間由方案決定，見 lib/brevo-quota.js：免費方案是每天，
// 付費方案是計費週期。account 的 credits 是固定上限、不會隨寄送遞減，故用統計反推；
// 僅供儀表參考，硬上限仍由 Brevo 把關。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "missing_brevo_config" });
  const H = { "api-key": apiKey };
  try {
    const accRes = await fetch("https://api.brevo.com/v3/account", { headers: H, cache: "no-store" });
    if (!accRes.ok) return NextResponse.json({ ok: false, error: `brevo_${accRes.status}` }, { status: 502 });
    const acc = await accRes.json().catch(() => ({}));

    // 期間要先知道方案，才知道統計要撈今天還是整個計費週期
    const { start, end } = planWindow(pickSendLimitPlan(acc));
    const repRes = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${start}&endDate=${end}`,
      { headers: H, cache: "no-store" },
    );
    if (!repRes.ok) return NextResponse.json({ ok: false, error: `brevo_${repRes.status}` }, { status: 502 });
    const rep = await repRes.json().catch(() => ({}));

    return NextResponse.json({ ok: true, ...quotaSummary(acc, rep.requests) });
  } catch {
    return NextResponse.json({ ok: false, error: "brevo_unreachable" }, { status: 502 });
  }
}

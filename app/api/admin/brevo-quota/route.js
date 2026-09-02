import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";

// 後台電子報「今日 Brevo 額度」顯示用：方案上限（account.plan credits，免費版 300/天）
// − 今日已寄（aggregatedReport requests，含 SMTP 的 Auth 驗證信；統計日為 UTC，台灣早上 8 點重置）。
// account.credits 是固定上限、不會隨寄送遞減，故用統計反推；僅供儀表參考，硬上限仍由 Brevo 把關。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "missing_brevo_config" });
  try {
    const today = new Date().toISOString().slice(0, 10); // UTC，與 Brevo 統計日一致
    const H = { "api-key": apiKey };
    const [accRes, repRes] = await Promise.all([
      fetch("https://api.brevo.com/v3/account", { headers: H, cache: "no-store" }),
      fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${today}&endDate=${today}`, { headers: H, cache: "no-store" }),
    ]);
    if (!accRes.ok || !repRes.ok) return NextResponse.json({ ok: false, error: `brevo_${accRes.ok ? repRes.status : accRes.status}` }, { status: 502 });
    const acc = await accRes.json().catch(() => ({}));
    const rep = await repRes.json().catch(() => ({}));
    const plan = (acc.plan || []).find((p) => p.creditsType === "sendLimit" && Number.isFinite(p.credits));
    const limit = plan ? plan.credits : null; // 付費方案可能無日上限 → null
    const used = Number.isFinite(rep.requests) ? rep.requests : 0;
    return NextResponse.json({
      ok: true, planType: (acc.plan || [])[0]?.type || null,
      limit, used, remaining: limit == null ? null : Math.max(0, limit - used),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "brevo_unreachable" }, { status: 502 });
  }
}

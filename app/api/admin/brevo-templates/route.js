import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";

// 後台電子報「改用 Brevo 範本寄送」下拉用：列出 Brevo 帳號內啟用中的 transactional 範本（id/名稱/主旨）。
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, data: [], error: "missing_brevo_config" });
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/templates?templateStatus=true&limit=50&sort=desc", {
      headers: { "api-key": apiKey }, cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `brevo_${res.status}` }, { status: 502 });
    const d = await res.json().catch(() => ({}));
    const data = (d.templates || []).map((t) => ({ id: t.id, name: t.name, subject: t.subject }));
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "brevo_unreachable" }, { status: 502 });
  }
}

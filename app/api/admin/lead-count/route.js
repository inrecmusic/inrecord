import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { countLeadContacts } from "@/lib/brevo-contacts";

// 後台儀表板「潛客名單」卡：留 Email 換試看的人數。名單只存在 Brevo（不建表，見 CLAUDE.md），
// 所以這裡直接問 Brevo 要清單人數。Brevo 未設定或呼叫失敗回 count:null → 卡片顯示「—」，不冒充 0。
export const dynamic = "force-dynamic";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, count: await countLeadContacts() });
}

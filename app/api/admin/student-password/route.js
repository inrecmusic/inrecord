import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { serverError } from "@/lib/api-error";
import { generateCode } from "@/lib/serial-codes";
import { logAudit } from "@/lib/audit";

// 後台代學員重設密碼。body { email, mode?: "set" | "link" }
//   set （預設）→ 產一組臨時密碼寫進帳號，回傳給後台顯示一次（給不方便自己操作的學員，例如長輩）
//   link        → 寄 Supabase 重設密碼信，學員自己設定
//
// ⚠️ 這支能直接改任何學員的密碼，只認 admin token，且一律寫稽核紀錄。
// 稽核只記「對誰、用哪種模式」，**不記密碼本身**。
//
// 學員自己改密碼走 /classroom/account →「修改密碼」（/classroom/reset-password），與這支無關。
export const maxDuration = 30;

// 臨時密碼：4-4-4 分段好念好抄，字元集已排除易混的 0/O/1/I（沿用序號庫產碼）。
// 12 碼 × 32 字元集 ≈ 60 bits，遠高於 Supabase 預設 6 碼下限。
function tempPassword() {
  return `${generateCode("", 4)}-${generateCode("", 4)}-${generateCode("", 4)}`;
}

// supabase-js 沒有 getUserByEmail，用 listUsers 分頁找（名單規模數百人，成本可忽略）
async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    if (!users.length) return null;
    const hit = users.find((u) => String(u.email || "").trim().toLowerCase() === email);
    if (hit) return hit;
  }
  return null;
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const mode = body.mode === "link" ? "link" : "set";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  try {
    const user = await findUserByEmail(supabase, email);
    if (!user) {
      // 沒帳號不是錯誤，是另一種狀況：請學員用「Email 連結登入」首次登入會自動建立
      return NextResponse.json({ error: "no_account" }, { status: 404 });
    }

    if (mode === "link") {
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${site}/auth/callback?next=/classroom/reset-password`,
      });
      if (error) return NextResponse.json({ error: "send_failed", detail: error.message }, { status: 502 });
      await logAudit(supabase, {
        actor: payload.email, action: "student.password_reset_link",
        targetType: "auth_user", targetId: email, meta: { mode }, req,
      });
      return NextResponse.json({ ok: true, mode, email });
    }

    const password = tempPassword();
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });

    await logAudit(supabase, {
      actor: payload.email, action: "student.password_set",
      targetType: "auth_user", targetId: email, meta: { mode }, req, // 刻意不記密碼
    });
    // 密碼只在這個回應回傳一次，不落地任何資料表
    return NextResponse.json({ ok: true, mode, email, password });
  } catch (e) {
    return serverError(e);
  }
}

import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { comment_id, admin_content } = await req.json();
  // 缺留言 id 或空白回覆直接擋（之前會寫進一筆空回覆再被 DB 拒絕／或留下空白回覆）
  if (!comment_id || !String(admin_content || "").trim()) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { data, error } = await db.from("comment_replies").insert({ comment_id, admin_content }).select().single();
  if (error) return serverError(error);
  // Mark comment as replied
  await db.from("comments").update({ status: "replied" }).eq("id", comment_id);
  // 回覆會顯示給學員看，留稽核
  await logAudit(db, { actor: payload.email, action: "comment.reply", targetType: "comment", targetId: comment_id, meta: { reply_id: data?.id }, req });
  return NextResponse.json({ ok: true, data });
}

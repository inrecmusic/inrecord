import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import {
  DEFAULT_DRAFT_ID, MAX_DRAFTS, isValidDraftId, normalizeDraftId,
  sortDrafts, toDraftSummary, isSingletonConstraintError, SINGLETON_HINT,
} from "@/lib/newsletter-drafts";

// 電子報草稿。2026-09-13 起可存多份（原本 schema 用 CHECK 鎖成單列，已移除該約束）。
//   GET                 → 單份 default（沿用舊行為，既有前端不改也能運作）＋ drafts 清單
//   GET ?id=xxx         → 指定草稿
//   PATCH {id,...}      → upsert 指定草稿（省略 id ＝ default）
//   DELETE ?id=xxx      → 刪除草稿（default 不可刪，避免前端載入時沒東西可讀）
export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const id = normalizeDraftId(new URL(req.url).searchParams.get("id"));

  const [one, all] = await Promise.all([
    supabase.from("newsletter").select("*").eq("id", id).maybeSingle(),
    supabase.from("newsletter").select("id, subject, body_md, updated_at, last_sent_at, last_sent_count"),
  ]);
  if (one.error) return serverError(one.error);
  if (all.error) return serverError(all.error);

  return NextResponse.json({
    ok: true,
    data: one.data || { id, subject: "", body_md: "", last_sent_at: null, last_sent_count: 0 },
    drafts: sortDrafts(all.data || []).map(toDraftSummary),
  });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 300) : "";
  const body_md = typeof body.body_md === "string" ? body.body_md.slice(0, 20000) : "";
  const rawId = body.id ?? DEFAULT_DRAFT_ID;
  // 寫入路徑不做「不合法就退回 default」——那會把新草稿默默覆蓋到既有草稿上
  if (!isValidDraftId(String(rawId).trim().toLowerCase())) {
    return NextResponse.json({ error: "invalid_draft_id" }, { status: 400 });
  }
  const id = String(rawId).trim().toLowerCase();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // 新增草稿才檢查數量上限（更新既有的不受限）
  if (id !== DEFAULT_DRAFT_ID) {
    const { data: existing, error: listErr } = await supabase.from("newsletter").select("id");
    if (listErr) return serverError(listErr);
    const ids = (existing || []).map((r) => r.id);
    if (!ids.includes(id) && ids.length >= MAX_DRAFTS) {
      return NextResponse.json({ error: "too_many_drafts", max: MAX_DRAFTS }, { status: 400 });
    }
  }

  const { error } = await supabase.from("newsletter").upsert(
    { id, subject, body_md, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) {
    // 還沒跑移除約束那行 SQL：給明確指示，不要丟原始 DB 錯誤
    if (isSingletonConstraintError(error)) {
      return NextResponse.json({ error: "singleton_constraint", hint: SINGLETON_HINT }, { status: 409 });
    }
    return serverError(error);
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = String(new URL(req.url).searchParams.get("id") || "").trim().toLowerCase();
  if (!isValidDraftId(id)) return NextResponse.json({ error: "invalid_draft_id" }, { status: 400 });
  if (id === DEFAULT_DRAFT_ID) return NextResponse.json({ error: "cannot_delete_default" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { error } = await supabase.from("newsletter").delete().eq("id", id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, id });
}

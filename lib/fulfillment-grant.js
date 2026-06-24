// lib/fulfillment-grant.js — 課程/遊戲存取開通的單一來源（PAYUNi notify 與後台手動開通共用）。
// 邏輯沿用原 app/api/payuni/notify 的 enrollments / subscriptions upsert，抽出避免重複。

const PERMANENT = "2999-12-31T00:00:00.000Z"; // 「永久」以遠期到期日表示
const COURSE_ID = "piano-101"; // 單一課程架構：固定 course_id

// 依 order.plan 開通存取。回 { ok, errors[] }；upsert 皆冪等（重複呼叫不會重複開通）。
export async function grantAccess(supabase, order) {
  const errors = [];
  const { id, email, plan } = order;

  // 課程開通（課程單賣 or 課程包）
  if (plan === "course" || plan === "bundle") {
    const { error } = await supabase.from("enrollments").upsert(
      { email, course_id: COURSE_ID, order_id: id },
      { onConflict: "email,course_id" }
    );
    if (error) errors.push(`enrollments: ${error.message || error}`);
  }

  // AI 遊戲永久開通（遊戲單買 or 課程包）。
  // 冪等靠 partial unique index uniq_sub_purchase_order（WHERE source='purchase'）。
  // ⚠️ 不用 upsert(onConflict) —— supabase-js 的 onConflict 給不了 partial index 的 WHERE
  //    predicate、匹配不到它，會報「no unique constraint」害整個開通失敗。改用 insert：
  //    重送／並發時第 2 筆撞索引回 23505(unique_violation) → 視為已開通(冪等)，不算錯。
  if (plan === "game" || plan === "bundle") {
    const { error } = await supabase.from("subscriptions").insert({
      email,
      plan_type: plan === "bundle" ? "bundle" : "game",
      status: "active",
      expires_at: PERMANENT,
      source: "purchase",
      payuni_order_id: id,
    });
    if (error && error.code !== "23505") errors.push(`subscriptions: ${error.message || error}`);
  }

  return { ok: errors.length === 0, errors };
}

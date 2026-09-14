// lib/launch-notify.js — 開課通知（逐封寄、per-email 去重、可斷點續寄；依賴注入以利測試）。
//
// 舊版會「寄送前就 CAS 設 launch_notified_at」，買家一多寄到一半逾時，旗標卻已標「已通知」
// 且不可逆 → 多數買家永遠收不到開課信。改為：撈買家 → 濾掉 launch_notify_sends 已寄者 →
// 逐封「先佔位再寄」。唯有「全部寄達」才設 sale_settings.launch_notified_at
// （停掉首頁 lazy trigger）；中途逾時旗標仍為空 → 下次 cron / 後台手動自動續寄。
import { selectAll } from "./supabase-paginate.js";

const COURSE_ID = "piano-101"; // 單一課程架構（見 CLAUDE.md）

// dryRun=true：只算名單不寄信、不佔位、不標記完成 —— 後台按鈕先預覽「會寄給幾個人」再確認。
export async function runLaunchNotify(supabase, { sendLaunchEmail, now = new Date(), dryRun = false }) {
  // 1) 名單＝有 enrollments 的 email（開通權威，見 CLAUDE.md），不是「已付款訂單」：
  //    付了錢還沒開通的人收到「開課了」卻進不了教室只會來信問；$0 手動開通單本來就有 enrollments。
  //    selectAll 分頁：PostgREST 單次預設 1000 列，破千時第 1001 位之後永遠撈不到。
  let rows;
  try {
    rows = await selectAll(supabase, "enrollments", (q) => q.select("email").eq("course_id", COURSE_ID));
  } catch (e) {
    throw new Error("launch-notify: 撈開通名單失敗: " + e.message);
  }
  const all = [...new Set(rows.map((o) => (o.email || "").trim().toLowerCase()).filter(Boolean))];
  if (all.length === 0) return { total: 0, sent: 0, skipped: 0, pending: 0, alreadyComplete: false, errors: [] };

  // 2) 濾掉已寄（斷點續寄）。這份記錄同樣要分頁撈完——被截斷會讓前 1000 名重收一封。
  let sentRows;
  try {
    sentRows = await selectAll(supabase, "launch_notify_sends", (q) => q.select("email"));
  } catch (e) {
    throw new Error("launch-notify: 讀寄送記錄失敗: " + e.message);
  }
  const already = new Set(sentRows.map((r) => (r.email || "").trim().toLowerCase()));
  const todo = all.filter((e) => !already.has(e));
  if (dryRun) {
    // 附帶「已付款但沒開通」人數（不含手動單）：這些人不在名單裡，營運者要先去訂單管理開通
    let unenrolledPaid = null;
    try {
      const paid = await selectAll(supabase, "orders", (q) => q.select("email").eq("status", "paid").or("source.is.null,source.neq.manual"));
      const enrolled = new Set(all);
      unenrolledPaid = [...new Set(paid.map((o) => (o.email || "").trim().toLowerCase()).filter(Boolean))].filter((e) => !enrolled.has(e)).length;
    } catch { /* 預覽的附加資訊，撈不到就不顯示 */ }
    return { dryRun: true, total: all.length, alreadySent: all.length - todo.length, pending: todo.length, unenrolledPaid };
  }
  if (todo.length === 0) {
    await markComplete(supabase, now);
    return { total: all.length, sent: 0, skipped: 0, pending: 0, alreadyComplete: true, errors: [] };
  }

  // 3) 逐封「先佔位再寄」（同 lib/newsletter-send.js 的 claimSend/releaseSend）：
  //    insert 搶到（唯一索引 lower(email)）才寄，撞 23505＝另一路（cron／後台按鈕）已在處理這封，跳過。
  //    先寄後記錄的話，cron 跑到一半管理員按下手動按鈕，同一批買家會收到兩封開課信。
  //    寄失敗就刪回佔位，維持「至少寄達一次」、下次續寄。
  let sent = 0, skipped = 0;
  const errors = [];
  for (const email of todo) {
    const { error: claimErr } = await supabase.from("launch_notify_sends").insert({ email });
    if (claimErr) {
      if (claimErr.code === "23505") { skipped++; continue; }
      errors.push(`claim ${email}: ${claimErr.message}`);
      continue;
    }
    let r;
    try { r = await sendLaunchEmail({ email }); }
    catch (e) { r = { success: false, error: e.message }; }
    if (r && r.success) {
      sent++;
    } else {
      errors.push(`${email}: ${r?.error || "send_failed"}`);
      const { error: relErr } = await supabase.from("launch_notify_sends").delete().eq("email", email);
      if (relErr) errors.push(`release ${email}: ${relErr.message}`);
    }
  }

  // 4) 全部寄達（無未寄）才標記完成；否則保持未完成，下次續寄。
  //    被別的執行序佔走的（skipped）保守算成未完成——由那一路自己標記，或下次 cron 收尾。
  const pending = todo.length - sent;
  if (pending === 0) await markComplete(supabase, now);
  return { total: all.length, sent, skipped, pending, alreadyComplete: false, errors };
}

async function markComplete(supabase, now) {
  const ts = (now instanceof Date ? now : new Date(now)).toISOString();
  await supabase.from("sale_settings")
    .update({ launch_notified_at: ts })
    .eq("id", "default")
    .is("launch_notified_at", null);
}

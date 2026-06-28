// lib/launch-notify.js — 開課通知（逐封寄、per-email 去重、可斷點續寄；依賴注入以利測試）。
//
// 舊版會「寄送前就 CAS 設 launch_notified_at」，買家一多寄到一半逾時，旗標卻已標「已通知」
// 且不可逆 → 多數買家永遠收不到開課信。改為：撈買家 → 濾掉 launch_notify_sends 已寄者 →
// 逐封寄、每封成功落記錄（唯一索引冪等）。唯有「全部寄達」才設 sale_settings.launch_notified_at
// （停掉首頁 lazy trigger）；中途逾時旗標仍為空 → 下次 cron / 後台手動自動續寄。
export async function runLaunchNotify(supabase, { sendLaunchEmail, now = new Date() }) {
  // 1) 已付款買家 email（小寫去重）
  const { data: orders, error } = await supabase.from("orders").select("email").eq("status", "paid");
  if (error) throw new Error("launch-notify: 撈付款名單失敗: " + error.message);
  const all = [...new Set((orders || []).map((o) => (o.email || "").trim().toLowerCase()).filter(Boolean))];
  if (all.length === 0) return { total: 0, sent: 0, pending: 0, alreadyComplete: false, errors: [] };

  // 2) 濾掉已寄（斷點續寄）
  const { data: sentRows, error: sErr } = await supabase.from("launch_notify_sends").select("email");
  if (sErr) throw new Error("launch-notify: 讀寄送記錄失敗: " + sErr.message);
  const already = new Set((sentRows || []).map((r) => (r.email || "").trim().toLowerCase()));
  const todo = all.filter((e) => !already.has(e));
  if (todo.length === 0) {
    await markComplete(supabase, now);
    return { total: all.length, sent: 0, pending: 0, alreadyComplete: true, errors: [] };
  }

  // 3) 逐封寄、每封成功落記錄（唯一索引保證冪等，容忍 23505）
  let sent = 0;
  const errors = [];
  for (const email of todo) {
    let r;
    try { r = await sendLaunchEmail({ email }); }
    catch (e) { r = { success: false, error: e.message }; }
    if (r && r.success) {
      sent++;
      const { error: recErr } = await supabase.from("launch_notify_sends").insert({ email });
      if (recErr && recErr.code !== "23505") errors.push(`record ${email}: ${recErr.message}`);
    } else {
      errors.push(`${email}: ${r?.error || "send_failed"}`);
    }
  }

  // 4) 全部寄達（無未寄）才標記完成；否則保持未完成，下次續寄
  const pending = todo.length - sent;
  if (pending === 0) await markComplete(supabase, now);
  return { total: all.length, sent, pending, alreadyComplete: false, errors };
}

async function markComplete(supabase, now) {
  const ts = (now instanceof Date ? now : new Date(now)).toISOString();
  await supabase.from("sale_settings")
    .update({ launch_notified_at: ts })
    .eq("id", "default")
    .is("launch_notified_at", null);
}

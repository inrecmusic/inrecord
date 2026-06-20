// lib/launch-notify.js — 開課通知（CAS 搶佔保證只寄一次；依賴注入以利測試）
export async function runLaunchNotify(supabase, { sendLaunchEmail, now = new Date() }) {
  // 1) CAS 原子搶佔：只在 launch_notified_at 尚為 NULL 時成功
  const { data: claimed } = await supabase
    .from("sale_settings")
    .update({ launch_notified_at: now.toISOString() })
    .eq("id", "default")
    .is("launch_notified_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return { alreadyNotified: true, sent: 0 };

  // 2) 撈已付款訂單 email、去重
  const { data: orders } = await supabase.from("orders").select("email").eq("status", "paid");
  const emails = [...new Set((orders || []).map((o) => o.email).filter(Boolean))];

  // 3) 逐封寄送
  let sent = 0;
  for (const email of emails) {
    const r = await sendLaunchEmail({ email });
    if (r && r.success) sent++;
  }
  return { alreadyNotified: false, sent };
}

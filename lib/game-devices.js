// 依 last_seen_at 新→舊取前 limit 個 device_id（允許集）
// ⚠️ 2026-08 起 course/games route 已改用 devicesToEvict（擠最舊，見下）；此函式暫留、不再被 route 使用。
export function pickAllowedDeviceIds(devices, limit) {
  return [...devices]
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(0, limit)
    .map(d => d.device_id);
}

// 近 windowMs 內、不含當前裝置的其他活躍裝置數 ≥ limit → 超限（true=擋）
// ⚠️ 2026-08 起 course/games route 已改用 devicesToEvict（擠最舊、非時間窗）；此函式暫留、不再被 route 使用。
export function exceedsDeviceLimit(devices, currentDeviceId, limit, nowMs, windowMs) {
  const cutoff = nowMs - windowMs;
  const activeOthers = devices.filter(
    d => d.device_id !== currentDeviceId && new Date(d.last_seen_at).getTime() > cutoff
  );
  return activeOthers.length >= limit;
}

// 依 last_seen_at 新→舊排序，回「超出 limit 的最舊裝置」的 device_id 陣列（要擠掉的）。
export function devicesToEvict(devices, limit) {
  return [...devices]
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(limit)
    .map(d => d.device_id);
}

// 裝置數上限把關（course/games route 共用）：
//   1) upsert 當前裝置 last_seen_at=now（連 ua/ip）→ 當前裝置必為最新，穩不被擠
//   2) 讀 game_settings.device_limit（無設定 fallback 3）
//   3) 讀該 user 全部裝置、用 devicesToEvict 算出超出上限的最舊裝置並刪除（維持 N 台）
// 刪除失敗不阻擋放行（log 即可，下次呼叫再擠一次）；upsert／讀裝置清單失敗才回錯誤。
// 回傳 { ok:true } 或 { error, status }（呼叫端把 status 原樣回傳）。缺 deviceId 由呼叫端擋（400 device_required）。
export async function enforceDeviceLimit(supabase, { userId, deviceId, ua, ip }) {
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase.from("game_devices").upsert(
    { user_id: userId, device_id: deviceId, user_agent: ua, ip, last_seen_at: nowIso },
    { onConflict: "user_id,device_id" }
  );
  if (upErr) return { error: "device_check_failed", status: 500 };

  const { data: settings } = await supabase
    .from("game_settings").select("device_limit").eq("id", "default").single();
  const limit = settings?.device_limit ?? 3;

  const { data: devices, error: devErr } = await supabase
    .from("game_devices").select("device_id, last_seen_at").eq("user_id", userId);
  if (devErr) return { error: "device_check_failed", status: 500 };

  const evict = devicesToEvict(devices || [], limit);
  if (evict.length) {
    const { error: delErr } = await supabase
      .from("game_devices").delete().eq("user_id", userId).in("device_id", evict);
    if (delErr) console.error("enforceDeviceLimit: 擠出舊裝置失敗（不阻擋放行）", delErr.message || delErr);
  }

  return { ok: true };
}

// 多處分散＋含日期的浮水印（注入 </body> 前）；opacity 極低不影響遊玩
export function buildWatermark(email, dateStr) {
  // Escape HTML 特殊字元防 XSS
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const wm = `${esc(email)} · ${esc(dateStr)} · InRecord`;
  const base = "position:fixed;opacity:0.06;color:#fff;font-size:14px;pointer-events:none;z-index:9999;white-space:nowrap;user-select:none";
  return (
    `<div style="${base};top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg)">${wm}</div>` +
    `<div style="${base};top:12%;left:64%;transform:rotate(-30deg)">${wm}</div>` +
    `<div style="${base};top:84%;left:10%;transform:rotate(-30deg)">${wm}</div>`
  );
}

// 依 last_seen_at 新→舊取前 limit 個 device_id（允許集）
export function pickAllowedDeviceIds(devices, limit) {
  return [...devices]
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(0, limit)
    .map(d => d.device_id);
}

// 近 windowMs 內、不含當前裝置的其他活躍裝置數 ≥ limit → 超限（true=擋）
export function exceedsDeviceLimit(devices, currentDeviceId, limit, nowMs, windowMs) {
  const cutoff = nowMs - windowMs;
  const activeOthers = devices.filter(
    d => d.device_id !== currentDeviceId && new Date(d.last_seen_at).getTime() > cutoff
  );
  return activeOthers.length >= limit;
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

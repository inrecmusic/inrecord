// 依 last_seen_at 新→舊取前 limit 個 device_id（允許集）
export function pickAllowedDeviceIds(devices, limit) {
  return [...devices]
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(0, limit)
    .map(d => d.device_id);
}

// 多處分散＋含日期的浮水印（注入 </body> 前）；opacity 極低不影響遊玩
export function buildWatermark(email, dateStr) {
  const wm = `${email} · ${dateStr} · InRecord`;
  const base = "position:fixed;opacity:0.06;color:#fff;font-size:14px;pointer-events:none;z-index:9999;white-space:nowrap;user-select:none";
  return (
    `<div style="${base};top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg)">${wm}</div>` +
    `<div style="${base};top:12%;left:64%;transform:rotate(-30deg)">${wm}</div>` +
    `<div style="${base};top:84%;left:10%;transform:rotate(-30deg)">${wm}</div>`
  );
}

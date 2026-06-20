// 倒數計時純格式函式（與 UI 分離以利測試）
export function formatCountdownParts(ms) {
  const t = Math.max(0, ms);
  const d = Math.floor(t / 86400000);
  const h = Math.floor(t / 3600000) % 24;
  const m = Math.floor(t / 60000) % 60;
  const s = Math.floor(t / 1000) % 60;
  const z = (n) => String(n).padStart(2, "0");
  return { d, h: z(h), m: z(m), s: z(s) };
}

// 課程 Demo 體驗頁（/demo）的純常數與純函式，供元件與單元測試共用。
// 注意：buyUrl 用字面量 process.env.NEXT_PUBLIC_WORDPRESS_BUY_URL，
// 讓 Next.js 在 client bundle 編譯期能靜態替換。

export const TRIAL_SECONDS = 120;

// 剩餘秒數 → "MM:SS"；負數與小數安全處理（負數視為 0、小數捨去）
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// WordPress 預購 URL；未設定或空白 → null（CTA 顯示「即將開放」停用）
export function buyUrl() {
  const url = (process.env.NEXT_PUBLIC_WORDPRESS_BUY_URL || "").trim();
  return url ? url : null;
}

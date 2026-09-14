// Supabase Auth 錯誤訊息 → 站內繁中文案。
// 為什麼要集中：登入／忘記密碼／重設密碼三頁原本各自 setError(err.message)，
// 學員會直接看到英文原文（Email not confirmed、For security purposes…）。
// 這裡只看訊息關鍵字（Supabase 沒有穩定的 error code 可依賴），對不上就給通用文案。

const TOO_FREQUENT = /rate limit|security purposes|after \d+ seconds/i;

/** 登入（密碼／OAuth／OTP 寄送）失敗訊息 */
export function mapAuthError(msg) {
  const m = String(msg || "");
  if (/invalid login credentials/i.test(m)) return "Email 或密碼錯誤";
  if (/email not confirmed/i.test(m)) return "信箱尚未驗證，請先到信箱點驗證連結";
  if (TOO_FREQUENT.test(m)) return "操作太頻繁，請稍後一分鐘再試";
  return "登入失敗，請稍後再試，或改用 Email 連結登入";
}

/**
 * 忘記密碼寄信失敗是否該「誠實告知」：限流／SMTP／網路類錯誤不能假裝已寄出，
 * 否則學員等不到信也不知道要重試。其餘錯誤（含帳號不存在類）仍顯示已寄出，避免帳號枚舉。
 */
export function isResetSendFailure(msg) {
  return /rate limit|security purposes|after \d+ seconds|5\d\d|network|fetch/i.test(String(msg || ""));
}

/** 重設／修改密碼（updateUser）失敗訊息：登入中的使用者從帳號頁進來也會走這裡，不能一律叫人重申請重設信 */
export function mapResetError(msg) {
  const m = String(msg || "");
  if (/different from the old/i.test(m)) return "新密碼不能與舊密碼相同";
  if (/weak|at least|characters|password should/i.test(m)) return "密碼強度不足，請至少 6 個字";
  if (/session|expired|jwt|not authenticated|auth session missing/i.test(m)) return "連結已失效或登入已過期，請重新申請重設信或重新登入";
  return "密碼更新失敗，請稍後再試";
}

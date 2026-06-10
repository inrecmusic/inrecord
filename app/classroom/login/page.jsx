"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isInAppBrowser } from "@/lib/inapp-browser";
import Logo from "@/components/Logo";
import styles from "./login.module.css";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function ClassroomLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [inApp, setInApp] = useState(false);
  // 登入模式：password（密碼）| otp（Email 驗證碼）
  const [mode, setMode] = useState("password");
  const [otpSent, setOtpSent] = useState(false);

  // 偵測 App 內建瀏覽器：Google OAuth 會被擋，預設改走 Email 驗證碼
  useEffect(() => {
    if (isInAppBrowser()) {
      setInApp(true);
      setMode("otp");
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    setLoading(true);
    setError("");
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      router.replace("/classroom");
    } catch (err) {
      setError(err.message === "Invalid login credentials" ? "Email 或密碼錯誤" : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    setGoogleLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth/callback" },
    });
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
  }

  // 寄送 Email 驗證碼（同時也會寄登入連結，兩者擇一皆可登入）
  async function handleSendOtp(e) {
    e.preventDefault();
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    if (!email) { setError("請輸入電子信箱"); return; }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + "/auth/callback" },
      });
      if (err) throw err;
      setOtpSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // 驗證 6 位數驗證碼
  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email,
        token: otpCode.trim(),
        type: "email",
      });
      if (err) throw err;
      router.replace("/classroom");
    } catch (err) {
      setError("驗證碼錯誤或已過期，請重新取得");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setOtpSent(false);
    setOtpCode("");
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <a href="/" className={styles.cardLogo} aria-label="InRecord 首頁"><Logo size={24} /></a>
        <h2 className={styles.title}>學員登入</h2>
        <p className={styles.sub}>登入以存取你的課程內容</p>

        {inApp && (
          <div className={styles.banner}>
            你正從 App 內建瀏覽器開啟，<strong>Google 登入會被擋下</strong>。請改用下方「Email 驗證碼登入」，
            或點右上角選單選擇「在 Safari／Chrome 開啟」。
          </div>
        )}

        {/* Google 登入：App 內建瀏覽器會被 Google 擋，故在 in-app 時隱藏 */}
        {!inApp && (
          <>
            <button
              type="button"
              className={styles.oauthBtn}
              onClick={handleGoogle}
              disabled={googleLoading || loading}
            >
              <GoogleIcon />
              {googleLoading ? "跳轉中…" : "使用 Google 登入"}
            </button>
            <div className={styles.divider}>
              {mode === "otp" ? "或使用 Email 驗證碼" : "或使用 Email 登入"}
            </div>
          </>
        )}

        {/* Email + 密碼 */}
        {mode === "password" && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">電子信箱</label>
              <input
                id="email" type="email" className={styles.input}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required autoComplete="email"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">密碼</label>
              <input
                id="password" type="password" className={styles.input}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submit} disabled={loading || googleLoading}>
              {loading ? "登入中…" : "登入"}
            </button>
          </form>
        )}

        {/* Email 驗證碼（OTP）— App 內建瀏覽器友善，免 Google、免密碼 */}
        {mode === "otp" && (
          <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="otp-email">電子信箱</label>
              <input
                id="otp-email" type="email" className={styles.input}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required autoComplete="email"
                disabled={otpSent}
              />
            </div>
            {otpSent && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="otp-code">驗證碼（6 位數）</label>
                <input
                  id="otp-code" type="text" inputMode="numeric" className={styles.input}
                  value={otpCode} onChange={e => setOtpCode(e.target.value)}
                  placeholder="輸入信件中的 6 位數驗證碼" required
                  autoComplete="one-time-code" maxLength={6}
                />
                <p className={styles.helpText}>已寄出登入信。可輸入信中的 6 位數驗證碼，或直接點信中的登入連結。</p>
              </div>
            )}
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submit} disabled={loading || googleLoading}>
              {loading ? "處理中…" : otpSent ? "驗證並登入" : "寄送驗證碼"}
            </button>
            {otpSent && (
              <button type="button" className={styles.linkBtn} onClick={() => { setOtpSent(false); setOtpCode(""); setError(""); }}>
                沒收到？重新寄送
              </button>
            )}
          </form>
        )}

        {/* 模式切換 */}
        <button type="button" className={styles.linkBtn} onClick={() => switchMode(mode === "otp" ? "password" : "otp")}>
          {mode === "otp" ? "改用密碼登入" : "改用 Email 驗證碼登入（免密碼）"}
        </button>

        <p className={styles.hint}>購課後請使用購買時的 Email 登入</p>
        <a href="/#pricing" className={styles.back}>查看課程方案 →</a>
      </div>
    </div>
  );
}

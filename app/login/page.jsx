"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import styles from "./page.module.css";

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

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [oauthLoading, setOauthLoading] = useState("");
  const [error, setError]       = useState("");
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!supabase) { setError("服務尚未設定，請聯絡管理員。"); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message === "Invalid login credentials" ? "帳號或密碼錯誤，請重新確認。" : err.message);
      setLoading(false);
    } else {
      router.push("/classroom");
    }
  }

  async function handleOAuth(provider) {
    if (!supabase) { setError("服務尚未設定，請聯絡管理員。"); return; }
    setOauthLoading(provider);
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(err.message);
      setOauthLoading("");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <a href="/" className={styles.logoWrap}><Logo size={22} /></a>
        <h1>學員登入</h1>
        <p className={styles.sub}>登入後即可觀看課程影片</p>

        {/* OAuth buttons */}
        <div className={styles.oauthGroup}>
          <button
            className={styles.oauthBtn}
            onClick={() => handleOAuth("google")}
            disabled={!!oauthLoading}
          >
            <GoogleIcon />
            {oauthLoading === "google" ? "跳轉中…" : "使用 Google 登入"}
          </button>
          <button
            className={`${styles.oauthBtn} ${styles.oauthFacebook}`}
            onClick={() => handleOAuth("facebook")}
            disabled={!!oauthLoading}
          >
            <FacebookIcon />
            {oauthLoading === "facebook" ? "跳轉中…" : "使用 Facebook 登入"}
          </button>
        </div>

        <div className={styles.divider}><span>或使用 Email 登入</span></div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            電子郵件
            <input type="email" className={styles.input} placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
          </label>
          <label className={styles.label}>
            密碼
            <input type="password" className={styles.input} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/>
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submit} disabled={loading || !!oauthLoading}>
            {loading ? "登入中…" : "登入"}
          </button>
        </form>

        <p className={styles.hint}>
          還沒有帳號？購買課程後我們會寄送帳號資訊至您的 Email。
        </p>
        <a href="/#pricing" className={styles.back}>查看課程方案 →</a>
      </div>
    </div>
  );
}

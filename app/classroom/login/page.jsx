"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "../classroom.module.css";
import { Music } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

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
      options: {
        redirectTo: window.location.origin + "/auth/callback",
      },
    });
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.loginHead}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#eff6ff", display: "grid", placeItems: "center", margin: "0 auto" }}>
            <Music size={26} color="#2563eb" />
          </div>
          <h1 className={styles.loginTitle}>InRecord 音樂教室</h1>
          <p className={styles.loginSub}>登入以存取你的課程內容</p>
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "12px 16px", marginBottom: 16,
            border: "1.5px solid #e2e8f0", borderRadius: 12,
            background: "white", fontSize: 15, fontWeight: 700,
            color: "#374151", cursor: "pointer", fontFamily: "inherit",
            transition: "border-color .2s, background .2s",
            opacity: (googleLoading || loading) ? 0.6 : 1,
          }}
        >
          <GoogleIcon />
          {googleLoading ? "跳轉中…" : "使用 Google 登入"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
          <span style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          或使用 Email 登入
          <span style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <div className={styles.field}>
            <label htmlFor="email">電子信箱</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">密碼</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.loginErr}>{error}</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading || googleLoading} style={{ width: "100%", marginTop: 4, padding: "13px 18px", fontSize: 15 }}>
            {loading ? "登入中…" : "登入"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
          購課後請使用購買時的 Email 登入
        </p>
      </div>
    </div>
  );
}

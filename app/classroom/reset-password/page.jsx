"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

const F = "'PingFang TC','Noto Sans TC',system-ui,-apple-system,sans-serif";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  // 進頁確認有 session（忘記密碼者經 /auth/callback 建立復原 session；
  // 登入中的使用者本來就有 session）。無 session → 顯示失效導引。
  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    if (pw.length < 6) { setError("密碼至少 6 個字"); return; }
    if (pw !== pw2) { setError("兩次輸入的密碼不一致"); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      setDone(true);
      setTimeout(() => router.replace("/classroom"), 1500);
    } catch (err) {
      setError(err.message || "設定失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  const wrap = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", padding: 24, fontFamily: F };
  const card = { width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18, padding: "32px 28px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10, outline: "none", fontFamily: F, boxSizing: "border-box" };
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const btn = { width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10, cursor: "pointer", fontFamily: F };

  if (checking) return (
    <div style={wrap}><p style={{ color: "#64748b", fontFamily: F }}>載入中…</p></div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 18 }}><Logo size={24} /></div>
        <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "#0f172a" }}>設定新密碼</h2>

        {!hasSession ? (
          <>
            <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, margin: "8px 0 20px" }}>
              連結已失效或過期，請重新申請重設密碼。
            </p>
            <a href="/classroom/login" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>回登入頁</a>
          </>
        ) : done ? (
          <p style={{ color: "#16a34a", fontSize: 14, lineHeight: 1.7, margin: "12px 0" }}>
            密碼已更新，正在帶你回教室…
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="pw">新密碼</label>
              <input id="pw" type="password" style={input} value={pw}
                onChange={e => setPw(e.target.value)} placeholder="至少 6 個字"
                autoComplete="new-password" required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="pw2">再次輸入新密碼</label>
              <input id="pw2" type="password" style={input} value={pw2}
                onChange={e => setPw2(e.target.value)} placeholder="再輸入一次"
                autoComplete="new-password" required />
            </div>
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <button type="submit" style={btn} disabled={saving}>{saving ? "設定中…" : "更新密碼"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

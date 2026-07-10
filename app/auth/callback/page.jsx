"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/safe-redirect";

function Spinner() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 32, height: 32, border: "3px solid #e2e8f0",
          borderTopColor: "#2563eb", borderRadius: "50%",
          animation: "spin .65s linear infinite", margin: "0 auto 14px",
        }} />
        <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>登入中，請稍候…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorCard() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", padding: 24 }}>
      <div style={{
        maxWidth: 420, width: "100%", textAlign: "center",
        background: "#fff", borderRadius: 12, padding: "32px 28px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>
          連結驗證失敗
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: "0 0 24px" }}>
          可能是連結已過期，或你在與申請時不同的裝置或瀏覽器開啟。請回登入頁重新申請；忘記密碼時也可改用「Email 驗證碼登入（免密碼）」。
        </p>
        <a
          href="/classroom/login"
          style={{
            display: "inline-block", background: "#2563eb", color: "#fff",
            fontSize: 14, fontWeight: 600, textDecoration: "none",
            padding: "10px 24px", borderRadius: 8,
          }}
        >
          回登入頁
        </a>
      </div>
    </div>
  );
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!supabase) { router.replace("/classroom/login"); return; }

    const next = safeNextPath(searchParams.get("next")); // 限站內相對路徑，擋 open redirect
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(() => router.replace(next))
        .catch(() => setFailed(true));
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        router.replace(session ? next : "/classroom/login");
      });
    }
  }, [router, searchParams]);

  if (failed) return <ErrorCard />;
  return <Spinner />;
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<Spinner />}>
      <CallbackHandler />
    </Suspense>
  );
}

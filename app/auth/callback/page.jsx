"use client";
import { Suspense, useEffect } from "react";
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

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!supabase) { router.replace("/classroom/login"); return; }

    const next = safeNextPath(searchParams.get("next")); // 限站內相對路徑，擋 open redirect
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(() => router.replace(next))
        .catch(() => router.replace("/classroom/login"));
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        router.replace(session ? next : "/classroom/login");
      });
    }
  }, [router, searchParams]);

  return <Spinner />;
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<Spinner />}>
      <CallbackHandler />
    </Suspense>
  );
}

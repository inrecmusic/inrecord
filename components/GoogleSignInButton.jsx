"use client";
import { useEffect, useRef } from "react";
import Script from "next/script";
import { GIS_SCRIPT_SRC, generateNonce, initGoogleButton } from "@/lib/google-signin";

// 自家頁面上的 Google 官方登入按鈕（彈窗選帳戶）。成功時回傳 { credential, nonce }，由父層交給 Supabase。
// GIS 腳本失敗或 window.google 不在（擴充套件擋）→ onStateChange("unavailable")，父層改顯示原本的網頁版登入。
export default function GoogleSignInButton({ clientId, onCredential, onStateChange, width = 320 }) {
  const ref = useRef(null);
  const nonceRef = useRef(null);
  const initialized = useRef(false);

  useEffect(() => { generateNonce().then((n) => { nonceRef.current = n; }); }, []);

  async function init() {
    if (initialized.current) return;
    const google = typeof window !== "undefined" ? window.google : null;
    if (!google?.accounts?.id || !ref.current) { onStateChange?.("unavailable"); return; }
    const n = nonceRef.current || (await generateNonce());
    nonceRef.current = n;
    initialized.current = true;
    initGoogleButton(google, ref.current, {
      clientId, hashedNonce: n.hashedNonce, width,
      onCredential: (credential) => onCredential({ credential, nonce: n.nonce }),
    });
    onStateChange?.("ready");
  }

  return (
    <>
      <Script src={GIS_SCRIPT_SRC} strategy="afterInteractive" onReady={init} onError={() => onStateChange?.("unavailable")} />
      <div ref={ref} data-testid="gis-button" style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
    </>
  );
}

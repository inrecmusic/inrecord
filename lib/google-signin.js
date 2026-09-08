// lib/google-signin.js — Google Identity Services（自家頁面 Google 登入）純函式。
// 流程：頁面產生 nonce → hashedNonce 交給 GIS、原始 nonce 交給 supabase.auth.signInWithIdToken 驗證（防重放）。
export const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export async function generateNonce(cryptoImpl = globalThis.crypto) {
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { nonce, hashedNonce };
}

// google＝window.google（GIS 腳本載入後的全域）；el＝要畫按鈕的容器。
export function initGoogleButton(google, el, { clientId, hashedNonce, onCredential, width = 320 }) {
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (res) => { if (res?.credential) onCredential(res.credential); },
    nonce: hashedNonce,
    use_fedcm_for_prompt: true, // Chrome 第三方 cookie 淘汰後必須
    ux_mode: "popup",
  });
  google.accounts.id.renderButton(el, {
    type: "standard", shape: "pill", theme: "outline", text: "signin_with", size: "large", logo_alignment: "left", width, locale: "zh_TW",
  });
}

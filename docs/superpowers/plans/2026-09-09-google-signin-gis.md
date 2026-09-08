# Google 登入改用 Google Identity Services 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登入頁的 Google 登入改為自家頁面上的 Google 官方按鈕（彈窗），取得 ID token 後交給 Supabase `signInWithIdToken`，讓 Google 帳戶選擇頁顯示 InRecord 而非 supabase.co。

**Architecture:** 新增純函式模組 `lib/google-signin.js`（nonce 產生／GIS 初始化）與客戶端元件 `components/GoogleSignInButton.jsx`（載入 GIS 腳本、畫按鈕、回傳 credential）；登入頁改用該元件，成功呼叫 `supabase.auth.signInWithIdToken`，失敗或腳本不可用時退回原本 `signInWithOAuth` 按鈕。CSP 白名單加入 accounts.google.com。

**Tech Stack:** Next.js 14 App Router、`next/script`、Google Identity Services（`https://accounts.google.com/gsi/client`）、`@supabase/supabase-js` `signInWithIdToken`、Vitest + Testing Library（jsdom）。

**Spec:** `docs/superpowers/specs/2026-09-09-google-signin-gis-design.md`

## Global Constraints

- 環境變數：`NEXT_PUBLIC_GOOGLE_CLIENT_ID`（公開值；Production＋Preview 皆設；值＝`198836800878-0mf37447juefcqg1ebbtkf4ine0rjqvg.apps.googleusercontent.com`，與 Supabase Google provider 已設定的 Web Client ID 相同）。
- 未設 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 或 GIS 不可用 → 一律退回原本 `signInWithOAuth` 按鈕，登入不可中斷。
- in-app 瀏覽器（`isInAppBrowser()`）行為不變：不顯示任何 Google 登入。
- Email 登入、`/auth/callback`、`safeNextPath` 不動。
- 文案：自然台灣繁中口語；中文段落套 `word-break: keep-all`（沿用登入頁樣式）。
- 每個任務結束都要 `npx vitest run <相關檔>` 綠燈再 commit；commit 訊息用中文。

---

### Task 1: `lib/google-signin.js` — nonce 與 GIS 初始化純函式

**Files:**
- Create: `lib/google-signin.js`
- Test: `lib/google-signin.test.js`（node 環境，Node 20+ 內建 `globalThis.crypto.subtle`）

**Interfaces:**
- Produces:
  - `export const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client"`
  - `export async function generateNonce(cryptoImpl = globalThis.crypto): Promise<{ nonce: string, hashedNonce: string }>` — `nonce`＝32 bytes 隨機 base64；`hashedNonce`＝`SHA-256(nonce)` 十六進位小寫 64 字元。
  - `export function initGoogleButton(google, el, { clientId, hashedNonce, onCredential, width = 320 }): void` — 呼叫 `google.accounts.id.initialize(...)` 與 `google.accounts.id.renderButton(el, ...)`；GIS callback 收到 `{ credential }` 時呼叫 `onCredential(credential)`。

- [ ] **Step 1: 寫失敗的測試**

```js
// lib/google-signin.test.js
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { generateNonce, initGoogleButton, GIS_SCRIPT_SRC } from "./google-signin.js";

describe("google-signin", () => {
  it("generateNonce：nonce 為 base64、hashedNonce 為其 SHA-256 十六進位（64 字元），每次不同", async () => {
    const a = await generateNonce();
    const b = await generateNonce();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.hashedNonce).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hashedNonce).toBe(createHash("sha256").update(a.nonce).digest("hex"));
    expect(Buffer.from(a.nonce, "base64")).toHaveLength(32);
  });

  it("initGoogleButton：以 client_id＋hashed nonce＋FedCM 初始化，並在指定元素畫標準按鈕；callback 帶出 credential", () => {
    const initialize = vi.fn(); const renderButton = vi.fn();
    const google = { accounts: { id: { initialize, renderButton } } };
    const el = {}; const onCredential = vi.fn();
    initGoogleButton(google, el, { clientId: "cid", hashedNonce: "abc", onCredential, width: 300 });
    expect(initialize).toHaveBeenCalledTimes(1);
    const opts = initialize.mock.calls[0][0];
    expect(opts).toMatchObject({ client_id: "cid", nonce: "abc", use_fedcm_for_prompt: true, ux_mode: "popup" });
    expect(renderButton).toHaveBeenCalledWith(el, expect.objectContaining({ type: "standard", shape: "pill", size: "large", width: 300, locale: "zh_TW" }));
    opts.callback({ credential: "tok" });
    expect(onCredential).toHaveBeenCalledWith("tok");
    opts.callback({}); // 沒 credential 不呼叫
    expect(onCredential).toHaveBeenCalledTimes(1);
  });

  it("GIS_SCRIPT_SRC 是 Google 官方腳本網址", () => {
    expect(GIS_SCRIPT_SRC).toBe("https://accounts.google.com/gsi/client");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/google-signin.test.js`
Expected: FAIL（Cannot find module './google-signin.js'）

- [ ] **Step 3: 最小實作**

```js
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/google-signin.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/google-signin.js lib/google-signin.test.js
git commit -m "feat(auth): Google Identity Services 純函式——nonce 產生與按鈕初始化"
```

---

### Task 2: `components/GoogleSignInButton.jsx` — 載入 GIS、畫按鈕、回傳 credential

**Files:**
- Create: `components/GoogleSignInButton.jsx`
- Test: `components/GoogleSignInButton.test.jsx`（`// @vitest-environment jsdom`）

**Interfaces:**
- Consumes: `GIS_SCRIPT_SRC`、`generateNonce`、`initGoogleButton`（Task 1）。
- Produces: `export default function GoogleSignInButton({ clientId, onCredential, onStateChange, width = 320 })`
  - `onCredential({ credential, nonce })`：使用者選完帳戶後呼叫，`nonce` 為原始值（給 Supabase）。
  - `onStateChange("ready" | "unavailable")`：GIS 就緒或不可用（腳本失敗／`window.google` 缺）。

- [ ] **Step 1: 寫失敗的測試**

```jsx
// components/GoogleSignInButton.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

// next/script 在 jsdom 不會真的載腳本：mock 成掛載後立刻 onReady（或依 __scriptFails 觸發 onError）
vi.mock("next/script", () => ({
  default: function ScriptMock(props) {
    const React = require("react");
    React.useEffect(() => { if (globalThis.__scriptFails) props.onError?.(new Error("blocked")); else props.onReady?.(); }, []);
    return null;
  },
}));

import GoogleSignInButton from "./GoogleSignInButton";

afterEach(() => { cleanup(); delete window.google; globalThis.__scriptFails = false; });

describe("GoogleSignInButton", () => {
  it("腳本就緒＋window.google 存在 → initialize（帶 hashed nonce）、renderButton 畫進容器、回報 ready；callback 帶出 credential 與原始 nonce", async () => {
    const initialize = vi.fn(); const renderButton = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton } } };
    const onCredential = vi.fn(); const onStateChange = vi.fn();
    render(<GoogleSignInButton clientId="cid" onCredential={onCredential} onStateChange={onStateChange} />);
    await waitFor(() => expect(initialize).toHaveBeenCalled());
    const opts = initialize.mock.calls[0][0];
    expect(opts.client_id).toBe("cid");
    expect(opts.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(renderButton.mock.calls[0][0]).toBe(screen.getByTestId("gis-button"));
    expect(onStateChange).toHaveBeenCalledWith("ready");
    opts.callback({ credential: "tok" });
    expect(onCredential).toHaveBeenCalledTimes(1);
    const arg = onCredential.mock.calls[0][0];
    expect(arg.credential).toBe("tok");
    expect(arg.nonce).toBeTypeOf("string");
    expect(arg.nonce).not.toBe(opts.nonce); // 原始 nonce ≠ hashed
  });

  it("腳本載入失敗 → 回報 unavailable，不初始化", async () => {
    globalThis.__scriptFails = true;
    const onStateChange = vi.fn();
    render(<GoogleSignInButton clientId="cid" onCredential={vi.fn()} onStateChange={onStateChange} />);
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith("unavailable"));
  });

  it("腳本就緒但 window.google 不存在（被擴充套件擋） → 回報 unavailable", async () => {
    const onStateChange = vi.fn();
    render(<GoogleSignInButton clientId="cid" onCredential={vi.fn()} onStateChange={onStateChange} />);
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith("unavailable"));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/GoogleSignInButton.test.jsx`
Expected: FAIL（Failed to resolve import "./GoogleSignInButton"）

- [ ] **Step 3: 最小實作**

```jsx
// components/GoogleSignInButton.jsx
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run components/GoogleSignInButton.test.jsx`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add components/GoogleSignInButton.jsx components/GoogleSignInButton.test.jsx
git commit -m "feat(auth): GoogleSignInButton 元件——載入 GIS、畫按鈕、回傳 credential 與 nonce"
```

---

### Task 3: 登入頁接上元件＋保底＋CSP＋文件

**Files:**
- Modify: `app/classroom/login/page.jsx`（`handleGoogle` 附近、Google 按鈕區塊）
- Modify: `next.config.js`（CSP `script-src`／`connect-src`／`frame-src` 加 `https://accounts.google.com`）
- Modify: `CLAUDE.md`（環境變數清單加 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`）
- Test: `app/classroom/login/page.gis.test.jsx`（`// @vitest-environment jsdom`）

**Interfaces:**
- Consumes: `GoogleSignInButton`（Task 2）、既有 `supabase`（`@/lib/supabase`）、`safeNextPath`、`isInAppBrowser`。
- Produces: 登入頁行為——有 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 且 GIS 可用 → GIS 按鈕；否則原本「使用 Google 登入」按鈕（`signInWithOAuth`）；GIS callback → `supabase.auth.signInWithIdToken({ provider: "google", token, nonce })` → `router.push(next)`。

- [ ] **Step 1: 寫失敗的測試**

```jsx
// app/classroom/login/page.gis.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/inapp-browser", () => ({ isInAppBrowser: () => false }));
const signInWithIdToken = vi.fn(); const signInWithOAuth = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signInWithIdToken: (...a) => signInWithIdToken(...a), signInWithOAuth: (...a) => signInWithOAuth(...a), signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), resetPasswordForEmail: vi.fn() } } }));
// 用假的 GoogleSignInButton 直接控制狀態與 callback
let lastProps = null;
vi.mock("@/components/GoogleSignInButton", () => ({ default: (props) => { lastProps = props; return <div data-testid="gis" />; } }));

import ClassroomLoginPage from "./page";

afterEach(() => { cleanup(); vi.clearAllMocks(); lastProps = null; vi.unstubAllEnvs(); });

describe("登入頁 Google 登入（GIS）", () => {
  it("有 NEXT_PUBLIC_GOOGLE_CLIENT_ID → 顯示 GIS 元件而非舊按鈕；credential 回來後用 signInWithIdToken（帶原始 nonce）並導向 /classroom", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    signInWithIdToken.mockResolvedValue({ error: null });
    render(<ClassroomLoginPage />);
    expect(screen.getByTestId("gis")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /使用 Google 登入/ })).toBeNull();
    expect(lastProps.clientId).toBe("cid");
    await lastProps.onCredential({ credential: "tok", nonce: "raw" });
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token: "tok", nonce: "raw" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/classroom"));
  });

  it("signInWithIdToken 失敗 → 顯示錯誤，並退回舊的 Google 網頁登入按鈕", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    signInWithIdToken.mockResolvedValue({ error: { message: "bad audience" } });
    render(<ClassroomLoginPage />);
    await lastProps.onCredential({ credential: "tok", nonce: "raw" });
    expect(await screen.findByText(/Google 登入暫時無法使用/)).toBeTruthy();
    const fallback = screen.getByRole("button", { name: /Google 網頁登入/ });
    fireEvent.click(fallback);
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());
  });

  it("GIS 回報 unavailable → 顯示舊按鈕", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    render(<ClassroomLoginPage />);
    lastProps.onStateChange("unavailable");
    expect(await screen.findByRole("button", { name: /Google 網頁登入/ })).toBeTruthy();
  });

  it("沒有 NEXT_PUBLIC_GOOGLE_CLIENT_ID → 只有舊按鈕，不掛 GIS", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    render(<ClassroomLoginPage />);
    expect(screen.queryByTestId("gis")).toBeNull();
    expect(screen.getByRole("button", { name: /使用 Google 登入/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run app/classroom/login/page.gis.test.jsx`
Expected: FAIL（找不到 gis 元件／signInWithIdToken 未被呼叫）

- [ ] **Step 3: 修改登入頁**

在 `app/classroom/login/page.jsx`：

3a. import 加：
```jsx
import GoogleSignInButton from "@/components/GoogleSignInButton";
```
3b. `export default function ClassroomLoginPage()` 內、`const [resetLoading, ...]` 之後加狀態：
```jsx
  // 自家頁面 Google 登入（GIS）：有 client id 才啟用；GIS 不可用或驗證失敗 → 退回原本的網頁版 OAuth 按鈕
  const gisClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const [gisState, setGisState] = useState("loading"); // loading | ready | unavailable
  const useGis = !!gisClientId && gisState !== "unavailable";
```
3c. `handleGoogle()` 之後加：
```jsx
  // GIS 選完帳戶：把 Google ID token＋原始 nonce 交給 Supabase 建立登入
  async function handleGoogleCredential({ credential, nonce }) {
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    setGoogleLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce });
    if (err) {
      console.error("[login] signInWithIdToken", err.message);
      setError("Google 登入暫時無法使用，請改用下方「Google 網頁登入」或 Email 登入。");
      setGisState("unavailable");
      setGoogleLoading(false);
      return;
    }
    router.push(getNextPath());
  }
```
3d. 把原本 `{!inApp && ( <> <button ... 使用 Google 登入 </button> <div className={styles.divider}>…</div> </> )}` 改成：
```jsx
        {!inApp && (
          <>
            {useGis ? (
              <GoogleSignInButton clientId={gisClientId} onCredential={handleGoogleCredential} onStateChange={setGisState} />
            ) : (
              <button
                type="button"
                className={styles.oauthBtn}
                onClick={handleGoogle}
                disabled={googleLoading || loading}
              >
                <GoogleIcon />
                {googleLoading ? "跳轉中…" : gisClientId ? "使用 Google 網頁登入" : "使用 Google 登入"}
              </button>
            )}
            <div className={styles.divider}>
              {mode === "otp" ? "或使用 Email 連結" : "或使用 Email 登入"}
            </div>
          </>
        )}
```

- [ ] **Step 4: CSP 白名單**

`next.config.js` 三行各加 `https://accounts.google.com`：
```js
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://assets.mediadelivery.net https://www.googletagmanager.com https://connect.facebook.net https://us.i.posthog.com https://tools.google.com https://unpkg.com https://accounts.google.com",
  "frame-src 'self' https://iframe.mediadelivery.net https://player.vimeo.com https://*.vimeo.com https://*.payuni.com.tw https://www.instagram.com https://accounts.google.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://*.payuni.com.tw https://www.googletagmanager.com https://unpkg.com https://smpldsnds.github.io https://accounts.google.com",
```

- [ ] **Step 5: 文件**

`CLAUDE.md` 環境變數區在 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 下一行加：
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID   # Google OAuth Web Client ID（公開值，與 Supabase Google provider 相同）；有設＝登入頁用自家 Google 按鈕（GIS＋signInWithIdToken，帳戶選擇頁顯示 InRecord），未設＝原本 Supabase OAuth 跳轉
```

- [ ] **Step 6: 跑測試確認通過（含既有登入頁測試若有）**

Run: `npx vitest run app/classroom/login components/GoogleSignInButton.test.jsx lib/google-signin.test.js && npx next lint --file app/classroom/login/page.jsx --file components/GoogleSignInButton.jsx --file lib/google-signin.js`
Expected: 全部 PASS、lint 無錯誤

- [ ] **Step 7: Commit**

```bash
git add app/classroom/login/page.jsx next.config.js CLAUDE.md app/classroom/login/page.gis.test.jsx
git commit -m "feat(auth): 登入頁改用自家 Google 登入按鈕（GIS＋signInWithIdToken），GIS 不可用退回網頁版；CSP 放行 accounts.google.com"
```

---

### Task 4: 環境變數、Google Console 來源、preview 驗證

**Files:** 無程式碼；操作 Vercel 與 Google Cloud Console。

- [ ] **Step 1: Vercel 環境變數（Preview＋Production）**

```bash
printf "198836800878-0mf37447juefcqg1ebbtkf4ine0rjqvg.apps.googleusercontent.com" | npx vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID preview
printf "198836800878-0mf37447juefcqg1ebbtkf4ine0rjqvg.apps.googleusercontent.com" | npx vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID production
```

- [ ] **Step 2: Google Cloud Console（需使用者帳號）**

「API 和服務 → 憑證 → 該 OAuth 2.0 用戶端（Web）→ 已授權的 JavaScript 來源」加入：
`https://inrecordmusic.com`、`https://inrecord-preview-inrec.vercel.app`、`http://localhost:3000`。
未加的話 GIS 會回 `origin_mismatch`／按鈕不顯示 → 頁面自動退回網頁版按鈕，不影響登入。

- [ ] **Step 3: 部署 preview 並驗證**

```bash
npx vercel --yes && npx vercel alias set <deployment-url> inrecord-preview-inrec.vercel.app
```
驗證：以無痕視窗開 `https://inrecord-preview-inrec.vercel.app/classroom/login`，應看到 Google 官方樣式按鈕；點擊彈窗上方顯示「登入 InRecord」與 inrecordmusic／vercel 網域；用真實 Google 帳號登入後進 `/classroom`。Playwright 只能檢查按鈕容器存在與 CSP 無 console 錯誤，真實登入由使用者操作。

- [ ] **Step 4: 上正式站（使用者同意後）**

```bash
cd /Users/zhoubolong/code/inrecord && git merge --ff-only feat/lead-capture && git push origin feat/point2-carousel && npx vercel --prod --yes
```

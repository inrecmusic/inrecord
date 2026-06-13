# 手機 BuyModal 底部抽屜 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機（≤640px）把 BuyModal 改為底部抽屜（內容可捲、付款鈕固定底部），桌機/平板維持原本置中彈窗不變。

**Architecture:** 在 `components/BuyModal.jsx` 把彈窗內容分組成 `.sheetBody`（捲動區）+ `.sheetFooter`（常駐底部）兩個 wrapper；base CSS 用 `display: contents` 讓 wrapper 在桌機「消失」於版面（排版與現狀逐像素一致），`@media (max-width:640px)` 才把 `.box` 變 flex column 抽屜、wrapper 變實際捲動/固定區。

**Tech Stack:** React client component、CSS Modules（原生 CSS）。`display: contents` 桌機行為中性化、`env(safe-area-inset-bottom)` 處理 iPhone home bar。

**驗收說明（取代單元測試）：** 純前端佈局/樣式，無法單元測試。每個 Task 的驗證＝`npm run build` 編譯通過 + 於 dev server 用 DevTools 指定寬度目視，並確認桌機彈窗無回歸。

**一次性前置：dev server**
```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run dev
```
開 http://localhost:3000 ，首頁需登入後點「立即購買」開啟 BuyModal（或直接在已登入狀態點方案按鈕）。預備寬度：360 / 375 / 390 / 768 / 1280。

---

## File Structure

- **Modify:** `components/BuyModal.jsx` — return 區塊把內容包成 `.sheetBody` / `.sheetFooter`（不動任何邏輯/狀態/事件）
- **Modify:** `components/BuyModal.module.css` — 新增 `.sheetBody`/`.sheetFooter` base（`display: contents`）+ `@media (max-width:640px)` 抽屜樣式

---

## Task 1: JSX 內容分組 + 桌機中性 wrapper（無視覺變化）

**Files:**
- Modify: `components/BuyModal.jsx`（return 區塊，約 162–285 行）
- Modify: `components/BuyModal.module.css`（新增兩條 base 規則）

- [ ] **Step 1: 重寫 BuyModal 的 return 區塊（包入兩個 wrapper）**

把 `components/BuyModal.jsx` 中 `return ( ... );` 的整段 JSX 替換為下列內容。`.close` 維持 `.box` 直接子；標題～發票區/verifyError 包進 `.sheetBody`；付款鈕/錯誤/備註包進 `.sheetFooter`。**所有 className、狀態、事件、條件式維持不變，只是新增兩層 div 包裝。**

```jsx
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={styles.box} role="dialog" aria-modal="true">
        <button className={styles.close} onClick={onClose}>×</button>

        <div className={styles.sheetBody}>
          <h2>確認購買方案</h2>
          <p className={styles.sub}>零基礎流行鋼琴入門課</p>

          <div className={styles.planCard}>
            <div>
              <strong>{plan.label}</strong>
              <span className={styles.desc}>{plan.desc}</span>
            </div>
            <div className={styles.price}>
              {couponApplied
                ? <><span style={{ textDecoration: "line-through", opacity: .5, fontSize: ".62em", marginRight: 6, fontWeight: 600 }}>NT${Number(plan.price).toLocaleString()}</span>NT${Number(couponApplied.finalPrice).toLocaleString()}</>
                : <>NT${Number(plan.price).toLocaleString()}</>}
            </div>
          </div>

          <div className={styles.couponRow}>
            <input
              className={styles.couponInput}
              type="text"
              placeholder="輸入優惠碼（選填）"
              value={couponInput}
              disabled={!!couponApplied}
              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponMsg(""); }}
              onKeyDown={e => { if (e.key === "Enter" && !couponApplied) { e.preventDefault(); applyCouponCode(); } }}
            />
            {couponApplied
              ? <button type="button" className={styles.couponBtn} onClick={removeCoupon}>移除</button>
              : <button type="button" className={styles.couponBtn} onClick={applyCouponCode} disabled={couponChecking || !couponInput.trim()}>{couponChecking ? "驗證中…" : "套用"}</button>}
          </div>
          {couponApplied && <p className={styles.couponOk}>✅ 已套用「{couponApplied.name}」，折抵 NT${Number(couponApplied.discount).toLocaleString()}</p>}
          {couponMsg && <p className={styles.couponErr}>{couponMsg}</p>}

          {plan.features?.length > 0 && (
            <ul className={styles.features}>
              {plan.features.map(f => (
                <li key={f}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  {f}
                </li>
              ))}
            </ul>
          )}

          <div className={styles.account}>
            <span className={styles.accountLabel}>開通帳號</span>
            <span className={styles.accountEmail}>{email || "（請先登入）"}</span>
          </div>

          <div className={styles.invoiceSection}>
            <span className={styles.invoiceTitle}>發票開立方式</span>

            <label className={`${styles.invoiceOption} ${invoiceType === "email" ? styles.invoiceOptionActive : ""}`}>
              <input type="radio" name="invoiceType" value="email" checked={invoiceType === "email"} onChange={() => setInvoiceType("email")} />
              <span>
                <strong>電子信箱（推薦）</strong>
                <small>發票通知寄到 {email || "購買 Email"}</small>
              </span>
            </label>

            <label className={`${styles.invoiceOption} ${invoiceType === "mobile" ? styles.invoiceOptionActive : ""}`}>
              <input type="radio" name="invoiceType" value="mobile" checked={invoiceType === "mobile"} onChange={() => setInvoiceType("mobile")} />
              <span>
                <strong>手機條碼</strong>
                <small>存入手機條碼載具</small>
              </span>
            </label>
            {invoiceType === "mobile" && (
              <input
                className={styles.invoiceInput}
                type="text"
                placeholder="/ABC+123（斜線開頭 7 碼）"
                value={carrierId}
                maxLength={8}
                onChange={e => { setCarrierId(e.target.value.toUpperCase()); setVerifyError(""); }}
              />
            )}

            <label className={`${styles.invoiceOption} ${invoiceType === "company" ? styles.invoiceOptionActive : ""}`}>
              <input type="radio" name="invoiceType" value="company" checked={invoiceType === "company"} onChange={() => setInvoiceType("company")} />
              <span>
                <strong>公司統編</strong>
                <small>開立統編發票（三聯式）</small>
              </span>
            </label>
            {invoiceType === "company" && (
              <div className={styles.invoiceCompany}>
                <input
                  className={styles.invoiceInput}
                  type="text"
                  inputMode="numeric"
                  placeholder="統一編號（8 位數字）"
                  value={taxId}
                  maxLength={8}
                  onChange={e => { setTaxId(e.target.value.replace(/\D/g, "")); setVerifyError(""); }}
                />
                <input
                  className={styles.invoiceInput}
                  type="text"
                  placeholder="公司抬頭"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>
            )}
          </div>

          {verifyError && <p className={styles.couponErr} style={{ color: "#dc2626" }}>{verifyError}</p>}
        </div>

        <div className={styles.sheetFooter}>
          <button className={styles.proceed} onClick={handleCheckout} disabled={loading || verifying}>
            {loading ? "處理中…" : verifying ? "驗證中…" : "前往付款 →"}
          </button>
          {error && (
            <>
              <div className={styles.errorBox}>{error}</div>
              <button className={styles.retry} onClick={() => { setError(""); handleCheckout(); }}>重新嘗試</button>
            </>
          )}
          <p className={styles.note}>🔒 透過 PAYUNi 統一金流安全付款・支援信用卡、ATM、超商</p>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: 新增 base wrapper CSS（桌機中性化）**

在 `components/BuyModal.module.css` 末端新增：

```css
/* === 底部抽屜 wrapper（桌機中性：display:contents 讓版面如同未包裝）=== */
.sheetBody, .sheetFooter { display: contents; }
```

`display: contents` 使這兩個 wrapper 在桌機不產生 box，其子元素如同 `.box` 的直接子 → 桌機排版與改版前逐像素一致。

- [ ] **Step 3: build 驗證**

Run: `npm run build`
Expected: 編譯成功、無錯誤。

- [ ] **Step 4: 桌機目視確認無回歸**

dev server 寬度 1280：登入後開啟 BuyModal，確認彈窗與改版前一致（置中、圓角、各區塊間距相同）。切換手機條碼/公司統編出現輸入框正常、優惠券套用/移除正常、前往付款可點。

- [ ] **Step 5: Commit**

```bash
git add components/BuyModal.jsx components/BuyModal.module.css
git commit -m "refactor(buymodal): 內容分組為 sheetBody/sheetFooter（display:contents 桌機不變）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 手機底部抽屜樣式（≤640px）

**Files:**
- Modify: `components/BuyModal.module.css`

- [ ] **Step 1: 新增 `@media (max-width: 640px)` 抽屜樣式**

在 `components/BuyModal.module.css` 末端新增：

```css
@keyframes sheetSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

@media (max-width: 640px) {
  .overlay { align-items: flex-end; padding: 0; }

  .box {
    width: 100%;
    max-width: 100%;
    border-radius: 20px 20px 0 0;
    max-height: 92vh;
    padding: 0;
    display: flex;
    flex-direction: column;
    animation: sheetSlideUp .3s ease;
  }
  /* 抽屜頂部 grab handle */
  .box::before {
    content: "";
    position: absolute;
    top: 8px; left: 50%;
    transform: translateX(-50%);
    width: 36px; height: 4px;
    border-radius: 2px;
    background: #cbd5e1;
    z-index: 2;
  }
  .close { top: 12px; right: 12px; }

  .box h2 { font-size: 22px; }

  .sheetBody {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 20px 12px;
  }
  .sheetFooter {
    display: block;
    flex-shrink: 0;
    border-top: 1px solid #eef2f7;
    padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
    background: #fff;
  }

  /* 防 iOS 聚焦自動放大：輸入框 16px */
  .invoiceInput, .couponInput { font-size: 16px; }
}
```

說明：
- `.box` 變 flex column + `max-height: 92vh`，`.sheetBody` 以 `flex:1 1 auto; min-height:0; overflow-y:auto` 取得可捲動區，`.sheetFooter` `flex-shrink:0` 固定在底部。
- `.box::before` 需要 `.box` 為定位容器——`.box` base 已是 `position: relative`（既有），故 grab handle 絕對定位有效。
- grab handle 置中、`.close` 靠右上，兩者錯開不重疊。

- [ ] **Step 2: build 驗證**

Run: `npm run build`
Expected: 編譯成功、無錯誤。

- [ ] **Step 3: 手機目視驗收**

dev server，DevTools 寬度 375 / 390：開啟 BuyModal →
- 從底部滑上、上方圓角、有 grab handle 小灰條
- 內容可上下捲動；「前往付款」固定在底部、捲動時始終可見
- 切換「手機條碼／公司統編」→ 輸入框出現、可捲到、聚焦時頁面**不自動放大**（16px）
- 底部留白不被 iPhone home bar 遮擋（模擬器可看 padding）
- 寬度 360：抽屜不破版、付款鈕可點
- 寬度 1280：仍為置中彈窗（抽屜樣式不套用）

- [ ] **Step 4: Commit**

```bash
git add components/BuyModal.module.css
git commit -m "feat(buymodal): 手機底部抽屜（滑入、可捲、付款鈕固定、16px 防放大）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 全寬度回歸驗收

**Files:** 無（純驗證）

- [ ] **Step 1: 桌機/平板回歸**

dev server 寬度 1280 與 768：BuyModal 仍為置中圓角彈窗，與改版前無視覺差異；hover、優惠券、發票切換、前往付款皆正常。

- [ ] **Step 2: 手機總驗收**

寬度 360 / 375 / 390：抽屜滑入、捲動、付款鈕固定、輸入不放大、無水平溢出、底部安全區正常。

- [ ] **Step 3: 測試 + build**

Run: `npm test && npm run build`
Expected: 測試全綠、build 成功。

---

## Self-Review 對照（spec → task）

- JSX 分組 sheetBody/sheetFooter → Task 1 ✓
- 桌機 display:contents 不變 → Task 1 ✓
- overlay flex-end / box 全寬圓角 max-height flex column → Task 2 ✓
- slideUp 動畫 + grab handle → Task 2 ✓
- sheetBody flex:1 min-height:0 overflow / sheetFooter flex-shrink:0 + safe-area → Task 2 ✓
- 輸入框 16px 防 iOS 放大 → Task 2 ✓
- 桌機/平板回歸 → Task 1 Step4 + Task 3 ✓

# 開票／寄信失敗告警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 付款後開發票或寄開課信失敗時，主動寄 email 告警給管理員，並落地 `email_error`、在後台集中顯示待處理訂單與補救動作。

**Architecture:** 新增 `orders.email_error` 欄位；純函式 `lib/admin-alert.js` 產生告警信並透過 Brevo 寄 `ADMIN_EMAIL`；notify 在開票／寄信失敗點落地錯誤並即時告警（無去重旗標，notify 回 200 不重送）；新增 `/api/admin/resend-email` 補寄信；後台 OrdersPage 頂部新增「待處理告警」面板。

**Tech Stack:** Next.js 14 App Router、Supabase、Brevo transactional email、Vitest。

---

## 設計依據（spec）
`docs/superpowers/specs/2026-06-13-invoice-email-failure-alert-design.md`

## 檔案結構
- 修改 `supabase-deploy.sql` — 新增 `orders.email_error`
- 建立 `lib/admin-alert.js` — 告警信純函式 + Brevo 寄送（唯一職責：管理員告警）
- 建立 `lib/admin-alert.test.js` — 純函式測試
- 修改 `app/api/payuni/notify/route.js` — 落地 email_error + 失敗告警
- 建立 `app/api/admin/resend-email/route.js` — 補寄開課信
- 修改 `app/admin/page.jsx` — OrdersPage「待處理告警」面板 + 補寄按鈕
- 修改 `CLAUDE.md` — API 路由表 + 一句說明

> `/api/admin/orders` 用 `select("*")`，新欄位自動帶出，免改該路由。

---

### Task 1: 新增 `orders.email_error` 欄位

**Files:**
- Modify: `supabase-deploy.sql`

- [ ] **Step 1: 加欄位**

在 `supabase-deploy.sql` 找到這一行：
```sql
  ADD COLUMN IF NOT EXISTS invoice_error TEXT,        -- 最後一次開票失敗原因（成功時清為 null）
```
在它的**下一行**插入：
```sql
  ADD COLUMN IF NOT EXISTS email_error   TEXT,        -- 最後一次寄開課信失敗原因（成功時清為 null）
```
（確認它仍在 `ALTER TABLE orders ... ;` 區塊內、且該區塊最後一行 `ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;` 結尾的分號不變。）

- [ ] **Step 2: 確認語法（讀檔檢視）**

Run: `grep -n "email_error\|fulfilled_at" supabase-deploy.sql`
Expected: 看到新加的 `email_error TEXT,` 在 `invoice_error` 之後、`fulfilled_at` 之前。

- [ ] **Step 3: Commit**

```bash
git add supabase-deploy.sql
git commit -m "feat(db): orders 新增 email_error 欄位（寄信失敗落地）"
```

---

### Task 2: `lib/admin-alert.js` 告警信純函式 + 寄送（TDD）

**Files:**
- Create: `lib/admin-alert.js`
- Test: `lib/admin-alert.test.js`

- [ ] **Step 1: 寫失敗測試**

Create `lib/admin-alert.test.js`:

```js
import { describe, it, expect } from "vitest";
import { buildAdminAlertHtml } from "./admin-alert.js";

const order = { mer_trade_no: "INREC123", email: "buyer@example.com" };

describe("buildAdminAlertHtml", () => {
  it("invoice：主旨/內文含訂單編號、email、原因，且標示『發票』", () => {
    const { subject, html } = buildAdminAlertHtml({ kind: "invoice", order, reason: "amego_9001" });
    expect(subject).toContain("INREC123");
    expect(subject).toContain("發票");
    expect(html).toContain("INREC123");
    expect(html).toContain("buyer@example.com");
    expect(html).toContain("amego_9001");
    expect(html).toContain("發票");
  });

  it("email：標示『開課信』", () => {
    const { subject, html } = buildAdminAlertHtml({ kind: "email", order, reason: "brevo_500" });
    expect(subject).toContain("開課信");
    expect(html).toContain("開課信");
    expect(html).toContain("brevo_500");
  });

  it("缺欄位不丟例外、以 '-' / '未知' 預設", () => {
    const { subject, html } = buildAdminAlertHtml({ kind: "invoice", order: {}, reason: "" });
    expect(subject).toContain("-");
    expect(html).toContain("未知");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/admin-alert.test.js`
Expected: FAIL（`buildAdminAlertHtml` 未定義）

- [ ] **Step 3: 寫實作**

Create `lib/admin-alert.js`:

```js
// 管理員告警信：開票／寄信失敗時通知 ADMIN_EMAIL。
// buildAdminAlertHtml 為純函式（可測）；sendAdminAlert 走 Brevo，失敗不丟例外。

const KIND_LABEL = {
  invoice: "電子發票開立",
  email:   "開課確認信寄送",
};

export function buildAdminAlertHtml({ kind, order = {}, reason = "" }) {
  const label = KIND_LABEL[kind] || "訂單處理";
  const merTradeNo = order.mer_trade_no || "-";
  const email = order.email || "-";
  const subject = `[InRecord] ${label}失敗 — 訂單 ${merTradeNo}`;
  const html = `<!doctype html><html lang="zh-Hant"><body style="font-family:-apple-system,Arial,'PingFang TC',sans-serif;color:#0f172a;">
  <h2 style="color:#b91c1c;">⚠️ ${label}失敗</h2>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">訂單編號</td><td><b>${merTradeNo}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">買家 Email</td><td>${email}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">失敗類型</td><td>${label}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">失敗原因</td><td>${reason || "未知"}</td></tr>
  </table>
  <p style="font-size:14px;color:#334155;">請登入後台「訂單管理 → 待處理告警」面板處理（補開發票 / 補寄開課信）。</p>
  </body></html>`;
  return { subject, html };
}

export async function sendAdminAlert({ subject, html }) {
  const apiKey     = process.env.BREVO_API_KEY;
  const sender     = process.env.BREVO_SENDER_EMAIL;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !sender || !adminEmail) return { success: false, skipped: true };

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "InRecord" },
        to: [{ email: adminEmail }],
        subject,
        htmlContent: html,
      }),
    });
    if (res.ok) return { success: true };
    return { success: false, error: `brevo_${res.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/admin-alert.test.js`
Expected: PASS（3 案）

- [ ] **Step 5: Commit**

```bash
git add lib/admin-alert.js lib/admin-alert.test.js
git commit -m "feat(alert): 管理員告警信純函式 + Brevo 寄送 + 測試"
```

---

### Task 3: notify 落地 email_error + 失敗告警

**Files:**
- Modify: `app/api/payuni/notify/route.js`

- [ ] **Step 1: 加 import**

找到：
```js
import { needsFulfillment, needsInvoice } from "@/lib/order-fulfillment";
```
在其下一行加：
```js
import { buildAdminAlertHtml, sendAdminAlert } from "@/lib/admin-alert";
```

- [ ] **Step 2: 宣告失敗旗標**

找到 order upsert 的 `.select(...).single();` 那一行（以 `coupon_code, fulfilled_at").single();` 結尾），在它**下一行**插入：
```js
        let invoiceFailed = false, invoiceReason = "";
        let emailFailed = false,   emailReason   = "";
```

- [ ] **Step 3: 寄信結果落地 + 記錄失敗**

找到寄信結果處理區塊：
```js
              if (mailResult.success) {
                console.log("[mail] 開課確認信已寄出:", order.email, mailResult.messageId || "");
              } else if (!mailResult.skipped) {
                console.error("[mail] 開課確認信寄送失敗:", mailResult.error);
              }
```
替換為：
```js
              if (mailResult.success) {
                console.log("[mail] 開課確認信已寄出:", order.email, mailResult.messageId || "");
                await supabase.from("orders").update({ email_error: null }).eq("id", order.id);
              } else if (!mailResult.skipped) {
                console.error("[mail] 開課確認信寄送失敗:", mailResult.error);
                emailFailed = true;
                emailReason = mailResult.error || "send_failed";
                await supabase.from("orders").update({ email_error: emailReason }).eq("id", order.id);
              }
```

- [ ] **Step 4: 開票失敗記錄原因**

找到開票失敗的 else 區塊：
```js
          } else {
            await supabase
              .from("orders")
              .update({ invoice_error: invoiceResult.error || `code_${invoiceResult.code || "unknown"}` })
              .eq("id", order.id);
            console.error("[Invoice] 開立失敗:", invoiceResult.error);
          }
```
替換為：
```js
          } else {
            invoiceFailed = true;
            invoiceReason = invoiceResult.error || `code_${invoiceResult.code || "unknown"}`;
            await supabase
              .from("orders")
              .update({ invoice_error: invoiceReason })
              .eq("id", order.id);
            console.error("[Invoice] 開立失敗:", invoiceResult.error);
          }
```

- [ ] **Step 5: 失敗告警（在開票區塊之後、`if (supabase)` 收尾之前）**

找到開票 `if (needsInvoice(order)) { ... }` 區塊的結尾 `}`，其後緊接著是 `if (supabase)` 區塊的收尾 `}`。在這兩個 `}` 之間插入：
```js

        // 開票／寄信失敗 → 主動寄信告警給管理員（失敗不影響付款回應）
        if (invoiceFailed || emailFailed) {
          try {
            const alertOrder = { mer_trade_no: params.MerTradeNo, email: order?.email };
            if (invoiceFailed) {
              await sendAdminAlert(buildAdminAlertHtml({ kind: "invoice", order: alertOrder, reason: invoiceReason }));
            }
            if (emailFailed) {
              await sendAdminAlert(buildAdminAlertHtml({ kind: "email", order: alertOrder, reason: emailReason }));
            }
          } catch (e) {
            console.error("[admin alert error]", e);
          }
        }
```

- [ ] **Step 6: build 驗證**

Run: `npm run build 2>&1 | grep -E "Compiled successfully|payuni/notify|Error"`
Expected: `✓ Compiled successfully`（無 Error）

> 若 build 在 prerender `/page` 或其他**未提交**檔案報錯，那是工作區既有的無關 WIP，與本任務無關；只要 `✓ Compiled successfully` 出現即視為本任務通過。

- [ ] **Step 7: Commit**

```bash
git add app/api/payuni/notify/route.js
git commit -m "feat(notify): 落地 email_error + 開票/寄信失敗主動告警"
```

---

### Task 4: `/api/admin/resend-email` 補寄開課信

**Files:**
- Create: `app/api/admin/resend-email/route.js`

- [ ] **Step 1: 寫路由**

Create `app/api/admin/resend-email/route.js`:

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sendPurchaseEmail } from "@/lib/brevo-email";

// 後台補寄開課確認信（比照 issue-invoice 結構）
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, email, plan, plan_label, mer_trade_no")
    .eq("id", id)
    .single();
  if (error || !order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (!order.email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  const result = await sendPurchaseEmail({
    email:      order.email,
    plan:       order.plan,
    planLabel:  order.plan_label,
    merTradeNo: order.mer_trade_no,
  });

  if (!result.success) {
    await supabase.from("orders").update({ email_error: result.error || "send_failed" }).eq("id", order.id);
    return NextResponse.json({ error: result.error || "send_failed", skipped: result.skipped || false }, { status: 500 });
  }
  await supabase.from("orders").update({ email_error: null }).eq("id", order.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: build 驗證路由出現**

Run: `npm run build 2>&1 | grep "resend-email"`
Expected: 看到 `ƒ /api/admin/resend-email`

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/resend-email/route.js
git commit -m "feat(api): /admin/resend-email 補寄開課信"
```

---

### Task 5: 後台 OrdersPage「待處理告警」面板 + 補寄按鈕

**Files:**
- Modify: `app/admin/page.jsx`（OrdersPage：`issuing` state ~line 717、`issueInvoice` ~739、`allOrders` map ~764、`paid/pending/refunded` ~792、return 內 `statsGrid4` 區 ~818、`<div className={styles.panel}>` ~824）

- [ ] **Step 1: 新增 resending state**

找到：
```jsx
  const [issuing,setIssuing]=useState(null);
```
在其下一行加：
```jsx
  const [resending,setResending]=useState(null);
```

- [ ] **Step 2: 新增 resendEmail 函式**

找到 `issueInvoice` 函式結尾（`finally{setIssuing(null);}` 後的 `}`），在它**之後**插入：
```jsx

  async function resendEmail(realId){
    if(!realId||resending)return;
    setResending(realId);
    try{
      const res=await _api("/api/admin/resend-email",{method:"POST",body:JSON.stringify({id:realId})});
      const d=await res.json();
      if(res.ok&&d.ok){await loadOrders();showToast?.("✅ 開課信已補寄");}
      else showToast?.("❌ 補寄失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 補寄失敗："+e.message);}
    finally{setResending(null);}
  }
```

- [ ] **Step 3: allOrders 加 emailError**

找到：
```jsx
    invoiceError:o.invoice_error||"",
    needInvoice:(o.status==="paid" && !o.invoice_no), // 已付款但未開票（待補開）
```
替換為：
```jsx
    invoiceError:o.invoice_error||"",
    emailError:o.email_error||"",
    needInvoice:(o.status==="paid" && !o.invoice_no), // 已付款但未開票（待補開）
```

- [ ] **Step 4: 新增 needsAttention 清單**

找到：
```jsx
  const paid=allOrders.filter(o=>o.status==="paid");
```
在其**上一行**插入：
```jsx
  const needsAttention=allOrders.filter(o=>o.status==="paid"&&(o.needInvoice||o.invoiceError||o.emailError));
```

- [ ] **Step 5: 插入面板 JSX**

找到 statsGrid4 區塊的收尾與其後的訂單面板開頭：
```jsx
        <StatCard label="已退款訂單" value={refunded.length} sub="筆" icon={BarChart2} color="#dc2626"/>
      </div>
      <div className={styles.panel}>
```
替換為（在 `</div>` 與 `<div className={styles.panel}>` 之間插入告警面板）：
```jsx
        <StatCard label="已退款訂單" value={refunded.length} sub="筆" icon={BarChart2} color="#dc2626"/>
      </div>
      {needsAttention.length>0&&(
        <div className={styles.panel} style={{borderLeft:"4px solid #dc2626",background:"#fff7f7",marginBottom:16}}>
          <div className={styles.panelHead}><h3 style={{margin:0,color:"#b91c1c"}}>⚠️ 待處理告警（{needsAttention.length}）</h3></div>
          <div style={{padding:"4px 16px 16px"}}>
            {needsAttention.map(o=>(
              <div key={o.realId} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 0",borderBottom:"1px solid #fde2e2",flexWrap:"wrap"}}>
                <div style={{fontSize:13}}>
                  <code style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{o.id}</code>
                  <span style={{marginLeft:8,color:"#475569"}}>{o.email}</span>
                  <div style={{marginTop:4,color:"#b91c1c",fontWeight:700}}>
                    {o.emailError&&<span style={{marginRight:10}}>開課信寄送失敗：{o.emailError}</span>}
                    {o.invoiceError&&<span style={{marginRight:10}}>開票失敗：{o.invoiceError}</span>}
                    {!o.invoiceError&&o.needInvoice&&<span style={{marginRight:10}}>發票待補開</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {o.needInvoice&&<button className={styles.btnSmall} disabled={issuing===o.realId} onClick={()=>issueInvoice(o.realId)}>{issuing===o.realId?"補開中…":"補開發票"}</button>}
                  {o.emailError&&<button className={styles.btnSmall} disabled={resending===o.realId} onClick={()=>resendEmail(o.realId)}>{resending===o.realId?"補寄中…":"補寄開課信"}</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={styles.panel}>
```

- [ ] **Step 6: build 驗證**

Run: `npm run build 2>&1 | grep -E "Compiled successfully|Error"`
Expected: `✓ Compiled successfully`（若 prerender 在未提交的 WIP 檔報錯，與本任務無關，見 Task 3 Step 6 註）

- [ ] **Step 7: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 訂單管理待處理告警面板 + 補寄開課信"
```

---

### Task 6: CLAUDE.md + 全量驗證

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: API 路由表加一列**

在 `CLAUDE.md` 的「主要 API 路由」表格，於 `/api/admin/issue-invoice` 那一列**之後**插入：
```
| `/api/admin/resend-email` | POST | 後台補寄開課確認信（Brevo） |
```

- [ ] **Step 2: 補一句說明**

在「### 影片防盜保護（Bunny）」段落**之前**（或「主要 API 路由」表格之後的適當位置）新增：
```
### 失敗告警（開票／寄信）

- 付款後 notify 若開發票或寄開課信失敗：落地 `orders.invoice_error` / `orders.email_error`，並即時寄 email 告警給 `ADMIN_EMAIL`（`lib/admin-alert.js`，純函式產信 + Brevo）。後台「訂單管理」頂部「待處理告警」面板集中顯示，可一鍵補開發票 / 補寄開課信（`/api/admin/issue-invoice`、`/api/admin/resend-email`）。
- notify 對失敗仍回 200（PAYUNi 不重送）、履約區有原子 claim，故告警無需去重旗標。
```

- [ ] **Step 3: 全量測試 + build**

Run: `npm test`
Expected: 全數 PASS（含 admin-alert 3 案）

Run: `npm run build 2>&1 | grep -E "Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 補失敗告警與 resend-email 說明（CLAUDE.md）"
```

---

## 部署（👤，實作後）
- 正式 Supabase 執行 `supabase-deploy.sql`（補 `email_error` 欄位）
- 確認 Vercel Production 已有 `ADMIN_EMAIL`、`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`（皆既有 env）
- 部署 `npx vercel --prod`（先 `vercel whoami` 確認 inrecmusic 帳號）

## Self-Review 結果
- **Spec coverage**：email_error 欄位（T1）、告警純函式+寄送（T2）、notify 落地+告警（T3）、補寄信路由（T4）、後台面板+補救（T5）、文件（T6）全覆蓋。
- **Placeholder scan**：無 TBD/TODO；每個 code step 均含完整程式碼或精確 grep/build 指令。
- **Type/命名一致**：`buildAdminAlertHtml({kind,order,reason})→{subject,html}`（T2 定義、T3 呼叫一致）；`sendAdminAlert({subject,html})`（T2/T3 一致）；`email_error` 欄位（T1 建、T3/T4 寫、T5 讀 `o.email_error`→`emailError`）；`resendEmail`/`resending`（T5 內一致）；resend API 路徑 `/api/admin/resend-email`（T4 建、T5 呼叫一致）。

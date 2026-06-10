# 載具/統編事前驗證 + 開票失敗記錄補救 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 結帳前驗證手機載具/統編是否真實存在（無效即時擋下），並在付款後開票失敗時記錄原因供後台補開。

**Architecture:** 新增驗證 lib（Amego `/json/barcode` 驗載具、g0v API 驗統編）與 `/api/invoice/validate` 路由供前端即時呼叫；BuyModal 即時驗證、checkout 後端再驗一次當保險；`orders` 新增 `invoice_error` 欄位，notify/issue-invoice 維護它，後台 OrdersPage 標示開票失敗。驗證 API 連線失敗時採「放行」降級，由開票失敗機制兜底。

**Tech Stack:** Next.js 14 App Router (route handlers)、Supabase REST、Amego 發票 API、g0v 公司登記 API。

**測試方式說明:** 本專案無單元測試框架，沿用既有慣例以 **sandbox 整合測試**驗證（node 腳本 / curl 打線上 sandbox 端點，比對輸出）。每個任務的驗證步驟皆為可執行指令與預期輸出。所有測試用 `sandbox-*@inrecord.com` email，測畢作廢測試發票並刪除測試資料；**絕不刪除** `inrecmusic@gmail.com`、`alan52jay@gmail.com` 的資料。

**已確認的外部端點（實測）:**
- 載具驗證：`POST {AMEGO_API_URL}/json/barcode`，body 同 createInvoice（`invoice`,`data`,`time`,`sign=md5(data+time+AMEGO_APP_KEY)`），`data = {"barCode":"/AHDCYW4"}`。有效→`{"code":0}`；不存在→`{"code":9000113,"msg":"手機條碼不存在"}`。
- 統編驗證：`GET https://company.g0v.ronny.tw/api/show/{統編}`。存在→`{"data":{"公司名稱":"...",...}}`；不存在→`data` 無 `公司名稱`。

---

## File Structure

- Create `lib/amego-verify.js` — 驗證函式 `verifyCarrier(barcode)`、`verifyTaxId(taxId)`。
- Create `app/api/invoice/validate/route.js` — 前端即時驗證用的 POST 路由。
- Modify `app/api/payuni/checkout/route.js` — 建單前對載具/統編做存在性驗證（保險）。
- Modify `components/BuyModal.jsx` — 失焦/送出前即時驗證、統編自動帶公司名。
- Modify `supabase-schema-invoice.sql` — 新增 `invoice_error` 欄位（文件）。
- Modify `app/api/payuni/notify/route.js` — 開票成功清 error、失敗寫 error。
- Modify `app/api/admin/issue-invoice/route.js` — 補開成功清 error。
- Modify `app/admin/page.jsx`（`OrdersPage`）— 顯示「開票失敗：<原因>」與側欄待補開標記。

---

## Task 1: 載具驗證函式 verifyCarrier

**Files:**
- Create: `lib/amego-verify.js`
- Verify: `/tmp/t1.mjs`（臨時測試腳本）

- [ ] **Step 1: 建立 lib/amego-verify.js（先只含 verifyCarrier）**

```js
import crypto from "crypto";

// 共用：呼叫 Amego JSON API（沿用 amego-invoice.js 的簽章慣例）
async function amegoPost(endpoint, dataObj) {
  const appKey = process.env.AMEGO_APP_KEY;
  const data = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);
  const sign = crypto.createHash("md5").update(data + time + appKey).digest("hex");
  const params = new URLSearchParams({
    invoice: process.env.AMEGO_IDENTIFIER,
    data,
    time: String(time),
    sign,
  });
  const res = await fetch(`${process.env.AMEGO_API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.json();
}

// 驗證手機載具（手機條碼）是否真實存在
// 回傳：{ valid:true } | { valid:false, error } | { valid:true, degraded:true }（API 失敗時放行）
export async function verifyCarrier(barcode) {
  if (!process.env.AMEGO_APP_KEY || !process.env.AMEGO_IDENTIFIER) {
    return { valid: true, degraded: true }; // 缺設定不擋
  }
  try {
    const r = await amegoPost("/json/barcode", { barCode: barcode });
    if (r.code === 0) return { valid: true };
    // 9000113 = 手機條碼不存在；其餘視為明確無效
    return { valid: false, error: r.msg || `amego_${r.code}` };
  } catch {
    return { valid: true, degraded: true }; // 連線失敗→放行，由開票失敗機制兜底
  }
}
```

- [ ] **Step 2: 寫測試腳本並執行（真實 vs 不存在條碼）**

建立 `/tmp/t1.mjs`：

```js
import { verifyCarrier } from "/Users/zhoubolong/Desktop/Claude code/inrecord/lib/amego-verify.js";
const env = await import("node:fs").then(fs => fs.readFileSync("/Users/zhoubolong/Desktop/Claude code/inrecord/.env.local","utf8"));
for (const line of env.split("\n")) { const m=line.match(/^(AMEGO_[A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2]; }
console.log("valid  /AHDCYW4 =>", await verifyCarrier("/AHDCYW4"));
console.log("invalid /ABC.123 =>", await verifyCarrier("/ABC.123"));
```

Run: `node /tmp/t1.mjs`
Expected:
```
valid  /AHDCYW4 => { valid: true }
invalid /ABC.123 => { valid: false, error: '手機條碼不存在' }
```

- [ ] **Step 3: Commit**

```bash
git add lib/amego-verify.js
git commit -m "feat(invoice): add verifyCarrier (Amego /json/barcode)"
```

---

## Task 2: 統編驗證函式 verifyTaxId

**Files:**
- Modify: `lib/amego-verify.js`
- Verify: `/tmp/t2.mjs`

- [ ] **Step 1: 在 lib/amego-verify.js 末尾新增 verifyTaxId**

```js
// 驗證統一編號是否真實存在（g0v 公司登記聚合 API，涵蓋公司+商號），並回公司名
// 回傳：{ valid:true, name } | { valid:false } | { valid:true, degraded:true }
export async function verifyTaxId(taxId) {
  try {
    const res = await fetch(`https://company.g0v.ronny.tw/api/show/${encodeURIComponent(taxId)}`, {
      headers: { "User-Agent": "inrecord" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { valid: true, degraded: true };
    const j = await res.json();
    const name = j?.data?.["公司名稱"] || j?.data?.["商業名稱"];
    if (name) return { valid: true, name };
    return { valid: false };
  } catch {
    return { valid: true, degraded: true }; // 連線/逾時→放行
  }
}
```

- [ ] **Step 2: 寫測試腳本並執行（真實 vs 不存在統編）**

建立 `/tmp/t2.mjs`：

```js
import { verifyTaxId } from "/Users/zhoubolong/Desktop/Claude code/inrecord/lib/amego-verify.js";
console.log("valid  22099131 =>", await verifyTaxId("22099131"));
console.log("invalid 12345675 =>", await verifyTaxId("12345675"));
```

Run: `node /tmp/t2.mjs`
Expected:
```
valid  22099131 => { valid: true, name: '台灣積體電路製造股份有限公司' }
invalid 12345675 => { valid: false }
```

- [ ] **Step 3: Commit**

```bash
git add lib/amego-verify.js
git commit -m "feat(invoice): add verifyTaxId (g0v company registry)"
```

---

## Task 3: 驗證 API 路由 /api/invoice/validate

**Files:**
- Create: `app/api/invoice/validate/route.js`
- Verify: curl 線上（部署後）或本機 dev

- [ ] **Step 1: 建立路由**

```js
import { NextResponse } from "next/server";
import { verifyCarrier, verifyTaxId } from "@/lib/amego-verify";

// 前端即時驗證：{ type:"mobile"|"company", value } → { valid, name?, error? }
export async function POST(req) {
  try {
    const { type, value } = await req.json();
    const v = String(value || "").trim();
    if (!v) return NextResponse.json({ valid: false, error: "empty" }, { status: 400 });

    if (type === "mobile") {
      const r = await verifyCarrier(v.toUpperCase());
      return NextResponse.json(r);
    }
    if (type === "company") {
      const r = await verifyTaxId(v);
      return NextResponse.json(r);
    }
    return NextResponse.json({ valid: false, error: "invalid_type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ valid: true, degraded: true, error: err.message });
  }
}
```

- [ ] **Step 2: 部署並驗證**

Run:
```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npx vercel --prod --yes 2>&1 | tail -3
curl -s -X POST https://inrecord-swart.vercel.app/api/invoice/validate -H "Content-Type: application/json" -d '{"type":"mobile","value":"/AHDCYW4"}'
echo
curl -s -X POST https://inrecord-swart.vercel.app/api/invoice/validate -H "Content-Type: application/json" -d '{"type":"mobile","value":"/ABC.123"}'
echo
curl -s -X POST https://inrecord-swart.vercel.app/api/invoice/validate -H "Content-Type: application/json" -d '{"type":"company","value":"22099131"}'
```
Expected:
```
{"valid":true}
{"valid":false,"error":"手機條碼不存在"}
{"valid":true,"name":"台灣積體電路製造股份有限公司"}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/invoice/validate/route.js
git commit -m "feat(invoice): add /api/invoice/validate route"
```

---

## Task 4: checkout 後端保險驗證

**Files:**
- Modify: `app/api/payuni/checkout/route.js`
- Verify: curl 線上

- [ ] **Step 1: 匯入驗證函式**

在 `app/api/payuni/checkout/route.js` 頂部 import 區加入：

```js
import { verifyCarrier, verifyTaxId } from "@/lib/amego-verify";
```

- [ ] **Step 2: 在發票欄位驗證區塊加入存在性檢查**

在 `checkout/route.js` 的發票欄位驗證段落中，把現有兩個分支改為（統編分支於 `buyerName` 檢查通過後、carrier 分支於格式通過後加入存在性驗證；只有「明確無效」才擋，degraded 放行）：

統編分支（`if (body.buyerTaxId) { ... }`）內，`buyerName = ...` 之後加：

```js
      const taxCheck = await verifyTaxId(id);
      if (taxCheck.valid === false) {
        return NextResponse.json({ error: "tax_id_not_exist" }, { status: 400 });
      }
```

載具分支（`else if (body.carrierType) { ... }`）內，`carrierId = cid;` 之前（`cid` 驗證通過後）加：

```js
      const carrierCheck = await verifyCarrier(cid);
      if (carrierCheck.valid === false) {
        return NextResponse.json({ error: "carrier_not_exist" }, { status: 400 });
      }
```

- [ ] **Step 3: 部署並驗證（不存在載具應被擋、真實載具放行）**

Run:
```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npx vercel --prod --yes 2>&1 | tail -3
# 不存在載具 → 應回 carrier_not_exist
curl -s -X POST https://inrecord-swart.vercel.app/api/payuni/checkout -H "Content-Type: application/json" -d '{"plan":"game","email":"sandbox-v4@inrecord.com","carrierType":"3J0002","carrierId":"/ABC.123"}'
echo
# 真實載具 → 應回 url（放行）
curl -s -X POST https://inrecord-swart.vercel.app/api/payuni/checkout -H "Content-Type: application/json" -d '{"plan":"game","email":"sandbox-v4@inrecord.com","carrierType":"3J0002","carrierId":"/AHDCYW4"}' | python3 -c "import sys,json;print('url' in json.load(sys.stdin))"
```
Expected:
```
{"error":"carrier_not_exist"}
True
```

- [ ] **Step 4: 清理測試訂單並 commit**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord"
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-); SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
curl -s -X DELETE "$SUPA_URL/rest/v1/orders?email=eq.sandbox-v4@inrecord.com" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: return=representation" | python3 -c "import sys,json;print('刪',len(json.load(sys.stdin)))"
git add app/api/payuni/checkout/route.js
git commit -m "feat(checkout): verify carrier/tax-id existence before creating order"
```

---

## Task 5: BuyModal 即時驗證 + 統編自動帶公司名

**Files:**
- Modify: `components/BuyModal.jsx`
- Verify: 本機 dev 手動操作

- [ ] **Step 1: 新增驗證狀態與函式**

在 `BuyModal` 元件內（`validateInvoice` 附近）加入狀態與非同步驗證函式：

```jsx
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // 呼叫後端即時驗證載具/統編存在性；回傳 true=可繼續（含 degraded）
  async function verifyInvoiceField() {
    setVerifyError("");
    let type, value;
    if (invoiceType === "mobile") { type = "mobile"; value = carrierId.trim().toUpperCase(); }
    else if (invoiceType === "company") { type = "company"; value = taxId.trim(); }
    else return true; // email 載具不需驗
    setVerifying(true);
    try {
      const res = await fetch("/api/invoice/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const d = await res.json();
      if (d.valid === false) {
        setVerifyError(type === "mobile" ? "查無此手機條碼，請確認後重新輸入" : "查無此統一編號，請確認後重新輸入");
        return false;
      }
      if (type === "company" && d.name) setCompanyName(d.name); // 自動帶公司名
      return true;
    } catch {
      return true; // 前端驗證失敗不擋（後端會再驗）
    } finally {
      setVerifying(false);
    }
  }
```

- [ ] **Step 2: 送出流程串接驗證（格式通過後、建立結帳前）**

在 `startBuy`／送出處理函式中，現有 `const invalid = validateInvoice(); if (invalid) {...return;}` 之後、`fetch(...checkout)` 之前插入：

```jsx
    const ok = await verifyInvoiceField();
    if (!ok) return; // verifyError 已設，畫面顯示紅字
```

- [ ] **Step 3: 顯示驗證錯誤與載入狀態**

在發票欄位區塊下方加入錯誤訊息，並讓購買鈕在 `verifying` 時禁用＋顯示文字。錯誤訊息：

```jsx
        {verifyError && <p className={styles.invoiceError} style={{color:"#dc2626",fontSize:13,marginTop:6}}>{verifyError}</p>}
```

購買鈕（找到送出按鈕）加上 `disabled={verifying || ...}` 與文字 `{verifying ? "驗證中…" : "前往付款"}`（依現有按鈕文字調整）。

- [ ] **Step 4: 本機驗證（dev）**

Run:
```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run dev
```
手動：開 BuyModal → 選手機載具填 `/ABC.123` → 送出應顯示「查無此手機條碼」且不前往付款；改填 `/AHDCYW4` → 通過。選統編填 `22099131` → 公司名自動帶入「台灣積體電路製造股份有限公司」；填 `12345675` → 顯示「查無此統一編號」。
完成後 Ctrl-C 關閉 dev server。

- [ ] **Step 5: Commit**

```bash
git add components/BuyModal.jsx
git commit -m "feat(BuyModal): real-time carrier/tax-id validation + company name autofill"
```

---

## Task 6: DB schema — orders.invoice_error

**Files:**
- Modify: `supabase-schema-invoice.sql`
- Migrate: Supabase（REST 無法 DDL，需在 Supabase SQL Editor 執行，或用 run-migration 路由）

- [ ] **Step 1: 更新 schema 文件**

在 `supabase-schema-invoice.sql` 的 `ALTER TABLE orders` 區塊加入一行：

```sql
ADD COLUMN IF NOT EXISTS invoice_error TEXT;
```

- [ ] **Step 2: 在 Supabase 執行 DDL**

於 Supabase Dashboard → SQL Editor 執行：

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_error TEXT;
```

- [ ] **Step 3: 驗證欄位存在**

Run:
```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord"
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-); SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
curl -s "$SUPA_URL/rest/v1/orders?select=id,invoice_error&limit=1" -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
```
Expected: 回傳 JSON 含 `invoice_error` 欄位（值為 null），無 `column ... does not exist` 錯誤。

- [ ] **Step 4: Commit**

```bash
git add supabase-schema-invoice.sql
git commit -m "feat(db): add orders.invoice_error column"
```

---

## Task 7: notify 維護 invoice_error

**Files:**
- Modify: `app/api/payuni/notify/route.js`
- Verify: 模擬 notify（sandbox）

- [ ] **Step 1: 開票失敗時寫入 invoice_error、成功時清空**

在 `notify/route.js` 的發票區塊（`if (invoiceResult.success) { ... } else { ... }`）改為：

```js
          if (invoiceResult.success) {
            await supabase
              .from("orders")
              .update({ invoice_no: invoiceResult.invoiceNo, invoice_error: null })
              .eq("id", order.id);
            console.log("[Invoice] 開立成功:", invoiceResult.invoiceNo);
          } else {
            await supabase
              .from("orders")
              .update({ invoice_error: invoiceResult.error || `code_${invoiceResult.code || "unknown"}` })
              .eq("id", order.id);
            console.error("[Invoice] 開立失敗:", invoiceResult.error);
          }
```

- [ ] **Step 2: 部署**

Run: `cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npx vercel --prod --yes 2>&1 | tail -3`
Expected: deployment ready。

- [ ] **Step 3: Commit**

```bash
git add app/api/payuni/notify/route.js
git commit -m "feat(notify): record invoice_error on failure, clear on success"
```

> 註：完整失敗→補開的整合驗證在 Task 10 一起做（需要先有 Task 8、9）。

---

## Task 8: issue-invoice 補開成功清 invoice_error

**Files:**
- Modify: `app/api/admin/issue-invoice/route.js`

- [ ] **Step 1: 補開成功時一併清空 invoice_error**

把 `app/api/admin/issue-invoice/route.js` 結尾的更新改為：

```js
  await supabase.from("orders").update({ invoice_no: result.invoiceNo, invoice_error: null }).eq("id", order.id);
  return NextResponse.json({ ok: true, invoiceNo: result.invoiceNo });
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/issue-invoice/route.js
git commit -m "feat(admin): clear invoice_error after manual invoice issue"
```

---

## Task 9: 後台 OrdersPage 標示開票失敗

**Files:**
- Modify: `app/admin/page.jsx`（`OrdersPage`，必要時側欄 badge）
- Verify: 本機 dev 手動

- [ ] **Step 1: allOrders 帶入 invoice_error，並計算待補開數**

在 `OrdersPage` 的 `allOrders` map（約 745–756 行）加入欄位：

```jsx
    invoiceNo:o.invoice_no||"",
    invoiceError:o.invoice_error||"",
    needInvoice:(o.status==="paid" && !o.invoice_no), // 已付款但未開票
```

並在統計區計算：

```jsx
  const failedInvoices=allOrders.filter(o=>o.needInvoice);
```

- [ ] **Step 2: 訂單列／詳情顯示「開票失敗」狀態與原因**

在訂單表格的發票欄位（顯示 `invoiceNo` 之處）改為：已開票顯示號碼；`needInvoice` 顯示紅字狀態與既有補開按鈕：

```jsx
{o.invoiceNo
  ? <span>{o.invoiceNo}</span>
  : o.needInvoice
    ? <span style={{color:"#dc2626",fontSize:12}}>
        開票失敗{o.invoiceError?`：${o.invoiceError}`:""}
        <button onClick={()=>issueInvoice(o.realId)} disabled={issuing===o.realId} style={{marginLeft:8}}>
          {issuing===o.realId?"補開中…":"補開發票"}
        </button>
      </span>
    : <span style={{color:"#94a3b8"}}>—</span>}
```

（若既有表格已有補開按鈕，整併為此邏輯，避免重複。）

- [ ] **Step 3: 側欄「訂單管理」加待補開數量標記**

在側欄選單 `orders` 項目顯示 `failedInvoices.length`（沿用既有 `badgeKey`/badge 機制；若無，於 label 後加 `{failedInvoices.length>0 && <span className={styles.badge}>{failedInvoices.length}</span>}`）。

- [ ] **Step 4: 本機驗證（dev）**

Run: `cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run dev`
手動：登入後台 → 訂單管理 → 確認「開票失敗」訂單顯示紅字原因與「補開發票」按鈕、側欄有數量標記。完成後 Ctrl-C。

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): show invoice-failed orders with reason + retry + sidebar badge"
```

---

## Task 10: 端到端 sandbox 整合驗證 + 清理

**Files:**
- Verify only（無程式變更）

- [ ] **Step 1: 部署最新版**

Run: `cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npx vercel --prod --yes 2>&1 | tail -3`

- [ ] **Step 2: A 驗證（前段已於 Task 3/4 驗過，這裡確認 checkout 擋無效載具）**

Run:
```bash
curl -s -X POST https://inrecord-swart.vercel.app/api/payuni/checkout -H "Content-Type: application/json" -d '{"plan":"game","email":"sandbox-e2e@inrecord.com","carrierType":"3J0002","carrierId":"/ABC.123"}'
```
Expected: `{"error":"carrier_not_exist"}`（不建單）。

- [ ] **Step 3: B 驗證（製造開票失敗 → 記錄 → 後台補開）**

製造一筆「付款成功但開票失敗」：直接對 notify 送一筆 plan=game 的成功通知，但訂單帶**不存在載具**（繞過 A，因為直接寫 DB）。腳本：

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord"
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-); SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-); H=(-H "apikey: $SRK" -H "Authorization: Bearer $SRK")
EMAIL="sandbox-e2e-fail@inrecord.com"; MTN="INREC$(date +%s)999"
# 直接插入一筆帶不存在載具的 pending 訂單
curl -s -X POST "$SUPA_URL/rest/v1/orders" "${H[@]}" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "{\"plan\":\"game\",\"plan_label\":\"AI 遊戲單買\",\"amount\":1200,\"currency\":\"twd\",\"mer_trade_no\":\"$MTN\",\"email\":\"$EMAIL\",\"status\":\"pending\",\"carrier_type\":\"3J0002\",\"carrier_id\":\"/ABC.123\"}" | python3 -c "import sys,json;print('建單',json.load(sys.stdin)[0]['mer_trade_no'])"
# 簽發 TradeStatus=1 notify
MTN="$MTN" node -e '
  const c=require("crypto");const key="8k47JdWzOQmUhV5XwWv3EYweabhmhHsj",iv="Enof55IBPXsSpQr7",mer="S044418824";
  function enc(p){const x=c.createCipheriv("aes-256-gcm",Buffer.from(key),Buffer.from(iv));let e=x.update(p,"utf8","base64");e+=x.final("base64");return Buffer.from(e+":::"+x.getAuthTag().toString("base64"),"utf8").toString("hex");}
  function h(e){return c.createHash("sha256").update(key+e+iv).digest("hex").toUpperCase();}
  const pr={Status:"SUCCESS",MerID:mer,MerTradeNo:process.env.MTN,TradeNo:"SIMU"+Date.now(),TradeAmt:"1200",TradeStatus:"1",PaymentType:"1"};
  const E=enc(new URLSearchParams(pr).toString());
  fetch("https://inrecord-swart.vercel.app/api/payuni/notify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({Status:"SUCCESS",MerID:mer,Version:"1.0",EncryptInfo:E,HashInfo:h(E)}).toString()}).then(r=>r.text()).then(t=>console.log("notify",t));
'
sleep 2
curl -s "$SUPA_URL/rest/v1/orders?email=eq.$EMAIL&select=status,invoice_no,invoice_error" "${H[@]}"
```
Expected: 訂單 `status=paid`、`invoice_no=null`、`invoice_error` 含「載具號碼不存在」之類訊息。

- [ ] **Step 4: 後台補開驗證（手動）**

Run: 後台 → 訂單管理 → 找到 `sandbox-e2e-fail@…` 顯示「開票失敗：…」→ 按「補開發票」。
（補開會用同一個不存在載具再失敗——預期仍失敗、alert 顯示原因。此步驟驗證的是「失敗可見 + 補開動作可觸發」。若要驗證補開成功路徑：先用 SQL/REST 把該訂單 `carrier_type`/`carrier_id` 清為 null，再按補開 → 應開出發票並清空 `invoice_error`。）

清 carrier 後補開：
```bash
curl -s -X PATCH "$SUPA_URL/rest/v1/orders?email=eq.$EMAIL" "${H[@]}" -H "Content-Type: application/json" -d '{"carrier_type":null,"carrier_id":null}'
```
然後後台按「補開發票」→ 應成功、`invoice_error` 清空、出現發票號。

- [ ] **Step 5: 清理測試資料（含作廢補開成功的發票）**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord"
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-); SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-); H=(-H "apikey: $SRK" -H "Authorization: Bearer $SRK")
# 若補開成功有發票號，先用 Amego c0501 作廢（參考既有作法），再刪訂單/開通
for t in subscriptions enrollments orders; do
  curl -s -X DELETE "$SUPA_URL/rest/v1/$t?email=like.sandbox-e2e*@inrecord.com" "${H[@]}" -H "Prefer: return=representation" | python3 -c "import sys,json;print('$t 刪',len(json.load(sys.stdin)))"
done
# 核對只剩兩個保留帳號
curl -s "$SUPA_URL/rest/v1/orders?select=email" "${H[@]}" | python3 -c "import sys,json,collections;d=json.load(sys.stdin);print(dict(collections.Counter(r.get('email') or '(空)' for r in d)))"
```
Expected: 測試資料刪除後，orders 只剩 `inrecmusic@gmail.com`、`alan52jay@gmail.com`。

- [ ] **Step 6: 更新記憶**

更新 `~/.claude/.../memory/project_inrecord_payuni.md`：記錄載具驗證端點（Amego `/json/barcode` 欄位 `barCode`，9000113=不存在）、統編驗證（g0v `company.g0v.ronny.tw/api/show/{統編}`）、`orders.invoice_error` 欄位與後台補開標示，並標注「驗證 API 失敗採放行降級」。

---

## Self-Review 結果

- **Spec 覆蓋**：A1→Task1/2/3、A2→Task5、A3→Task4、降級→Task1/2（degraded）、B1→Task6、B2→Task7、B3→Task8、B4→Task9、測試→Task10。皆有對應。
- **Placeholder**：無 TBD/TODO；所有步驟含實際程式碼與指令。
- **型別/命名一致**：`verifyCarrier`/`verifyTaxId` 回傳 `{valid, name?, error?, degraded?}` 全程一致；`invoice_error` 欄位名一致；`/api/invoice/validate` 介面一致。
- **調整紀錄**：統編改用 g0v（非 Amego）+ 自動帶公司名，已於計畫反映。

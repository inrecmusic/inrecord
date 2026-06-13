# 訂單對帳報表 — 期間財務彙整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後台「訂單管理」頁加「對帳彙整」面板，依日期區間顯示營收/退款/付款方式/發票/折抵彙整並可匯出對帳 CSV。

**Architecture:** 純函式 `lib/reconciliation.js` 的 `summarizeOrders(orders, catalog)` 負責彙整；OrdersPage 以原始 `rows` 依日期區間篩選後傳入，渲染面板並匯出 CSV。無新後端 API。

**Tech Stack:** Next.js（client component）、Vitest。

---

## 設計依據（spec）
`docs/superpowers/specs/2026-06-13-reconciliation-report-design.md`

## 檔案結構
- 建立 `lib/reconciliation.js` — 彙整純函式（唯一職責）
- 建立 `lib/reconciliation.test.js` — 純函式測試
- 修改 `app/admin/page.jsx` — OrdersPage 加面板 + 對帳 CSV（`Download` 圖示已引入；需新增 `PLAN_CATALOG`、`summarizeOrders` 兩個 import）
- 修改 `CLAUDE.md` — 一句說明

---

### Task 1: `lib/reconciliation.js` 彙整純函式（TDD）

**Files:**
- Create: `lib/reconciliation.js`
- Test: `lib/reconciliation.test.js`

- [ ] **Step 1: 寫失敗測試**

Create `lib/reconciliation.test.js`:

```js
import { describe, it, expect } from "vitest";
import { summarizeOrders } from "./reconciliation.js";

const catalog = { course: { price: 3800 }, bundle: { price: 3999 } };

describe("summarizeOrders", () => {
  it("混合狀態：paid/refunded/pending 金額與筆數正確，有效收款不含退款", () => {
    const orders = [
      { status: "paid", amount: 3800, pay_type: "信用卡", invoice_no: "AB1", plan: "course" },
      { status: "paid", amount: 3999, pay_type: "ATM", plan: "bundle" },
      { status: "refunded", amount: 3800, pay_type: "信用卡", plan: "course" },
      { status: "pending", amount: 3800, plan: "course" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.paid).toEqual({ count: 2, amount: 7799 });
    expect(r.refunded).toEqual({ count: 1, amount: 3800 });
    expect(r.pending.count).toBe(1);
  });

  it("byPayType：僅計 paid、依 pay_type 分組（null→未知）", () => {
    const orders = [
      { status: "paid", amount: 100, pay_type: "信用卡" },
      { status: "paid", amount: 200, pay_type: "信用卡" },
      { status: "paid", amount: 50 },
      { status: "refunded", amount: 999, pay_type: "信用卡" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.byPayType["信用卡"]).toEqual({ count: 2, amount: 300 });
    expect(r.byPayType["未知"]).toEqual({ count: 1, amount: 50 });
  });

  it("invoice：paid 中 issued/missing 計數", () => {
    const orders = [
      { status: "paid", amount: 1, invoice_no: "X" },
      { status: "paid", amount: 1 },
      { status: "paid", amount: 1, invoice_no: "" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.invoice).toEqual({ issued: 1, missing: 2 });
  });

  it("coupon：折抵 = 原價 − 實付（僅 paid 且有 coupon_code）", () => {
    const orders = [
      { status: "paid", amount: 3000, plan: "course", coupon_code: "SAVE800" },
      { status: "paid", amount: 3999, plan: "bundle" },
      { status: "refunded", amount: 1000, plan: "course", coupon_code: "X" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.coupon).toEqual({ count: 1, discount: 800 });
  });

  it("空陣列 → 全零", () => {
    const r = summarizeOrders([], catalog);
    expect(r.paid).toEqual({ count: 0, amount: 0 });
    expect(r.refunded).toEqual({ count: 0, amount: 0 });
    expect(r.pending.count).toBe(0);
    expect(r.byPayType).toEqual({});
    expect(r.invoice).toEqual({ issued: 0, missing: 0 });
    expect(r.coupon).toEqual({ count: 0, discount: 0 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/reconciliation.test.js`
Expected: FAIL（`summarizeOrders` 未定義）

- [ ] **Step 3: 寫實作**

Create `lib/reconciliation.js`:

```js
// 期間財務彙整（純函式）。訂單為單一狀態：退款後 status 變 refunded、已不在 paid，
// 故「有效收款 = paid 金額合計」，不做 paid−refund 相減。failed/cancelled 不計。
export function summarizeOrders(orders = [], catalog = {}) {
  const r = {
    paid:      { count: 0, amount: 0 },
    refunded:  { count: 0, amount: 0 },
    pending:   { count: 0 },
    byPayType: {},
    invoice:   { issued: 0, missing: 0 },
    coupon:    { count: 0, discount: 0 },
  };

  for (const o of orders) {
    const status = o.status || "pending";
    const amount = Number(o.amount) || 0;

    if (status === "paid") {
      r.paid.count++;
      r.paid.amount += amount;

      const pt = o.pay_type || "未知";
      if (!r.byPayType[pt]) r.byPayType[pt] = { count: 0, amount: 0 };
      r.byPayType[pt].count++;
      r.byPayType[pt].amount += amount;

      if (o.invoice_no) r.invoice.issued++;
      else r.invoice.missing++;

      if (o.coupon_code) {
        r.coupon.count++;
        const orig = catalog[o.plan]?.price ?? amount;
        r.coupon.discount += Math.max(0, orig - amount);
      }
    } else if (status === "refunded") {
      r.refunded.count++;
      r.refunded.amount += amount;
    } else if (status === "pending") {
      r.pending.count++;
    }
  }

  return r;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/reconciliation.test.js`
Expected: PASS（5 案）

- [ ] **Step 5: Commit**

```bash
git add lib/reconciliation.js lib/reconciliation.test.js
git commit -m "feat(reconciliation): 期間財務彙整純函式 + 單元測試"
```

---

### Task 2: OrdersPage 對帳彙整面板 + 對帳 CSV

**Files:**
- Modify: `app/admin/page.jsx`（import 區 ~line 17；OrdersPage：`exportOrders` ~line 812、`needsAttention`/`paid` ~line 806、訂單表格 `<div className={styles.panel}>`（含 `placeholder="搜尋學員、訂單編號…"`））

- [ ] **Step 1: 新增 import**

找到（OrdersPage 上方的元件 import 區，例如）：
```jsx
import GamesManagePage from "./GamesManagePage";
```
在其後新增兩行（若任一已存在則不重複加）：
```jsx
import { PLAN_CATALOG } from "@/lib/plans";
import { summarizeOrders } from "@/lib/reconciliation";
```

- [ ] **Step 2: 新增 dateRangeRows 與 report memo**

找到：
```jsx
  const needsAttention=allOrders.filter(o=>o.status==="paid"&&(o.needInvoice||o.invoiceError||o.emailError));
```
在其**上一行**插入：
```jsx
  // 對帳彙整：以原始 rows 只套日期區間（忽略狀態/搜尋），確保營收與退款都涵蓋
  const dateRangeRows=useMemo(()=>rows.filter(o=>{
    const d=new Date(o.created_at||o.updated_at);
    if(dateFrom&&d<new Date(dateFrom))return false;
    if(dateTo){const to=new Date(dateTo);to.setHours(23,59,59,999);if(d>to)return false;}
    return true;
  }),[rows,dateFrom,dateTo]);
  const report=useMemo(()=>summarizeOrders(dateRangeRows,PLAN_CATALOG),[dateRangeRows]);
```

- [ ] **Step 3: 新增 exportReconciliation 函式**

找到 `exportOrders` 函式結尾：
```jsx
    downloadRef.current.href=url;downloadRef.current.download="orders.csv";downloadRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);
  }
```
在它之後插入：
```jsx

  function exportReconciliation(){
    if(!downloadRef.current)return;
    const esc=(s)=>{let v=String(s??"");const f=/^[=+\-@\t\r]/.test(v);if(f)v="'"+v;return f||/[",\n\r]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;};
    const period=(dateFrom||dateTo)?`${dateFrom||"…"} ~ ${dateTo||"…"}`:"全部期間";
    const lines=[
      ["對帳彙整期間",period],
      ["有效收款（已付款）金額",report.paid.amount],
      ["有效收款筆數",report.paid.count],
      ["退款金額",report.refunded.amount],
      ["退款筆數",report.refunded.count],
      ["待付款筆數",report.pending.count],
      ["發票已開",report.invoice.issued],
      ["發票未開",report.invoice.missing],
      ["使用優惠券筆數",report.coupon.count],
      ["優惠折抵總額",report.coupon.discount],
      [],
      ["付款方式","筆數","金額"],
      ...Object.entries(report.byPayType).map(([k,v])=>[k,v.count,v.amount]),
    ];
    const csv="﻿"+lines.map(r=>r.map(esc).join(",")).join("\n")+"\n";
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    downloadRef.current.href=url;downloadRef.current.download="reconciliation.csv";downloadRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);
  }
```

- [ ] **Step 4: 插入對帳彙整面板**

找到訂單表格 panel 的開頭（緊接在 statsGrid4 收尾 `</div>` 或 needsAttention 面板 `)}` 之後的那個 `<div className={styles.panel}>`，其內含 `placeholder="搜尋學員、訂單編號…"`）。在這個訂單表格 `<div className={styles.panel}>` **之前**插入：
```jsx
      <div className={styles.panel} style={{marginBottom:16}}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:10}}>
          <h3 style={{margin:0}}>對帳彙整（依日期區間）</h3>
          <button className={styles.btnSmall} onClick={exportReconciliation}><Download size={13}/> 匯出對帳 CSV</button>
        </div>
        <div style={{padding:"4px 16px 16px",fontSize:13}}>
          <div style={{color:"#94a3b8",marginBottom:10}}>期間：{(dateFrom||dateTo)?`${dateFrom||"…"} ~ ${dateTo||"…"}`:"全部期間"}（不受狀態／搜尋篩選影響）</div>
          <div style={{display:"flex",gap:24,flexWrap:"wrap",marginBottom:12}}>
            <div><div style={{color:"#94a3b8"}}>有效收款（已付款）</div><div style={{fontWeight:800,fontSize:18,color:"#16a34a"}}>NT$ {report.paid.amount.toLocaleString()}</div><div style={{color:"#94a3b8",fontSize:12}}>{report.paid.count} 筆</div></div>
            <div><div style={{color:"#94a3b8"}}>退款</div><div style={{fontWeight:800,fontSize:18,color:"#dc2626"}}>NT$ {report.refunded.amount.toLocaleString()}</div><div style={{color:"#94a3b8",fontSize:12}}>{report.refunded.count} 筆</div></div>
            <div><div style={{color:"#94a3b8"}}>待付款</div><div style={{fontWeight:800,fontSize:18}}>{report.pending.count} 筆</div></div>
            <div><div style={{color:"#94a3b8"}}>發票</div><div style={{fontWeight:700}}>已開 {report.invoice.issued}／未開 {report.invoice.missing}</div></div>
            <div><div style={{color:"#94a3b8"}}>優惠折抵</div><div style={{fontWeight:700}}>{report.coupon.count} 筆 · NT$ {report.coupon.discount.toLocaleString()}</div></div>
          </div>
          {Object.keys(report.byPayType).length>0&&(
            <div>
              <div style={{color:"#94a3b8",marginBottom:4}}>付款方式分佈（已付款）</div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                {Object.entries(report.byPayType).map(([k,v])=>(
                  <span key={k} style={{background:"#f1f5f9",borderRadius:6,padding:"4px 10px"}}>{k}：{v.count} 筆 · NT$ {v.amount.toLocaleString()}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 5: build 驗證**

Run: `npm run build 2>&1 | grep -E "Compiled successfully|Error"`
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 訂單管理對帳彙整面板 + 對帳 CSV 匯出"
```

---

### Task 3: CLAUDE.md + 全量驗證

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 補一句說明**

在 `CLAUDE.md` 的「### 失敗告警（開票／寄信）」段落**之後**（或後台相關說明附近）新增：
```
### 對帳彙整（後台訂單管理）

- OrdersPage 頂部「對帳彙整（依日期區間）」面板：套用既有日期篩選，顯示有效收款（已付款，退款已排除）、退款、待付款、付款方式分佈、發票已開/未開、優惠折抵，並可「匯出對帳 CSV」。彙整邏輯為純函式 `lib/reconciliation.js`（`summarizeOrders`，有測試），無新後端 API。
```

- [ ] **Step 2: 全量驗證**

Run: `npm test`
Expected: 全數 PASS（含 reconciliation 5 案）

Run: `npm run build 2>&1 | grep -E "Compiled successfully"`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 補對帳彙整說明（CLAUDE.md）"
```

---

## Self-Review 結果
- **Spec coverage**：彙整純函式（T1）、OrdersPage 面板+日期區間+CSV（T2）、文件（T3）全覆蓋；金額語意（有效收款不含退款）已在 T1 實作與測試。
- **Placeholder scan**：無 TBD/TODO；每個 code step 均含完整程式碼。
- **Type/命名一致**：`summarizeOrders(orders, catalog)` 回傳 `{paid,refunded,pending,byPayType,invoice,coupon}`（T1 定義、T2 取用 `report.paid.amount`/`report.byPayType` 等一致）；`dateRangeRows`/`report`/`exportReconciliation` 命名一致；CSV 沿用既有 `esc`+BOM 模式。

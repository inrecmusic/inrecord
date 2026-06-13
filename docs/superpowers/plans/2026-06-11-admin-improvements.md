# 後台 5 項改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後台 5 項改善：① 防漏單分批撈取 + 訂單表格分頁、② 開票/退款 alert→toast、③ 序號庫篩選/搜尋/兌換反查、④ 強化既有訂單 CSV（BOM + 公式防護）、⑤ 完整 RWD 手機抽屜側欄。

**Architecture:** 5 項彼此獨立。伺服器端新增 `selectAll` 分批撈取繞過 PostgREST 1000 列上限（訂單/遊戲存取全載，儀表板/分析數字才正確）；其餘為 `app/admin/page.jsx`（`OrdersPage`、`CouponsPage`、主框架）與 `admin.module.css` 的前端調整。純邏輯（`selectAll`）走 vitest TDD，路由/UI/CSS 依現有慣例手動驗證 + `npm run build`。

**Tech Stack:** Next.js 14 App Router、Supabase（service role / PostgREST）、vitest、lucide-react、CSS Modules。

---

## 設計參考

- Spec：`docs/superpowers/specs/2026-06-11-admin-improvements-design.md`
- 既有事實：`OrdersPage`（`app/admin/page.jsx:710`）已有搜尋/狀態/日期篩選/CSV 匯出；`/api/admin/leads` 已伺服器分頁（保持不動）；序號庫 UI 在 `CouponsPage`；側欄 `<aside className={styles.sidebar}>`（約 2249 行）。

## 檔案結構

- Create: `lib/supabase-paginate.js` — `selectAll` 分批撈取 helper（單一職責，可單測）。
- Create: `lib/supabase-paginate.test.js` — `selectAll` 單元測試。
- Modify: `app/api/admin/orders/route.js` — GET 改用 `selectAll`。
- Modify: `app/api/admin/subscriptions/route.js` — GET 改用 `selectAll`。
- Modify: `app/api/admin/coupon-batches/[id]/codes/route.js` — 加兌換反查。
- Modify: `app/admin/page.jsx` — `OrdersPage`（分頁/toast/CSV）、`CouponsPage`（序號庫篩選/搜尋/兌換/load-more/批次搜尋）、主框架（RWD 抽屜）。
- Modify: `app/admin/admin.module.css` — RWD（抽屜側欄、modal、表格）。

---

## Task 1: `selectAll` 分批撈取 helper（TDD）

**Files:**
- Create: `lib/supabase-paginate.js`
- Test: `lib/supabase-paginate.test.js`

- [ ] **Step 1: 寫失敗測試 `lib/supabase-paginate.test.js`**

```js
import { describe, it, expect } from "vitest";
import { selectAll, PAGE_SIZE } from "./supabase-paginate.js";

// 假 supabase：依 range(from,to) 回傳對應切片；記錄被請求的範圍
function fakeClient(rows){
  const calls=[];
  const builder={
    _from:0,_to:0,
    select(){return this;},
    order(){return this;},
    range(from,to){this._from=from;this._to=to;calls.push([from,to]);return this;},
    then(resolve){resolve({data:rows.slice(this._from,this._to+1),error:null});},
  };
  return {calls,from(){return builder;}};
}

describe("selectAll", () => {
  it("跨頁累積，最後一頁不足 PAGE_SIZE 即停", async () => {
    const rows=Array.from({length:PAGE_SIZE+5},(_,i)=>({i}));
    const sb=fakeClient(rows);
    const out=await selectAll(sb,"orders");
    expect(out).toHaveLength(PAGE_SIZE+5);
    expect(sb.calls[0]).toEqual([0,PAGE_SIZE-1]);
    expect(sb.calls[1]).toEqual([PAGE_SIZE,PAGE_SIZE*2-1]);
    expect(sb.calls).toHaveLength(2);
  });
  it("剛好整除時，會多撈一頁拿到空陣列才停", async () => {
    const rows=Array.from({length:PAGE_SIZE},(_,i)=>({i}));
    const sb=fakeClient(rows);
    const out=await selectAll(sb,"orders");
    expect(out).toHaveLength(PAGE_SIZE);
    expect(sb.calls).toHaveLength(2); // 第二頁回空
  });
  it("error 時拋出", async () => {
    const sb={from(){return {select(){return this;},order(){return this;},range(){return this;},then(r){r({data:null,error:{message:"boom"}});}};}};
    await expect(selectAll(sb,"orders")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/supabase-paginate.test.js`
Expected: FAIL —「Failed to resolve import "./supabase-paginate.js"」。

- [ ] **Step 3: 實作 `lib/supabase-paginate.js`**

```js
// 分批撈取整張表，繞過 PostgREST 單次預設 1000 列上限。
// 用於需要「全部資料」的後台情境（儀表板/銷售分析全載統計）。

export const PAGE_SIZE = 1000;

// selectAll(supabase, table, buildQuery?) → 所有列陣列
// buildQuery(q) 可加 .select()/.order()/.eq() 等；預設 select("*")。
export async function selectAll(supabase, table, buildQuery) {
  const out = [];
  let page = 0;
  for (;;) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from(table);
    q = buildQuery ? buildQuery(q) : q.select("*");
    const { data, error } = await q.range(from, to);
    if (error) throw new Error(error.message);
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/supabase-paginate.test.js`
Expected: PASS（3 測試綠燈）。

- [ ] **Step 5: Commit**

```bash
git add lib/supabase-paginate.js lib/supabase-paginate.test.js
git commit -m "feat(lib): selectAll 分批撈取 helper（繞過 1000 列上限）+ 單元測試"
```

---

## Task 2: orders / subscriptions 路由改用 selectAll

**Files:**
- Modify: `app/api/admin/orders/route.js`
- Modify: `app/api/admin/subscriptions/route.js`

- [ ] **Step 1: 改 `app/api/admin/orders/route.js` 的 GET**

匯入處加上 helper，並把查詢換成 `selectAll`。將檔案頂部：

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
```

改為：

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";
```

並把 GET 內：

```js
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
```

改為：

```js
    const data = await selectAll(supabase, "orders", q =>
      q.select("*").order("created_at", { ascending: false })
    );
    return NextResponse.json({ ok: true, data });
```

- [ ] **Step 2: 改 `app/api/admin/subscriptions/route.js` 的 GET**

頂部匯入加：

```js
import { selectAll } from "@/lib/supabase-paginate";
```

GET 內：

```js
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
```

改為：

```js
  let data;
  try {
    data = await selectAll(supabase, "subscriptions", q =>
      q.select("*").order("created_at", { ascending: false })
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.json({ data });
```

- [ ] **Step 3: 驗證（build + 既有測試）**

Run: `npx vitest run && npm run build`
Expected: 測試全綠；build 成功；`/api/admin/orders`、`/api/admin/subscriptions` 出現在路由表。

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/orders/route.js app/api/admin/subscriptions/route.js
git commit -m "fix(admin): orders/subscriptions 用 selectAll 全載，避免破千漏單"
```

---

## Task 3: OrdersPage 訂單表格前端分頁

**Files:**
- Modify: `app/admin/page.jsx`（`OrdersPage`，搜尋/篩選已存在，僅加分頁）

> 現況：`filtered`（約 777 行）為過濾後全部訂單，直接 `.map` 渲染（約 838 行）。本任務加每頁 20 筆的前端分頁，不動搜尋/篩選邏輯。

- [ ] **Step 1: 加分頁 state 與切片**

在 `OrdersPage` 的 `const downloadRef=useRef(null);`（約 719 行）後加入：

```js
  const [tablePage,setTablePage]=useState(1);
  const PER=20;
```

在 `filtered` 的 `useMemo`（約 777-783 行）之後加入：

```js
  // 搜尋/篩選改變時回到第 1 頁
  useEffect(()=>{setTablePage(1);},[search,statusFilter,dateFrom,dateTo,rows.length]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PER));
  const pageRows=filtered.slice((tablePage-1)*PER,tablePage*PER);
```

- [ ] **Step 2: 表格 body 改渲染 `pageRows`，並在表格後加分頁列**

把表格 body 的 `:filtered.map(o=>(`（約 838 行）改為：

```jsx
              :pageRows.map(o=>(
```

在 `</table>` 之後、`</div>`（panel 結束）之前（約 861-862 行）加入分頁列：

```jsx
          </table>
        </div>
        {filtered.length>PER&&(
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12,padding:"12px 0"}}>
            <button className={styles.btnSmall} disabled={tablePage<=1} onClick={()=>setTablePage(p=>Math.max(1,p-1))}>上一頁</button>
            <span className={styles.dim} style={{fontSize:13}}>第 {tablePage} / {totalPages} 頁</span>
            <button className={styles.btnSmall} disabled={tablePage>=totalPages} onClick={()=>setTablePage(p=>Math.min(totalPages,p+1))}>下一頁</button>
          </div>
        )}
```

（注意：原本 `</table>` 後只有一個 `</div>`，分頁列插在該 `</div>` 之後、panel 的外層 `</div>` 之前。實作時對齊既有縮排。）

- [ ] **Step 3: 手動驗證**

Run: `npm run dev` → 後台訂單管理。若訂單 >20 筆會出現分頁；搜尋時自動回第 1 頁；上/下一頁正常；CSV 匯出仍為「過濾後全部」（`exportOrders` 用 `filtered` 不受分頁影響）。

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 訂單表格前端分頁（每頁 20）"
```

---

## Task 4: 開票／退款 alert → toast

**Files:**
- Modify: `app/admin/page.jsx`（`OrdersPage` 簽章 + 4 處 alert + render 呼叫處）

- [ ] **Step 1: OrdersPage 接收 showToast**

把 `function OrdersPage({leads}){`（約 710 行）改為：

```js
function OrdersPage({leads,showToast}){
```

- [ ] **Step 2: 主框架傳入 showToast**

把 render 處 `{page==="orders"      &&<OrdersPage leads={leads}/>}`（約 2286 行）改為：

```jsx
          {page==="orders"      &&<OrdersPage leads={leads} showToast={showToast}/>}
```

- [ ] **Step 3: 4 處 alert 換成 showToast**

`issueInvoice`（約 743-745 行）改為：

```js
      if(res.ok&&d.invoiceNo){await loadOrders();showToast?.("✅ 發票開立成功："+d.invoiceNo);}
      else showToast?.("❌ 發票開立失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 發票開立失敗："+e.message);}
```

`refundOrder`（約 756-758 行）改為：

```js
      if(res.ok&&d.ok){await loadOrders();setDetailOrder(null);showToast?.("✅ "+(d.method==="cancel"?"已取消授權（未請款）":"退款成功")+"，存取已撤銷");}
      else showToast?.("❌ 退款失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 退款失敗："+e.message);}
```

（保留 `refundOrder` 開頭的 `window.confirm(...)` 不動——那是必要的二次確認，toast 無法取代。）

- [ ] **Step 4: 手動驗證 + build**

Run: `npm run build`
Expected: build 成功。dev 中對已付款訂單補開發票/退款，成功與失敗都顯示右下角 toast，不再跳原生 alert。

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 開票/退款改用 toast 提示（取代原生 alert）"
```

---

## Task 5: 強化訂單 CSV（BOM + 公式注入防護）

**Files:**
- Modify: `app/admin/page.jsx`（`OrdersPage` 的 `exportOrders`，約 790-798 行）

- [ ] **Step 1: 改寫 `exportOrders`**

把：

```js
  function exportOrders(){
    if(!downloadRef.current)return;
    const cols=["id","student","email","course","amount","method","status","time"];
    const rows=[cols,...filtered.map(o=>cols.map(c=>o[c]??""))];
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    downloadRef.current.href=url;downloadRef.current.download="orders.csv";downloadRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);
  }
```

改為：

```js
  function exportOrders(){
    if(!downloadRef.current)return;
    // 防 CSV 公式注入：以 = + - @ Tab CR 開頭者前綴單引號並整欄加引號
    const esc=(s)=>{let v=String(s??"");const f=/^[=+\-@\t\r]/.test(v);if(f)v="'"+v;return f||/[",\n\r]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;};
    const cols=["id","student","email","course","amount","method","status","time"];
    const rows=[cols,...filtered.map(o=>cols.map(c=>o[c]??""))];
    const csv="﻿"+rows.map(r=>r.map(esc).join(",")).join("\n")+"\n"; // BOM 讓 Excel 正確顯示中文
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    downloadRef.current.href=url;downloadRef.current.download="orders.csv";downloadRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);
  }
```

- [ ] **Step 2: 手動驗證 + build**

Run: `npm run build`
Expected: build 成功。dev 匯出 CSV → Excel 開啟中文不亂碼；以 `=` 開頭的欄位不會被當公式。

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.jsx
git commit -m "fix(admin): 訂單 CSV 加 BOM + 公式注入防護"
```

---

## Task 6: 序號清單 API 加兌換反查

**Files:**
- Modify: `app/api/admin/coupon-batches/[id]/codes/route.js`

- [ ] **Step 1: 改寫 GET，附上每張碼的兌換人 email + 時間**

把整個 GET 換成：

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// GET：取得某批次所有序號（含 used 狀態與兌換反查），供畫面顯示 / 複製 / CSV
export async function GET(req, { params }) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data: codes, error } = await supabase
    .from("coupons")
    .select("id, code, used, type, value")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 兌換反查：以 orders.coupon_code 比對已付款訂單
  const codeList = (codes || []).map(c => c.code);
  const redeem = {};
  if (codeList.length) {
    const { data: orders } = await supabase
      .from("orders")
      .select("coupon_code, email, fulfilled_at, created_at")
      .in("coupon_code", codeList)
      .eq("status", "paid");
    for (const o of orders || []) {
      const at = o.fulfilled_at || o.created_at;
      const prev = redeem[o.coupon_code];
      // 一碼限用一次，正常只一筆；若多筆取最早
      if (!prev || (at && at < prev.at)) redeem[o.coupon_code] = { email: o.email, at };
    }
  }

  const data = (codes || []).map(c => ({
    ...c,
    redeemedEmail: redeem[c.code]?.email || null,
    redeemedAt: redeem[c.code]?.at || null,
  }));
  return NextResponse.json({ data });
}
```

- [ ] **Step 2: 手動驗證**

```bash
curl -s http://localhost:3000/api/admin/coupon-batches/<BATCH_ID>/codes -H "Authorization: Bearer <TOKEN>"
```
Expected: 每筆含 `redeemedEmail`、`redeemedAt`（未兌換為 null）。

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/coupon-batches/[id]/codes/route.js"
git commit -m "feat(api): 序號清單加兌換反查（兌換人 email + 時間）"
```

---

## Task 7: 序號庫 UI（篩選/搜尋/兌換顯示/load-more/批次搜尋）

**Files:**
- Modify: `app/admin/page.jsx`（`CouponsPage`）

> 現況：`CouponsPage` 已有 `batches`、`expandCodes`、`toggleExpand`、`copyAllCodes`、`downloadCsv`、批次列表、展開列。本任務加批次搜尋、序號篩選/搜尋/load-more、兌換顯示，並讓 CSV 多一欄「兌換人」。

- [ ] **Step 1: 加 state**

在 `const [deleteBatch,setDeleteBatch]=useState(null);`（序號庫 state 區塊末，約 936 行）後加入：

```js
  const [batchSearch,setBatchSearch]=useState("");
  const [codeFilter,setCodeFilter]=useState("all"); // all | unused | used
  const [codeSearch,setCodeSearch]=useState("");
  const [codeLimit,setCodeLimit]=useState(60);
```

- [ ] **Step 2: 展開批次時重設序號檢視狀態**

在 `toggleExpand` 函式內，把開啟分支（`setExpandId(b.id);setExpandLoading(true);setExpandCodes([]);`）後補上重設：

```js
    setExpandId(b.id);setExpandLoading(true);setExpandCodes([]);
    setCodeFilter("all");setCodeSearch("");setCodeLimit(60);
```

- [ ] **Step 3: 加批次過濾與序號可視清單（衍生值）**

在 `discountLabel` 函式（約 938 行）之後加入：

```js
  const shownBatches=batches.filter(b=>{
    if(!batchSearch.trim())return true;
    const q=batchSearch.trim().toLowerCase();
    return (b.name||"").toLowerCase().includes(q)||(b.prefix||"").toLowerCase().includes(q);
  });
  function visibleCodes(){
    return expandCodes.filter(c=>{
      if(codeFilter==="unused"&&c.used)return false;
      if(codeFilter==="used"&&!c.used)return false;
      if(codeSearch.trim()&&!c.code.toLowerCase().includes(codeSearch.trim().toLowerCase()))return false;
      return true;
    });
  }
```

- [ ] **Step 4: 批次列表標題列加搜尋框；列表渲染改用 `shownBatches`**

把批次 `panelHead`（約 1145 行）：

```jsx
        <div className={styles.panelHead}><h2>批次列表</h2><span className={styles.dim}>共 {batches.length} 批</span></div>
```

改為：

```jsx
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:10}}>
          <h2>批次列表</h2>
          <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:"auto"}}>
            <input className={styles.searchInput} placeholder="搜尋批次名稱、前綴…" value={batchSearch} onChange={e=>setBatchSearch(e.target.value)}/>
            <span className={styles.dim}>{shownBatches.length} / {batches.length} 批</span>
          </div>
        </div>
```

把批次列表 `:batches.map(b=>(`（約 1152 行）改為：

```jsx
              :shownBatches.map(b=>(
```

- [ ] **Step 5: 展開區塊加篩選頁籤 + 搜尋 + load-more，並在碼 chip 顯示兌換人**

把展開區塊（`expandLoading?...:(` 內，約 1175-1191 行）整段內容換成：

```jsx
                      {expandLoading?<div className={styles.dim} style={{padding:12}}>載入序號中…</div>:(()=>{
                        const vis=visibleCodes();
                        const shown=vis.slice(0,codeLimit);
                        return(
                        <div style={{padding:"8px 4px"}}>
                          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                            <button className={styles.btnSmall} onClick={copyAllCodes}><Copy size={12}/> 全選複製</button>
                            <button className={styles.btnSmall} onClick={()=>downloadCsv(b)}><Download size={12}/> 下載 CSV</button>
                            <div style={{display:"flex",gap:4}}>
                              {[["all","全部"],["unused","未使用"],["used","已使用"]].map(([k,label])=>(
                                <button key={k} className={`${styles.btnSmall} ${codeFilter===k?styles.filterActive:""}`} onClick={()=>{setCodeFilter(k);setCodeLimit(60);}}>{label}</button>
                              ))}
                            </div>
                            <input className={styles.searchInput} placeholder="搜尋序號…" value={codeSearch} onChange={e=>{setCodeSearch(e.target.value);setCodeLimit(60);}} style={{maxWidth:160}}/>
                            <span className={styles.dim} style={{alignSelf:"center"}}>{vis.length} 組（全批 {expandCodes.length}）</span>
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {shown.map(c=>(
                              <span key={c.id} style={{display:"inline-flex",alignItems:"center",gap:6,background:c.used?"#f1f5f9":"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",fontSize:12}}>
                                <code style={{fontWeight:700,letterSpacing:1,textDecoration:c.used?"line-through":"none",color:c.used?"#94a3b8":"#0f172a"}}>{c.code}</code>
                                <span className={styles.dim} style={{fontSize:11}}>
                                  {c.used
                                    ? `已使用${c.redeemedEmail?` · ${c.redeemedEmail}`:""}${c.redeemedAt?` · ${String(c.redeemedAt).slice(0,10)}`:""}`
                                    : "未使用"}
                                </span>
                              </span>
                            ))}
                            {!vis.length&&<span className={styles.dim} style={{padding:8}}>沒有符合的序號</span>}
                          </div>
                          {vis.length>codeLimit&&(
                            <div style={{marginTop:10}}>
                              <button className={styles.btnSmall} onClick={()=>setCodeLimit(n=>n+60)}>顯示更多（+60，剩 {vis.length-codeLimit}）</button>
                            </div>
                          )}
                        </div>
                        );
                      })()}
```

- [ ] **Step 6: CSV 多一欄「兌換人」**

把 `downloadCsv`（約 1005-1016 行）的 header 與 lines：

```js
    const header="序號,狀態,折扣,批次名稱";
    const lines=expandCodes.map(c=>[esc(c.code),c.used?"已使用":"未使用",esc(dl),esc(b.name)].join(","));
```

改為：

```js
    const header="序號,狀態,兌換人,兌換時間,折扣,批次名稱";
    const lines=expandCodes.map(c=>[esc(c.code),c.used?"已使用":"未使用",esc(c.redeemedEmail||""),esc(c.redeemedAt?String(c.redeemedAt).slice(0,10):""),esc(dl),esc(b.name)].join(","));
```

- [ ] **Step 7: 手動驗證 + build**

Run: `npm run build`
Expected: build 成功。dev 中：批次搜尋可過濾；展開批次有「全部/未使用/已使用」頁籤與序號搜尋；已兌換的碼顯示 email + 日期；大批次顯示前 60、可「顯示更多」；CSV 含兌換人欄。

> 用 Task 6 之前建立的測試批次（或既有批次）驗證；若要看「已使用」樣式，可在 DB 將某張測試碼 `used` 設為 1、並在 orders 插一筆對應 coupon_code+status=paid。

- [ ] **Step 8: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 序號庫批次搜尋/序號篩選/兌換反查顯示/load-more"
```

---

## Task 8: 完整 RWD（手機抽屜側欄 + modal/表格細節）

**Files:**
- Modify: `app/admin/page.jsx`（主框架：navOpen state、漢堡鈕、側欄/遮罩 class）
- Modify: `app/admin/admin.module.css`（抽屜、遮罩、漢堡鈕、modal、表格）

> 現況：側欄 `<aside className={styles.sidebar}>`（約 2249 行）；topbar 有 `topbarTitle` 與 `topbarRight`（約 2270 行）；`@media (max-width:960px)` 目前把側欄變成換行橫列。本任務改為滑入式抽屜。

- [ ] **Step 1: 主框架加 navOpen state**

在宣告 `page` state 的同一元件中（與 `const [page,setPage]=useState(...)` 相鄰），加入：

```js
  const [navOpen,setNavOpen]=useState(false);
```

- [ ] **Step 2: 側欄加開啟 class + 遮罩；導覽點擊後關閉**

把 `<aside className={styles.sidebar}>`（約 2249 行）改為：

```jsx
      <aside className={`${styles.sidebar} ${navOpen?styles.sidebarOpen:""}`}>
```

把側欄內導覽按鈕的 onClick（約 2258 行）：

```jsx
                  <button key={item.id} className={`${styles.navItem} ${page===item.id?styles.active:""}`} onClick={()=>{setPage(item.id);if(item.id!=="courses")setSelectedCourse(null);}}>
```

改為（點完關閉抽屜）：

```jsx
                  <button key={item.id} className={`${styles.navItem} ${page===item.id?styles.active:""}`} onClick={()=>{setPage(item.id);if(item.id!=="courses")setSelectedCourse(null);setNavOpen(false);}}>
```

在 `</aside>` 之後加入遮罩：

```jsx
      {navOpen&&<div className={styles.navOverlay} onClick={()=>setNavOpen(false)}/>}
```

- [ ] **Step 3: topbar 加漢堡鈕**

把 topbar（約 2270 行）：

```jsx
        <div className={styles.topbar}>
          <span className={styles.topbarTitle}>後台管理系統</span>
```

改為：

```jsx
        <div className={styles.topbar}>
          <button className={styles.hamburger} onClick={()=>setNavOpen(true)} aria-label="開啟選單"><List size={20}/></button>
          <span className={styles.topbarTitle}>後台管理系統</span>
```

（`List` icon 已在檔頭 `lucide-react` 匯入。）

- [ ] **Step 4: CSS — 抽屜、遮罩、漢堡鈕**

在 `app/admin/admin.module.css` 末尾加入（漢堡預設隱藏，桌機不受影響）：

```css
/* RWD：手機抽屜側欄 */
.hamburger { display:none; align-items:center; justify-content:center; width:38px; height:38px; margin-right:8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; color:#0f172a; cursor:pointer; }
.navOverlay { display:none; }

@media (max-width:960px) {
  .hamburger { display:inline-flex; }
  .navOverlay { display:block; position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:40; }
  .sidebar {
    position:fixed; left:0; top:0; bottom:0; height:100dvh; width:240px; z-index:50;
    flex-direction:column; flex-wrap:nowrap;
    transform:translateX(-100%); transition:transform .25s ease;
  }
  .sidebarOpen { transform:translateX(0); box-shadow:0 0 40px rgba(0,0,0,.3); }
  .sideNav { flex-direction:column; }
}
```

> 注意：此 `@media (max-width:960px)` 區塊會覆蓋原本第 369 行那段把側欄變成橫列的規則。實作時**刪除或保留皆可，但本區塊需放在其後**以確保覆蓋；最穩做法是同時把原 369 行的 `.sidebar`/`.sideNav` 覆寫移除，避免衝突。請打開檔案確認 369 行內容後處理。

- [ ] **Step 5: CSS — modal 與表格手機細節**

在 `admin.module.css` 末尾繼續加入：

```css
@media (max-width:600px) {
  .modalCard { width:100% !important; max-width:100%; }
  .tableWrap { -webkit-overflow-scrolling:touch; }
  .table { min-width:640px; }
}
```

- [ ] **Step 6: 手動驗證 + build**

Run: `npm run build`
Expected: build 成功。瀏覽器縮到手機寬度（≤960）：topbar 出現漢堡鈕、點擊滑出側欄 + 遮罩、點導覽項目後自動關閉；桌機（≥961）側欄維持原狀、無漢堡鈕。≤600 時 modal 近全寬、寬表格可橫向捲動。

- [ ] **Step 7: Commit**

```bash
git add app/admin/page.jsx app/admin/admin.module.css
git commit -m "feat(admin): 完整 RWD（手機抽屜側欄 + modal/表格細節）"
```

---

## 完成後

- 無 DB schema 變更。
- 部署：`git push`（GitHub 403 待解）+ `npx vercel --prod`。

## Self-Review 紀錄

- **Spec 覆蓋**：① selectAll(Task 1/2) + 訂單分頁(Task 3)✓；② alert→toast(Task 4)✓；③ codes 反查(Task 6) + UI 篩選/搜尋/兌換/load-more/批次搜尋(Task 7)✓；④ CSV BOM+公式防護(Task 5)✓；⑤ RWD 抽屜+modal+表格(Task 8)✓。已存在的訂單搜尋/篩選/匯出鈕不重做（符合校正後 spec）。
- **型別/命名一致**：`selectAll/PAGE_SIZE`(Task 1)於 Task 2 引用一致；`redeemedEmail/redeemedAt`(Task 6 API)於 Task 7 UI/CSV 使用一致；`navOpen/sidebarOpen/navOverlay/hamburger`(Task 8)JSX 與 CSS 對應一致；`codeFilter/codeSearch/codeLimit/batchSearch/visibleCodes/shownBatches`(Task 7)前後一致。
- **Placeholder**：Task 8 Step 4 對第 369 行的處理為「打開檔案確認後刪除衝突規則」的明確指示，非 placeholder。

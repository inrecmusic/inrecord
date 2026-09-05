"use client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { LEAD_SOURCES } from "@/lib/admin-leads";
import { fmt, payTypeLabel, StatCard, OrderStatusPill, ProofImage, ComposeEmailModal, BulkFollowupModal } from "./shared";
import { inDateRange } from "@/lib/date-range";
import { summarizeOrders } from "@/lib/reconciliation";
import { PLAN_CATALOG } from "@/lib/plans";
import { ExternalLink, DollarSign, CheckCircle2, CreditCard, BarChart2, AlertTriangle, X } from "lucide-react";
import { excludeManual } from "@/lib/order-stats";

// ── Orders Page ────────────────────────────────────────────────────────────
// 手動開通課程：外部站台(concert-shop/現場)已成交但名單沒進來時，直接輸入 Email 開通。
export function ManualGrantCard({reload,showToast}){
  const [email,setEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [name,setName]=useState("");
  const [plan,setPlan]=useState("bundle");
  const [doGrant,setDoGrant]=useState(true);
  const [sendEmail,setSendEmail]=useState(true);
  const [busy,setBusy]=useState(false);

  const actionLabel=doGrant&&sendEmail?"開通並寄信":doGrant?"開通課程":sendEmail?"寄信":"—";

  async function submit(e){
    e.preventDefault();
    if(busy)return;
    const em=email.trim();
    if(!em){showToast?.("❌ 請填寫 Email");return;}
    if(!doGrant&&!sendEmail){showToast?.("❌ 請至少勾選「開通課程存取」或「寄通知信」其中一項");return;}
    setBusy(true);
    try{
      const res=await _api("/api/admin/manual-grant",{method:"POST",body:JSON.stringify({email:em,phone:phone.trim(),name:name.trim(),plan,grant:doGrant,sendEmail})});
      const d=await res.json().catch(()=>({}));
      if(!res.ok||d.ok===false){
        showToast?.("❌ 失敗："+(d.error||"unknown")+(d.detail?`（${d.detail}）`:""));
      }else{
        const parts=[];
        if(doGrant) parts.push(d.granted?"✅ 已開通課程存取":d.alreadyGranted?"⚠️ 此 Email 已開通過（未重複建立）":"⚠️ 未開通（請到「紀錄」查看原因）");
        if(sendEmail) parts.push(d.emailSent?"✅ 通知信已寄出":"❌ 通知信寄送失敗"+(d.emailError?`（${d.emailError}）`:""));
        showToast?.(parts.join("；"));
        setEmail("");setPhone("");setName("");setPlan("bundle");setDoGrant(true);setSendEmail(true);
        await reload?.();
      }
    }catch(err){showToast?.("❌ 失敗："+err.message);}
    finally{setBusy(false);}
  }

  const inStyle={width:"100%"};
  const col={display:"flex",flexDirection:"column",gap:4,fontSize:13};
  return(
    <div className={styles.panel} style={{marginBottom:16}}>
      <div className={styles.panelHead}><h3 style={{margin:0}}>✋ 手動開通 / 補寄信</h3></div>
      <div className={styles.reconPeriod}>外部站台（concert-shop／現場）已成交、但付款名單沒進來時，直接輸入客人「實際登入用的 Email」處理。可只勾一項：<b>開通課程存取</b>＝建立課程權限（開課後可上課）；<b>寄通知信</b>＝預購期寄「預購成功」信、開課後寄「開課」信。</div>
      <form onSubmit={submit} style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end",padding:"4px 0"}}>
        <label style={{...col,flex:"1 1 220px"}}><span>Email <span style={{color:"#dc2626"}}>*</span></span>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com" className={styles.searchInput} style={inStyle}/></label>
        <label style={{...col,flex:"1 1 140px"}}><span>電話</span>
          <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="09xxxxxxxx" className={styles.searchInput} style={inStyle}/></label>
        <label style={{...col,flex:"1 1 140px"}}><span>姓名</span>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="（選填）" className={styles.searchInput} style={inStyle}/></label>
        <label style={{...col}}><span>方案</span>
          <select value={plan} onChange={e=>setPlan(e.target.value)} className={styles.searchInput}>
            <option value="bundle">課程包（課程＋AI遊戲）</option>
            <option value="course">只課程</option>
          </select></label>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,whiteSpace:"nowrap"}}>
          <input type="checkbox" checked={doGrant} onChange={e=>setDoGrant(e.target.checked)}/> 開通課程存取</label>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,whiteSpace:"nowrap"}}>
          <input type="checkbox" checked={sendEmail} onChange={e=>setSendEmail(e.target.checked)}/> 寄通知信（預購信）</label>
        <button type="submit" className={styles.btnSmall} disabled={busy||(!doGrant&&!sendEmail)}>{busy?"處理中…":actionLabel}</button>
      </form>
    </div>
  );
}

// 外部站台付款名單：手動批次「寄預購信 / 開通課程存取」。
// 進名單由 webhook 自動寫入 —— WooCommerce(碩樂)=source:"wordpress"、concert-shop=source:"concert"；
// 此面板涵蓋兩個來源(LEAD_SOURCES)，只負責手動觸發。
export function WordpressLeadsPanel({rows,reload,showToast}){
  const wp=useMemo(()=>(rows||[]).filter(o=>LEAD_SOURCES.includes(o.source)),[rows]);
  const [sel,setSel]=useState(()=>new Set());
  const [busy,setBusy]=useState("");

  // rows 變動時清掉已不存在的選取
  useEffect(()=>{setSel(prev=>{const ids=new Set(wp.map(o=>o.id));const n=new Set();prev.forEach(id=>{if(ids.has(id))n.add(id);});return n;});},[wp]);

  if(!wp.length) return null;

  const toggle=(id)=>setSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const allChecked=sel.size===wp.length;
  const toggleAll=()=>setSel(allChecked?new Set():new Set(wp.map(o=>o.id)));

  async function run(kind){
    if(busy)return;
    const ids=Array.from(sel);
    const labels={email:"寄送預購信",grant:"開通課程存取"};
    if(!ids.length&&!window.confirm(`未勾選任何項目，要對「全部未處理」執行「${labels[kind]}」嗎？`))return;
    setBusy(kind);
    try{
      const path=kind==="email"?"/api/admin/send-presale-email":"/api/admin/grant-access";
      const res=await _api(path,{method:"POST",body:JSON.stringify(ids.length?{ids}:{})});
      const d=await res.json();
      if(!res.ok||d.ok===false){showToast?.("❌ "+labels[kind]+"失敗："+(d.error||"unknown"));}
      else{
        const done=kind==="email"?d.sent:d.granted;
        showToast?.(`✅ ${labels[kind]}完成：成功 ${done||0} 筆${d.failed?`，失敗 ${d.failed} 筆`:""}`);
        setSel(new Set());
        await reload?.();
      }
    }catch(e){showToast?.("❌ "+labels[kind]+"失敗："+e.message);}
    finally{setBusy("");}
  }

  return(
    <div className={styles.panel} style={{marginBottom:16}}>
      <div className={styles.panelHead} style={{flexWrap:"wrap",gap:10}}>
        <h3 style={{margin:0}}>外部購買名單（現場／演奏會）<span className={styles.dim} style={{fontWeight:400,fontSize:13}}>　{wp.length} 筆</span></h3>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className={styles.btnSmall} disabled={!!busy} onClick={()=>run("email")}>{busy==="email"?"寄送中…":`寄送預購信${sel.size?`（${sel.size}）`:"（全部未寄）"}`}</button>
          <button className={styles.btnSmall} disabled={!!busy} onClick={()=>run("grant")}>{busy==="grant"?"開通中…":`開通課程存取${sel.size?`（${sel.size}）`:"（全部未開通）"}`}</button>
        </div>
      </div>
      <div className={styles.reconPeriod}>勾選指定名單則只處理勾選者；未勾選則處理「全部未寄／未開通」。已處理者自動跳過、不會重複。</div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th style={{width:32}}><input type="checkbox" checked={allChecked} onChange={toggleAll}/></th>
            <th>Email</th><th>方案</th><th>訂單編號</th><th>金額</th><th>預購信</th><th>開通</th><th>時間</th>
          </tr></thead>
          <tbody>
            {wp.map(o=>(
              <tr key={o.id}>
                <td><input type="checkbox" checked={sel.has(o.id)} onChange={()=>toggle(o.id)}/></td>
                <td style={{fontSize:13}}>{o.email}</td>
                <td className={styles.dim}>{o.plan_label||o.plan}</td>
                <td><code style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{o.mer_trade_no}</code></td>
                <td style={{fontWeight:800}}>NT$ {(Number(o.amount)||0).toLocaleString()}</td>
                <td>{o.presale_email_sent_at?<span style={{color:"#047857",fontWeight:700,fontSize:12}}>已寄</span>:<span style={{color:"#b45309",fontSize:12}}>未寄</span>}</td>
                <td>{o.access_granted_at?<span style={{color:"#047857",fontWeight:700,fontSize:12}}>已開通</span>:<span style={{color:"#b45309",fontSize:12}}>未開通</span>}</td>
                <td className={styles.dim} style={{fontSize:12,whiteSpace:"nowrap"}}>{fmt(o.created_at||o.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OrdersPage({showToast}){
  const [statusFilter,setStatusFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [detailOrder,setDetailOrder]=useState(null);
  const [rows,setRows]=useState([]);
  const [composeOpen,setComposeOpen]=useState(false);
  const [composeTo,setComposeTo]=useState("");
  const [bulkOpen,setBulkOpen]=useState(false);
  const [issuing,setIssuing]=useState(null);
  const [resending,setResending]=useState(null);
  const [refunding,setRefunding]=useState(false);
  const downloadRef=useRef(null);
  const [tablePage,setTablePage]=useState(1);
  // 自動開票關閉時（發票人工另外開）不顯示「發票待補開」告警；開票失敗／寄信失敗照舊。
  const [autoInvoice,setAutoInvoice]=useState(false);
  const PER=20;

  const loadOrders=useCallback(async()=>{
    try{
      const res=await _api("/api/admin/orders");
      if(!res.ok)throw new Error("fetch_failed");
      const{data,autoInvoice}=await res.json();
      setRows(data||[]);
      setAutoInvoice(!!autoInvoice);
    }catch{
      setRows([]);
      showToast?.("載入訂單失敗，顯示空白列表");
    }
  },[showToast]);

  useEffect(()=>{loadOrders();},[loadOrders]);

  async function issueInvoice(realId){
    if(!realId||issuing)return;
    setIssuing(realId);
    try{
      const res=await _api("/api/admin/issue-invoice",{method:"POST",body:JSON.stringify({id:realId})});
      const d=await res.json();
      if(res.ok&&d.invoiceNo){await loadOrders();showToast?.("✅ 發票開立成功："+d.invoiceNo);}
      else showToast?.("❌ 發票開立失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 發票開立失敗："+e.message);}
    finally{setIssuing(null);}
  }

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

  // manual=true：款項已在 PAYUNi 商店後台退完，只標記訂單＋撤銷存取（不再向 PAYUNi 發動退款）
  async function refundOrder(realId, manual=false){
    if(!realId||refunding)return;
    const msg=manual
      ?"確定要把此訂單標記為「已退款」嗎？\n\n・請先確認款項已在 PAYUNi 商店後台退款完成，這裡不會再向 PAYUNi 發動退款。\n・標記後將同步撤銷該學員的課程／遊戲存取，且無法復原。"
      :"確定要對此訂單申請退款嗎？\n\n・會向 PAYUNi 發動線上全額退款。\n・退款成功後將同步撤銷該學員的課程／遊戲存取，且無法復原。";
    if(!window.confirm(msg))return;
    setRefunding(true);
    try{
      const res=await _api("/api/admin/refund",{method:"POST",body:JSON.stringify({id:realId,manual})});
      const d=await res.json();
      if(res.ok&&d.ok){await loadOrders();setDetailOrder(null);const label=d.method==="manual"?"已標記退款":d.method==="cancel"?"已取消授權（未請款）":"退款成功";showToast?.("✅ "+label+(d.detail?"："+d.detail:"，存取已撤銷"));}
      else showToast?.("❌ 退款失敗："+(d.detail||d.error||"unknown"));
    }catch(e){showToast?.("❌ 退款失敗："+e.message);}
    finally{setRefunding(false);}
  }

  async function reviewFan(id, fan_review){
    try{
      const res=await _api(`/api/admin/orders/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fan_review})});
      const d=await res.json();
      if(d.ok){showToast?.(fan_review==="approved"?"已標記通過":"已標記不符");await loadOrders();}
      else showToast?.("更新失敗","error");
    }catch(e){showToast?.("更新失敗："+e.message,"error");}
  }

  const allOrders=useMemo(()=>rows.map(o=>({
    id:o.mer_trade_no||o.id,
    realId:o.id,
    source:o.source,
    plan:o.plan,
    enrolled:o.enrolled===true,
    student:o.buyer_name||o.email?.split("@")[0]||"學員",
    email:o.email,
    course:o.plan_label||"從零開始學鋼琴",
    amount:Number(o.amount)||0,
    method:payTypeLabel(o.pay_type),
    status:o.status||"pending",
    time:fmt(o.created_at||o.updated_at),
    createdRaw:o.created_at||o.updated_at, // 原始時間，供日期篩選（顯示用 time 已在地化，不可拿來 new Date）
    invoiceNo:o.invoice_no||"",
    invoiceError:o.invoice_error||"",
    emailError:o.email_error||"",
    needInvoice:(autoInvoice && o.status==="paid" && !o.invoice_no && !LEAD_SOURCES.includes(o.source)), // 已付款但未開票（待補開）；自動開票關閉或外部來源時不列告警
    proofUrl:o.proof_url||null,
    fanReview:o.fan_review||null,
  })),[rows,autoInvoice]);

  const [sel,setSel]=useState(()=>new Set());
  const [granting,setGranting]=useState(false);
  // 可開通的官網訂單：payuni + 已付款 + plan∈{course,bundle}（開通的是「課程」，game 不寫 enrollments 本就不該進名單）+ 未開通
  const ungranted=allOrders.filter(o=>o.source==="payuni"&&o.status==="paid"&&(o.plan==="course"||o.plan==="bundle")&&!o.enrolled);
  const ungrantedIds=ungranted.map(o=>o.realId);
  const toggle=(id)=>setSel(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});

  async function grantIds(ids,{all=false}={}){
    if(granting||!ids.length){if(!ids.length)showToast?.("⚠️ 沒有可開通的訂單");return;}
    if(!window.confirm(`確定開通這 ${ids.length} 筆課程？`))return;
    setGranting(true);
    try{
      const res=await _api("/api/admin/grant-orders",{method:"POST",body:JSON.stringify(all?{}:{ids})});
      const d=await res.json();
      if(!res.ok||d.ok===false)showToast?.("❌ 開通失敗："+(d.error||"unknown"));
      else{
        showToast?.(`✅ 開通完成：成功 ${d.granted||0} 筆${d.failed?`，失敗 ${d.failed} 筆`:""}`);
        setSel(new Set());
        await loadOrders();
      }
    }catch(e){showToast?.("❌ 開通失敗："+e.message);}finally{setGranting(false);}
  }
  const grantSelected=()=>grantIds(Array.from(sel));
  const grantAll=()=>grantIds(ungrantedIds,{all:true});
  const grantOne=(realId)=>grantIds([realId]);

  const filtered=useMemo(()=>allOrders.filter(o=>{
    if(statusFilter==="fan_pending"){if(o.fanReview!=="pending")return false;}
    else if(statusFilter!=="all"&&o.status!==statusFilter)return false;
    if(search&&!o.student.toLowerCase().includes(search.toLowerCase())&&!o.email?.toLowerCase().includes(search.toLowerCase())&&!o.id.toLowerCase().includes(search.toLowerCase()))return false;
    if(!inDateRange(o.createdRaw,dateFrom,dateTo))return false;
    return true;
  }),[allOrders,statusFilter,search,dateFrom,dateTo]);

  // 搜尋/篩選改變時回到第 1 頁
  useEffect(()=>{setTablePage(1);},[search,statusFilter,dateFrom,dateTo,rows.length]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PER));
  const pageRows=filtered.slice((tablePage-1)*PER,tablePage*PER);

  // 批次追單對象：目前篩選結果中「未付款／付款失敗」的去重信箱
  const followupTargets=useMemo(()=>Array.from(new Set(
    filtered.filter(o=>o.status==="pending"||o.status==="failed").map(o=>(o.email||"").trim().toLowerCase()).filter(Boolean)
  )),[filtered]);

  // 對帳彙整：以原始 rows 只套日期區間（忽略狀態/搜尋），確保營收與退款都涵蓋
  const dateRangeRows=useMemo(()=>rows.filter(o=>inDateRange(o.created_at||o.updated_at,dateFrom,dateTo)),[rows,dateFrom,dateTo]);
  const report=useMemo(()=>summarizeOrders(dateRangeRows,PLAN_CATALOG),[dateRangeRows]);
  const needsAttention=allOrders.filter(o=>o.status==="paid"&&(o.needInvoice||o.invoiceError||o.emailError));
  const paid=allOrders.filter(o=>o.status==="paid");
  const pending=allOrders.filter(o=>o.status==="pending");
  const refunded=allOrders.filter(o=>o.status==="refunded");
  const totalRev=paid.reduce((s,o)=>s+o.amount,0);

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

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>訂單管理</h1><p>共 {allOrders.length} 筆訂單</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={()=>{setComposeTo("");setComposeOpen(true);}}>✉️ 寄送單封信</button>
          <button className={styles.btnSmall} disabled={!followupTargets.length} title={followupTargets.length?`對 ${followupTargets.length} 位未付款顧客批次追單`:"目前篩選無未付款訂單"} onClick={()=>setBulkOpen(true)}>📨 批次追單{followupTargets.length?`（${followupTargets.length}）`:""}</button>
          <a href="https://www.payuni.com.tw" target="_blank" className={styles.btnSmall} style={{display:"flex",alignItems:"center",gap:5}}><ExternalLink size={13}/> Payuni 後台</a>
          <button className={styles.btnSmall} onClick={exportOrders}>匯出 CSV</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        <StatCard label="總營收" value={`NT$ ${totalRev.toLocaleString()}`} sub="所有已付款" icon={DollarSign} color="#16a34a"/>
        <StatCard label="已付款訂單" value={excludeManual(paid).length} sub="筆（不含手動開通）" icon={CheckCircle2} color="#2563eb"/>
        <StatCard label="待處理訂單" value={pending.length} sub="筆待確認" icon={CreditCard} color="#f59e0b"/>
        <StatCard label="已退款訂單" value={refunded.length} sub="筆" icon={BarChart2} color="#dc2626"/>
      </div>
      {needsAttention.length>0&&(
        <div className={styles.alertPanel} style={{marginBottom:16}}>
          <div className={styles.alertPanelHead}>
            <span className={styles.alertPanelTitle}><AlertTriangle size={16}/> 待處理告警</span>
            <span className={styles.alertCount}>{needsAttention.length}</span>
          </div>
          <div className={styles.alertList}>
            {needsAttention.map(o=>(
              <div key={o.realId} className={styles.alertItem}>
                <div className={styles.alertItemInfo}>
                  <div className={styles.alertItemTop}>
                    <code className={styles.codeChip}>{o.id}</code>
                    <span className={styles.alertEmail}>{o.email}</span>
                  </div>
                  <div className={styles.alertReason}>
                    {o.emailError&&<span>開課信寄送失敗：{o.emailError}</span>}
                    {o.invoiceError&&<span>開票失敗：{o.invoiceError}</span>}
                    {!o.invoiceError&&o.needInvoice&&<span>發票待補開</span>}
                  </div>
                </div>
                <div className={styles.alertItemActions}>
                  {o.needInvoice&&<button className={styles.btnSmall} disabled={issuing===o.realId} onClick={()=>issueInvoice(o.realId)}>{issuing===o.realId?"補開中…":"補開發票"}</button>}
                  {o.emailError&&<button className={styles.btnSmall} disabled={resending===o.realId} onClick={()=>resendEmail(o.realId)}>{resending===o.realId?"補寄中…":"補寄開課信"}</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ManualGrantCard reload={loadOrders} showToast={showToast}/>
      <WordpressLeadsPanel rows={rows} reload={loadOrders} showToast={showToast}/>
      <div className={styles.panel} style={{marginBottom:16}}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:10}}>
          <h3 style={{margin:0}}>對帳彙整（依日期區間）</h3>
          <button className={styles.btnSmall} onClick={exportReconciliation}>匯出對帳 CSV</button>
        </div>
        <div className={styles.reconPeriod}>期間：{(dateFrom||dateTo)?`${dateFrom||"…"} ~ ${dateTo||"…"}`:"全部期間"}（不受狀態／搜尋篩選影響）</div>
        <div className={styles.reconGrid}>
          <div className={styles.reconTile}>
            <div className={styles.reconLabel}>有效收款</div>
            <div className={`${styles.reconValue} ${styles.pos}`}>NT$ {report.paid.amount.toLocaleString()}</div>
            <div className={styles.reconSub}>{report.paid.count} 筆 · 已付款</div>
          </div>
          <div className={styles.reconTile}>
            <div className={styles.reconLabel}>退款</div>
            <div className={`${styles.reconValue} ${styles.neg}`}>NT$ {report.refunded.amount.toLocaleString()}</div>
            <div className={styles.reconSub}>{report.refunded.count} 筆</div>
          </div>
          <div className={styles.reconTile}>
            <div className={styles.reconLabel}>待付款</div>
            <div className={styles.reconValue}>{report.pending.count}<span className={styles.reconUnit}> 筆</span></div>
            <div className={styles.reconSub}>尚未付款</div>
          </div>
          <div className={styles.reconTile}>
            <div className={styles.reconLabel}>發票</div>
            <div className={styles.reconValue}>{report.invoice.issued}<span className={styles.reconUnit}> / {report.invoice.issued+report.invoice.missing}</span></div>
            <div className={styles.reconSub}>已開 {report.invoice.issued}／未開 {report.invoice.missing}</div>
          </div>
          <div className={styles.reconTile}>
            <div className={styles.reconLabel}>優惠折抵</div>
            <div className={styles.reconValue}>NT$ {report.coupon.discount.toLocaleString()}</div>
            <div className={styles.reconSub}>{report.coupon.count} 筆</div>
          </div>
        </div>
        {Object.keys(report.byPayType).length>0&&(
          <div className={styles.reconPayTypes}>
            <div className={styles.reconLabel} style={{marginBottom:8}}>付款方式分佈（已付款）</div>
            <div className={styles.payChips}>
              {Object.entries(report.byPayType).map(([k,v])=>(
                <span key={k} className={styles.payChip}><b>{k}</b>{v.count} 筆 · NT$ {v.amount.toLocaleString()}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:10}}>
          <div className={styles.tableControls} style={{flexWrap:"wrap"}}>
            <input className={styles.searchInput} placeholder="搜尋學員、訂單編號…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className={styles.selectInput} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="all">全部狀態</option>
              <option value="paid">已付款</option>
              <option value="pending">待付款</option>
              <option value="refunded">已退款</option>
              <option value="failed">付款失敗</option>
              <option value="cancelled">已取消</option>
              <option value="fan_pending">粉絲待審核</option>
            </select>
            <input className={styles.selectInput} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} title="開始日期"/>
            <input className={styles.selectInput} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} title="結束日期"/>
            {(dateFrom||dateTo)&&<button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>{setDateFrom("");setDateTo("");}}>清除日期</button>}
          </div>
          <span className={styles.dim}>{filtered.length} / {allOrders.length} 筆</span>
        </div>
        {ungranted.length>0&&(
          <div className={styles.reconPeriod} style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <b>待開通 {ungranted.length} 筆</b>（官網付款、尚未開通課程）
            <button className={styles.btnSmall} disabled={granting||!sel.size} onClick={grantSelected}>{granting?"開通中…":`開通勾選（${sel.size}）`}</button>
            <button className={styles.btnSmall} disabled={granting} onClick={grantAll}>{granting?"開通中…":`全部開通（${ungranted.length}）`}</button>
          </div>
        )}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>訂單編號</th><th>學員</th><th>課程</th><th>金額</th><th>付款方式</th><th>狀態</th><th>開通</th><th>發票號碼</th><th>建立時間</th><th>操作</th></tr></thead>
            <tbody>
              {!filtered.length?<tr><td colSpan={10} className={styles.empty}><span className={styles.emptyIcon}>📋</span><span className={styles.emptyTitle}>還沒有任何訂單</span><span className={styles.emptySub}>＋ 等待第一筆購買</span></td></tr>
              :pageRows.map(o=>(
                <tr key={o.id}>
                  <td><code style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{o.id}</code></td>
                  <td><div style={{fontWeight:700,fontSize:13}}>{o.student}</div><div style={{fontSize:12,color:"#94a3b8"}}>{o.email}</div></td>
                  <td className={styles.dim} style={{maxWidth:160,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.course}</td>
                  <td style={{fontWeight:800}}>NT$ {o.amount.toLocaleString()}</td>
                  <td className={styles.dim}>{o.method}</td>
                  <td><OrderStatusPill status={o.status}/></td>
                  <td>
                    {o.source==="payuni"&&o.status==="paid"&&(o.plan==="course"||o.plan==="bundle")
                      ? (o.enrolled
                          ? <span style={{color:"#16a34a",fontWeight:700}}>已開通</span>
                          : <span style={{display:"inline-flex",alignItems:"center",gap:8}}>
                              <input type="checkbox" checked={sel.has(o.realId)} onChange={()=>toggle(o.realId)}/>
                              <button className={styles.btnSmall} disabled={granting} onClick={()=>grantOne(o.realId)}>{granting?"…":"開通"}</button>
                            </span>)
                      : "—"}
                  </td>
                  <td style={{fontSize:12,whiteSpace:"nowrap"}}>
                    {o.invoiceNo
                      ? <code style={{fontSize:11,background:"#ecfdf5",color:"#047857",padding:"2px 6px",borderRadius:4,fontWeight:700}}>{o.invoiceNo}</code>
                      : (o.needInvoice
                          ? <span style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                              {o.invoiceError && <span style={{color:"#dc2626",fontWeight:700}}>開票失敗：{o.invoiceError}</span>}
                              <button className={styles.btnSmall} disabled={issuing===o.realId} onClick={()=>issueInvoice(o.realId)}>{issuing===o.realId?"補開中…":"補開發票"}</button>
                            </span>
                          : <span style={{color:"#94a3b8"}}>尚未開立</span>)}
                  </td>
                  <td className={styles.dim} style={{fontSize:12,whiteSpace:"nowrap"}}>{o.time}</td>
                  <td><button className={styles.btnSmall} onClick={()=>setDetailOrder(o)}>查看</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length>PER&&(
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12,padding:"12px 0"}}>
            <button className={styles.btnSmall} disabled={tablePage<=1} onClick={()=>setTablePage(p=>Math.max(1,p-1))}>上一頁</button>
            <span className={styles.dim} style={{fontSize:13}}>第 {tablePage} / {totalPages} 頁</span>
            <button className={styles.btnSmall} disabled={tablePage>=totalPages} onClick={()=>setTablePage(p=>Math.min(totalPages,p+1))}>下一頁</button>
          </div>
        )}
      </div>
      {detailOrder&&(
        <div className={styles.modalOverlay} onClick={()=>setDetailOrder(null)}>
          <div className={styles.modalCard} style={{width:"min(520px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0,fontSize:18}}>訂單詳情</h3>
              <button className={styles.iconBtn} onClick={()=>setDetailOrder(null)}><X size={18}/></button>
            </div>
            <div style={{display:"grid",gap:0,marginBottom:20,border:"1px solid #f1f5f9",borderRadius:12,overflow:"hidden"}}>
              {[
                ["訂單編號",<code key="id" style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{detailOrder.id}</code>],
                ["學員姓名",detailOrder.student],
                ["Email",detailOrder.email],
                ["課程",detailOrder.course],
                ["金額",<strong key="a">NT$ {detailOrder.amount.toLocaleString()}</strong>],
                ["付款方式",detailOrder.method],
                ["狀態",<OrderStatusPill key="s" status={detailOrder.status}/>],
                ["發票號碼",detailOrder.invoiceNo
                  ? <code key="inv" style={{fontSize:11,background:"#ecfdf5",color:"#047857",padding:"2px 6px",borderRadius:4,fontWeight:700}}>{detailOrder.invoiceNo}</code>
                  : (detailOrder.needInvoice
                      ? <span key="iv" style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          {detailOrder.invoiceError && <span style={{color:"#dc2626",fontWeight:700}}>開票失敗：{detailOrder.invoiceError}</span>}
                          <button className={styles.btnSmall} disabled={issuing===detailOrder.realId} onClick={()=>issueInvoice(detailOrder.realId)}>{issuing===detailOrder.realId?"補開中…":"補開發票"}</button>
                        </span>
                      : <span key="iv" style={{color:"#94a3b8"}}>尚未開立</span>)],
                ["建立時間",detailOrder.time],
              ].map(([label,val],i,arr)=>(
                <div key={label} style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,fontSize:14,padding:"11px 14px",borderBottom:i<arr.length-1?"1px solid #f8fafc":"0",background:i%2?"#fafafa":"#fff"}}>
                  <span style={{color:"#64748b",fontWeight:700}}>{label}</span>
                  <span style={{color:"#0f172a"}}>{val}</span>
                </div>
              ))}
            </div>
            {detailOrder?.fanReview&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #eee"}}>
                <div style={{fontWeight:700,marginBottom:6}}>粉絲憑證審核：{detailOrder.fanReview==="pending"?"待審核":detailOrder.fanReview==="approved"?"✅ 通過":"❌ 不符"}</div>
                {detailOrder.proofUrl
                  ?<ProofImage url={detailOrder.proofUrl}/>
                  :<span style={{color:"#999"}}>（無憑證圖）</span>}
                {detailOrder.fanReview==="pending"&&(
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={()=>reviewFan(detailOrder.realId,"approved")} style={{flex:1,padding:10,borderRadius:8,border:0,background:"#15803d",color:"#fff",fontWeight:700,cursor:"pointer"}}>通過</button>
                    <button onClick={()=>reviewFan(detailOrder.realId,"rejected")} style={{flex:1,padding:10,borderRadius:8,border:0,background:"#dc2626",color:"#fff",fontWeight:700,cursor:"pointer"}}>不符</button>
                  </div>
                )}
                <p style={{fontSize:12,color:"#888",marginTop:8}}>標記僅供記錄，不會自動撤銷開通或退款。</p>
              </div>
            )}
            <div className={styles.modalActions}>
              <button className={styles.btnSmall} onClick={()=>setDetailOrder(null)}>關閉</button>
              <button className={styles.btnSmall} onClick={()=>{setComposeTo(detailOrder.email||"");setComposeOpen(true);}}>✉️ 寄信給客人</button>
              {detailOrder.status==="paid"&&detailOrder.realId&&<>
                <button className={`${styles.btnSmall} ${styles.btnDanger}`} disabled={refunding} onClick={()=>refundOrder(detailOrder.realId)}>{refunding?"退款中…":"申請退款"}</button>
                <button className={styles.btnSmall} disabled={refunding} onClick={()=>refundOrder(detailOrder.realId,true)} title="款項已在 PAYUNi 商店後台退款完成時使用：只標記訂單並撤銷存取，不會再向 PAYUNi 發動退款">已在 PAYUNi 退款 → 標記</button>
              </>}
            </div>
          </div>
        </div>
      )}
      <ComposeEmailModal open={composeOpen} initialTo={composeTo} onClose={()=>setComposeOpen(false)} showToast={showToast}/>
      <BulkFollowupModal open={bulkOpen} recipients={followupTargets} onClose={()=>setBulkOpen(false)} showToast={showToast}/>
      <a ref={downloadRef} style={{display:"none"}} aria-hidden="true"/>
    </div>
  );
}

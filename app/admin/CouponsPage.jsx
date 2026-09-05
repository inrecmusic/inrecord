"use client";
import { useState, useCallback, useEffect, Fragment } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { StatCard } from "./shared";
import { Ticket, BarChart2, Percent, X } from "lucide-react";

// ── Coupons Page ───────────────────────────────────────────────────────────
export default function CouponsPage({ showToast }){
  const [coupons,setCoupons]=useState([]);
  const [loading,setLoading]=useState(false);
  const [showCreate,setShowCreate]=useState(false);
  const [deleteId,setDeleteId]=useState(null);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({name:"",code:"",type:"percent",value:"",plan:"",limit:"",start:"",end:""});
  const [formErr,setFormErr]=useState("");

  // ── 序號庫 ──
  const [batches,setBatches]=useState([]);
  const [batchLoading,setBatchLoading]=useState(false);
  const [batchLoadErr,setBatchLoadErr]=useState("");
  const [showBatchCreate,setShowBatchCreate]=useState(false);
  const [batchSaving,setBatchSaving]=useState(false);
  const [batchErr,setBatchErr]=useState("");
  const [batchForm,setBatchForm]=useState({name:"",type:"percent",value:"",plan:"",prefix:"",note:"",start:"",end:"",mode:"auto",quantity:"50",codes:""});
  const [expandId,setExpandId]=useState(null);
  const [expandCodes,setExpandCodes]=useState([]);
  const [expandLoading,setExpandLoading]=useState(false);
  const [deleteBatch,setDeleteBatch]=useState(null);
  const [batchSearch,setBatchSearch]=useState("");
  const [codeFilter,setCodeFilter]=useState("all"); // all | unused | used
  const [codeSearch,setCodeSearch]=useState("");
  const [codeLimit,setCodeLimit]=useState(60);

  const fetchBatches=useCallback(async()=>{
    setBatchLoading(true);setBatchLoadErr("");
    try{
      const r=await _api("/api/admin/coupon-batches");
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`載入失敗（HTTP ${r.status}）`);
      setBatches(d.data||[]);
    }catch(e){setBatches([]);setBatchLoadErr(e.message||"載入失敗");}
    finally{setBatchLoading(false);}
  },[]);
  useEffect(()=>{fetchBatches();},[fetchBatches]);

  function discountLabel(b){return b.type==="percent"?`${b.value}% 折扣`:b.type==="price"?`指定價 NT$${b.value}`:`折 NT$${b.value}`;}

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

  // 依生效/結束日推算批次狀態（與前台 couponError 的日期判斷一致），避免後台「啟用中」但前台「尚未開始」對不起來
  function batchStatus(b){
    const now=new Date();
    if(b.starts_at&&new Date(b.starts_at)>now)return["upcoming",`尚未開始（${b.starts_at} 起）`,"#fef9c3","#854d0e"];
    if(b.ends_at){const e=new Date(b.ends_at);e.setHours(23,59,59,999);if(e<now)return["ended","已結束","#fee2e2","#991b1b"];}
    return["active","進行中","#dcfce7","#166534"];
  }

  async function toggleExpand(b){
    if(expandId===b.id){setExpandId(null);setExpandCodes([]);return;}
    setExpandId(b.id);setExpandLoading(true);setExpandCodes([]);
    setCodeFilter("all");setCodeSearch("");setCodeLimit(60);
    try{const r=await _api(`/api/admin/coupon-batches/${b.id}/codes`);const{data}=await r.json();setExpandCodes(data||[]);}
    catch{setExpandCodes([]);}
    finally{setExpandLoading(false);}
  }

  async function handleBatchCreate(e){
    e.preventDefault();setBatchErr("");
    if(!batchForm.name.trim()){setBatchErr("請輸入批次名稱");return;}
    if(!batchForm.value||isNaN(batchForm.value)||Number(batchForm.value)<=0){setBatchErr("請輸入有效的折扣值");return;}
    if(batchForm.type==="percent"&&Number(batchForm.value)>100){setBatchErr("百分比折扣不可超過 100");return;}
    if(batchForm.mode==="auto"&&(!batchForm.quantity||Number(batchForm.quantity)<=0)){setBatchErr("請輸入產生數量");return;}
    if(batchForm.mode==="manual"&&!batchForm.codes.trim()){setBatchErr("請貼上序號（一行一組）");return;}
    setBatchSaving(true);
    try{
      const r=await _api("/api/admin/coupon-batches",{method:"POST",body:JSON.stringify({
        name:batchForm.name.trim(),type:batchForm.type,value:Number(batchForm.value),
        plan:batchForm.plan||null,
        prefix:batchForm.prefix.trim()||null,note:batchForm.note.trim()||null,
        starts_at:batchForm.start||null,ends_at:batchForm.end||null,
        mode:batchForm.mode,
        quantity:batchForm.mode==="auto"?Number(batchForm.quantity):undefined,
        codes:batchForm.mode==="manual"?batchForm.codes:undefined,
      })});
      const d=await r.json();
      if(!r.ok){
        const msg=d.error==="code_exists"?`序號重複：${(d.conflicts||[]).slice(0,5).join(", ")}`
          :d.error==="too_many_codes"?"數量超過上限 500"
          :d.error==="code_collision"?"自動產碼碰撞過多，請換前綴或減少數量"
          :d.error||"建立失敗";
        throw new Error(msg);
      }
      showToast?.(`✅ 已建立批次，共 ${d.data.total} 組序號`);
      setShowBatchCreate(false);
      setBatchForm({name:"",type:"percent",value:"",plan:"",prefix:"",note:"",start:"",end:"",mode:"auto",quantity:"50",codes:""});
      fetchBatches();
    }catch(err){setBatchErr(err.message);}
    finally{setBatchSaving(false);}
  }

  const [batchDelBusy,setBatchDelBusy]=useState(false);
  async function confirmDeleteBatch(){
    if(batchDelBusy)return; // 防連點重複刪整批序號
    setBatchDelBusy(true);
    try{
      const r=await _api(`/api/admin/coupon-batches?id=${deleteBatch.id}`,{method:"DELETE"});
      if(!r.ok)throw new Error();
      showToast?.("✅ 批次已刪除");setDeleteBatch(null);
      if(expandId===deleteBatch.id){setExpandId(null);setExpandCodes([]);}
      fetchBatches();
    }catch{showToast?.("❌ 刪除失敗");}
    finally{setBatchDelBusy(false);}
  }

  function copyAllCodes(){
    if(!expandCodes.length)return;
    navigator.clipboard?.writeText(expandCodes.map(c=>c.code).join("\n"));
    showToast?.("✅ 已複製全部序號");
  }

  function downloadCsv(b){
    const dl=discountLabel(b);
    // 防 CSV 公式注入：以 = + - @ Tab CR 開頭者前綴單引號並整欄加引號
    const esc=(s)=>{let v=String(s??"");const f=/^[=+\-@\t\r]/.test(v);if(f)v="'"+v;return f||/[",\n\r]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;};
    const header="序號,狀態,兌換人,兌換時間,折扣,批次名稱";
    const lines=expandCodes.map(c=>[esc(c.code),c.used?"已使用":"未使用",esc(c.redeemedEmail||""),esc(c.redeemedAt?String(c.redeemedAt).slice(0,10):""),esc(dl),esc(b.name)].join(","));
    const csv="﻿"+[header,...lines].join("\n")+"\n"; // BOM 讓 Excel 正確顯示中文
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`序號_${b.name}.csv`;a.click();
    URL.revokeObjectURL(url);
  }

  const fetchCoupons=useCallback(async()=>{
    setLoading(true);
    try{const r=await _api("/api/admin/coupons");const{data}=await r.json();setCoupons(data||[]);}
    catch{setCoupons([]);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{fetchCoupons();},[fetchCoupons]);

  const now=new Date();
  function displayStatus(c){
    if(c.status==="disabled")return "disabled";
    if(c.ends_at){const e=new Date(c.ends_at);e.setHours(23,59,59,999);if(e<now)return "expired";}
    return "active";
  }
  const rows=coupons.map(c=>({...c,_status:displayStatus(c)}));
  const active=rows.filter(c=>c._status==="active").length;
  const expired=rows.filter(c=>c._status==="expired").length;
  const disabled=rows.filter(c=>c._status==="disabled").length;
  const totalUsed=coupons.reduce((s,c)=>s+(c.used||0),0);

  function CouponStatus({status}){
    const MAP={active:["啟用中","#dcfce7","#166534"],expired:["已過期","#fee2e2","#991b1b"],disabled:["已停用","#f1f5f9","#475569"]};
    const [label,bg,fg]=MAP[status]||MAP.disabled;
    return <span className={styles.pill} style={{background:bg,color:fg}}>{label}</span>;
  }

  function genCode(){const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";return Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join("");}

  async function handleCreate(e){
    e.preventDefault();setFormErr("");
    if(!form.name.trim()){setFormErr("請輸入優惠券名稱");return;}
    if(!form.code.trim()){setFormErr("請輸入優惠碼");return;}
    if(!form.value||isNaN(form.value)||Number(form.value)<=0){setFormErr("請輸入有效的折扣值");return;}
    if(form.type==="percent"&&Number(form.value)>100){setFormErr("百分比折扣不可超過 100");return;}
    setSaving(true);
    try{
      const r=await _api("/api/admin/coupons",{method:"POST",body:JSON.stringify({
        name:form.name.trim(),code:form.code.trim().toUpperCase(),type:form.type,value:Number(form.value),
        plan:form.plan||null,
        usage_limit:form.limit?Number(form.limit):null,starts_at:form.start||null,ends_at:form.end||null,
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error==="code_exists"?"優惠碼已存在，請換一個":d.error||"建立失敗");
      showToast?.("✅ 優惠券已建立");
      setShowCreate(false);setForm({name:"",code:"",type:"percent",value:"",plan:"",limit:"",start:"",end:""});
      fetchCoupons();
    }catch(err){setFormErr(err.message);}
    finally{setSaving(false);}
  }

  async function toggleStatus(c){
    try{
      const r=await _api("/api/admin/coupons",{method:"PATCH",body:JSON.stringify({id:c.id,status:c.status==="active"?"disabled":"active"})});
      if(!r.ok)throw new Error();
      fetchCoupons();
    }catch{showToast?.("❌ 操作失敗");}
  }
  const [delBusy,setDelBusy]=useState(false);
  async function confirmDelete(){
    if(delBusy)return; // 防連點重複 DELETE
    setDelBusy(true);
    try{
      const r=await _api(`/api/admin/coupons?id=${deleteId}`,{method:"DELETE"});
      if(!r.ok)throw new Error();
      showToast?.("✅ 優惠券已刪除");setDeleteId(null);fetchCoupons();
    }catch{showToast?.("❌ 刪除失敗");}
    finally{setDelBusy(false);}
  }

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>優惠券管理</h1><p>建立與管理折扣代碼（結帳時自動套用）</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchCoupons}>重新整理</button>
          <button className={styles.btnPrimary} onClick={()=>setShowCreate(true)}>新增優惠券</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        <StatCard label="啟用中" value={active} sub="張優惠券" icon={Ticket} color="#16a34a"/>
        <StatCard label="已過期" value={expired} sub="張優惠券" icon={Ticket} color="#dc2626"/>
        <StatCard label="已停用" value={disabled} sub="張優惠券" icon={Ticket} color="#94a3b8"/>
        <StatCard label="總使用次數" value={totalUsed} sub="次" icon={BarChart2} color="#2563eb"/>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}><h2>優惠券列表</h2><span className={styles.dim}>共 {coupons.length} 張</span></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>名稱</th><th>代碼</th><th>折扣</th><th>已使用 / 上限</th><th>狀態</th><th>有效期間</th><th>操作</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={7} className={styles.empty}>載入中…</td></tr>
              :!rows.length?<tr><td colSpan={7} className={styles.empty}><span className={styles.emptyIcon}>🎟️</span><span className={styles.emptyTitle}>還沒有任何優惠券</span><span className={styles.emptySub}>新增優惠券來吸引更多學員</span></td></tr>
              :rows.map(c=>{
                const limit=c.usage_limit;
                return(
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <code style={{background:"#f1f5f9",padding:"3px 8px",borderRadius:6,fontSize:12,fontWeight:700,letterSpacing:1}}>{c.code}</code>
                      <button className={styles.iconBtn} onClick={()=>{navigator.clipboard?.writeText(c.code)}} title="複製">複製</button>
                    </div>
                  </td>
                  <td>
                    <span className={styles.discountBadge} style={{background:c.type==="percent"?"#eff6ff":c.type==="price"?"#dcfce7":"#fef3c7",color:c.type==="percent"?"#1d4ed8":c.type==="price"?"#166534":"#92400e"}}>
                      {c.type==="percent"?<><Percent size={11}/> {c.value}%</>:c.type==="price"?<>指定價 NT${c.value}</>:<>NT$ {c.value}</>}
                    </span>
                  </td>
                  <td>
                    <div style={{fontSize:13}}><span style={{fontWeight:800}}>{c.used||0}</span> / {limit==null?"∞":limit}</div>
                    {limit!=null&&(
                      <div style={{marginTop:4,height:4,background:"#f1f5f9",borderRadius:999,width:80,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${Math.min((c.used||0)/limit*100,100)}%`,background:"#2563eb",borderRadius:999}}/>
                      </div>
                    )}
                  </td>
                  <td><CouponStatus status={c._status}/></td>
                  <td className={styles.dim} style={{fontSize:12}}>{c.starts_at||"—"} ~ {c.ends_at||"—"}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.btnSmall} onClick={()=>toggleStatus(c)}>{c.status==="active"?"停用":"啟用"}</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteId(c.id)}>刪除</button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 序號庫 ── */}
      <div className={styles.pageHeader} style={{marginTop:32}}>
        <div><h2 style={{margin:0}}>序號庫</h2><p>現場活動限定：批次產生獨立序號，每組限用一次</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchBatches}>重新整理</button>
          <button className={styles.btnPrimary} onClick={()=>setShowBatchCreate(true)}>新增批次</button>
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:10}}>
          <h2>批次列表</h2>
          <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:"auto"}}>
            <input className={styles.searchInput} placeholder="搜尋批次名稱、前綴…" value={batchSearch} onChange={e=>setBatchSearch(e.target.value)}/>
            <span className={styles.dim}>{shownBatches.length} / {batches.length} 批</span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>批次名稱</th><th>折扣</th><th>狀態</th><th>已用 / 總數</th><th>前綴</th><th>有效期間</th><th>備註</th><th>操作</th></tr></thead>
            <tbody>
              {batchLoading?<tr><td colSpan={8} className={styles.empty}>載入中…</td></tr>
              :batchLoadErr?<tr><td colSpan={8} className={styles.empty}><span className={styles.emptyIcon}>⚠️</span><span className={styles.emptyTitle}>批次清單載入失敗</span><span className={styles.emptySub} style={{color:"#dc2626"}}>{batchLoadErr}</span><button className={styles.btnSmall} style={{marginTop:10}} onClick={fetchBatches}>重試</button></td></tr>
              :!batches.length?<tr><td colSpan={8} className={styles.empty}><span className={styles.emptyIcon}>🎫</span><span className={styles.emptyTitle}>還沒有任何序號批次</span><span className={styles.emptySub}>新增批次來產生現場活動序號</span></td></tr>
              :shownBatches.map(b=>(
                <Fragment key={b.id}>
                <tr>
                  <td><strong>{b.name}</strong></td>
                  <td>
                    <span className={styles.discountBadge} style={{background:b.type==="percent"?"#eff6ff":b.type==="price"?"#dcfce7":"#fef3c7",color:b.type==="percent"?"#1d4ed8":b.type==="price"?"#166534":"#92400e"}}>
                      {b.type==="percent"?<><Percent size={11}/> {b.value}%</>:b.type==="price"?<>指定價 NT${b.value}</>:<>NT$ {b.value}</>}
                    </span>
                  </td>
                  <td>{(()=>{const[,label,bg,fg]=batchStatus(b);return<span className={styles.pill} style={{background:bg,color:fg,whiteSpace:"nowrap"}}>{label}</span>;})()}</td>
                  <td><span style={{fontWeight:800}}>{b.used}</span> / {b.total}</td>
                  <td className={styles.dim}>{b.prefix||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12}}>{b.starts_at||"—"} ~ {b.ends_at||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12,maxWidth:160}}>{b.note||"—"}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.btnSmall} onClick={()=>toggleExpand(b)}>{expandId===b.id?"收合":"查看序號"}</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteBatch(b)}>刪除</button>
                    </div>
                  </td>
                </tr>
                {expandId===b.id&&(
                  <tr>
                    <td colSpan={8} style={{background:"#f8fafc"}}>
                      {expandLoading?<div className={styles.dim} style={{padding:12}}>載入序號中…</div>:(()=>{
                        const vis=visibleCodes();
                        const shown=vis.slice(0,codeLimit);
                        return(
                        <div style={{padding:"8px 4px"}}>
                          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                            <button className={styles.btnSmall} onClick={copyAllCodes}>全選複製</button>
                            <button className={styles.btnSmall} onClick={()=>downloadCsv(b)}>下載 CSV</button>
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
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showCreate&&(
        <div className={styles.modalOverlay} onClick={()=>setShowCreate(false)}>
          <div className={styles.modalCard} style={{width:"min(520px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0,fontSize:18}}>新增優惠券</h3>
              <button className={styles.iconBtn} onClick={()=>setShowCreate(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleCreate} style={{display:"grid",gap:14}}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>優惠券名稱 *</label><input className={styles.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="例：早鳥優惠"/></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>優惠碼 *</label>
                  <div style={{display:"flex",gap:8}}>
                    <input className={styles.input} style={{flex:1}} value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="MYCODE"/>
                    <button type="button" className={styles.btnSmall} onClick={()=>setForm(p=>({...p,code:genCode()}))}>隨機產生</button>
                  </div>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣類型</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                    <option value="percent">百分比折扣 (%)</option>
                    <option value="fixed">固定金額折扣 (NT$)</option>
                    <option value="price">指定價</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣值 * {form.type==="percent"?"(%)":form.type==="price"?"成交價 NT$":"(NT$)"}</label>
                  <input className={styles.input} type="number" min="1" value={form.value} onChange={e=>setForm(p=>({...p,value:e.target.value}))} placeholder={form.type==="percent"?"10":"300"}/>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label style={{ wordBreak: "keep-all", lineBreak: "strict" }}>綁定方案（選填）</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={form.plan} onChange={e=>setForm(p=>({...p,plan:e.target.value}))}>
                    <option value="">不限方案</option>
                    <option value="course">鋼琴自學全課程</option>
                    <option value="bundle">學琴全攻略（課程包）</option>
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}><label>使用上限（留空=無限制）</label><input className={styles.input} type="number" min="1" value={form.limit} onChange={e=>setForm(p=>({...p,limit:e.target.value}))} placeholder="100"/></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}><label>開始日期</label><input className={styles.input} type="date" value={form.start} onChange={e=>setForm(p=>({...p,start:e.target.value}))}/></div>
                <div className={styles.formGroup} style={{flex:1}}><label>結束日期</label><input className={styles.input} type="date" value={form.end} onChange={e=>setForm(p=>({...p,end:e.target.value}))}/></div>
              </div>
              {formErr&&<p style={{color:"#dc2626",fontSize:13,margin:0,fontWeight:700}}>{formErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={()=>setShowCreate(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving?"建立中…":"建立優惠券"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId&&(
        <div className={styles.modalOverlay} onClick={()=>setDeleteId(null)}>
          <div className={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontSize:17}}>確認刪除優惠券</h3>
            <p style={{margin:"0 0 20px",color:"#64748b",fontSize:14}}>刪除後無法復原，確定要刪除嗎？</p>
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteId(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete} disabled={delBusy}>確認刪除</button></div>
          </div>
        </div>
      )}

      {/* Batch create modal */}
      {showBatchCreate&&(
        <div className={styles.modalOverlay} onClick={()=>!batchSaving&&setShowBatchCreate(false)}>
          <div className={styles.modalCard} style={{width:"min(560px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0,fontSize:18}}>新增序號批次</h3>
              <button className={styles.iconBtn} onClick={()=>setShowBatchCreate(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleBatchCreate} style={{display:"grid",gap:14}}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>批次名稱 *</label><input className={styles.input} value={batchForm.name} onChange={e=>setBatchForm(p=>({...p,name:e.target.value}))} placeholder="例：2026 春季演奏會"/></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣類型</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={batchForm.type} onChange={e=>setBatchForm(p=>({...p,type:e.target.value}))}>
                    <option value="percent">百分比折扣 (%)</option>
                    <option value="fixed">固定金額折扣 (NT$)</option>
                    <option value="price">指定價</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣值 * {batchForm.type==="percent"?"(%)":batchForm.type==="price"?"成交價 NT$":"(NT$)"}</label>
                  <input className={styles.input} type="number" min="1" value={batchForm.value} onChange={e=>setBatchForm(p=>({...p,value:e.target.value}))} placeholder={batchForm.type==="percent"?"90":"500"}/>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label style={{ wordBreak: "keep-all", lineBreak: "strict" }}>綁定方案（選填）</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={batchForm.plan} onChange={e=>setBatchForm(p=>({...p,plan:e.target.value}))}>
                    <option value="">不限方案</option>
                    <option value="course">鋼琴自學全課程</option>
                    <option value="bundle">學琴全攻略（課程包）</option>
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>產生方式</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={batchForm.mode} onChange={e=>setBatchForm(p=>({...p,mode:e.target.value}))}>
                    <option value="auto">自動產生</option><option value="manual">手動貼上</option>
                  </select>
                </div>
              </div>
              {batchForm.mode==="auto"?(
                <div className={styles.formRow}>
                  <div className={styles.formGroup} style={{flex:1}}><label>前綴（選填）</label><input className={styles.input} value={batchForm.prefix} onChange={e=>setBatchForm(p=>({...p,prefix:e.target.value.toUpperCase()}))} placeholder="例：LIVE"/></div>
                  <div className={styles.formGroup} style={{flex:1}}><label>產生數量 *（上限 500）</label><input className={styles.input} type="number" min="1" max="500" value={batchForm.quantity} onChange={e=>setBatchForm(p=>({...p,quantity:e.target.value}))} placeholder="50"/></div>
                </div>
              ):(
                <div className={styles.formRow}>
                  <div className={styles.formGroup} style={{flex:1}}><label>序號（一行一組）*</label><textarea className={styles.input} rows={5} value={batchForm.codes} onChange={e=>setBatchForm(p=>({...p,codes:e.target.value}))} placeholder={"LIVE-AAAA\nLIVE-BBBB"}/></div>
                </div>
              )}
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}><label>開始日期</label><input className={styles.input} type="date" value={batchForm.start} onChange={e=>setBatchForm(p=>({...p,start:e.target.value}))}/></div>
                <div className={styles.formGroup} style={{flex:1}}><label>結束日期</label><input className={styles.input} type="date" value={batchForm.end} onChange={e=>setBatchForm(p=>({...p,end:e.target.value}))}/></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>活動備註（選填）</label><input className={styles.input} value={batchForm.note} onChange={e=>setBatchForm(p=>({...p,note:e.target.value}))} placeholder="例：現場演奏會發放"/></div>
              </div>
              {batchErr&&<p style={{color:"#dc2626",fontSize:13,margin:0,fontWeight:700}}>{batchErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={()=>setShowBatchCreate(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={batchSaving}>{batchSaving?"建立中…":"建立批次並產生序號"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch delete confirm */}
      {deleteBatch&&(
        <div className={styles.modalOverlay} onClick={()=>setDeleteBatch(null)}>
          <div className={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontSize:17}}>確認刪除批次</h3>
            <p style={{margin:"0 0 20px",color:"#64748b",fontSize:14}}>將刪除「{deleteBatch.name}」及其 {deleteBatch.total} 組序號（已使用 {deleteBatch.used} 組）。已成立訂單不受影響，但未使用的序號將失效，無法復原。</p>
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteBatch(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDeleteBatch} disabled={batchDelBusy}>確認刪除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

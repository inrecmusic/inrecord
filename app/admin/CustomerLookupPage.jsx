"use client";
import { useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { fmt, sourceLabel, equipmentLabel, ageGroupLabel, genderLabel, EMAIL_KIND_LABEL, ComposeEmailModal } from "./shared";

// ── Customer 360 Page ──────────────────────────────────────────────────────
export default function CustomerLookupPage({showToast}){
  const [email,setEmail]=useState("");
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [composeOpen,setComposeOpen]=useState(false);
  async function lookup(e){
    e?.preventDefault();
    const q=email.trim();
    if(!q){return;}
    setLoading(true);setErr("");setData(null);
    try{
      const r=await _api(`/api/admin/customer?email=${encodeURIComponent(q)}`);
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"查詢失敗");
      setData({orders:[],enrollments:[],subscriptions:[],emails:[],...d}); // 陣列欄位保底，回應不完整不整頁崩
    }catch(e2){setErr(e2.message||"查詢失敗");}
    finally{setLoading(false);}
  }
  const paid=data?data.orders.filter(o=>o.status==="paid"):[];
  const revenue=paid.reduce((s,o)=>s+(Number(o.amount)||0),0);
  const cell={padding:"8px 10px",fontSize:13,borderBottom:"1px solid #f1f5f9"};
  const th={padding:"8px 10px",fontSize:12,color:"#94a3b8",textAlign:"left",borderBottom:"1px solid #e2e8f0"};
  return(
    <div>
      <div className={styles.pageHeader}><div><h1>顧客查詢</h1><p>輸入 Email，一次彙整該顧客的訂單、課程開通、遊戲存取與寄信紀錄</p></div></div>
      <form onSubmit={lookup} className={styles.panel} style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,padding:14}}>
        <input className={styles.searchInput} style={{flex:1}} type="email" placeholder="customer@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <button className={styles.btnPrimary} type="submit" disabled={loading}>{loading?"查詢中…":"查詢"}</button>
      </form>
      {err&&<div className={styles.panel} style={{color:"#dc2626",padding:14}}>⚠️ {err}</div>}
      {data&&(
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:14}}>
            <div style={{fontWeight:800,fontSize:15}}>{data.email}</div>
            <button className={styles.btnSmall} onClick={()=>setComposeOpen(true)}>✉️ 寄信給此客人</button>
          </div>
          <div className={styles.statsGrid4}>
            {[["訂單數",data.orders.length,"筆"],["有效收款",`NT$${revenue.toLocaleString()}`,`${paid.length} 筆已付款`],["課程開通",data.enrollments.length,"門"],["遊戲存取",data.subscriptions.filter(s=>s.status==="active").length,"個有效"]].map(([l,v,s])=>(
              <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
            ))}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHead}><h3 style={{margin:0}}>訂單（{data.orders.length}）</h3></div>
            <div className={styles.tableWrap}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={th}>時間</th><th style={th}>方案</th><th style={th}>金額</th><th style={th}>狀態</th><th style={th}>來源</th><th style={th}>開通</th><th style={th}>發票</th></tr></thead>
              <tbody>{!data.orders.length?<tr><td style={cell} colSpan={7}>（無訂單）</td></tr>:data.orders.map(o=>(
                <tr key={o.id}><td style={cell}>{fmt(o.created_at)}</td><td style={cell}>{o.plan_label||o.plan}</td><td style={cell}>NT${(Number(o.amount)||0).toLocaleString()}</td><td style={cell}>{o.status}</td><td style={cell}>{o.source}</td><td style={cell}>{o.access_granted_at?"已開通":"未開通"}</td><td style={cell}>{o.invoice_no||"—"}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHead}><h3 style={{margin:0}}>存取權限</h3></div>
            <div style={{padding:"4px 14px 14px",fontSize:13,color:"#374151",lineHeight:1.9}}>
              <div>課程開通：{data.enrollments.length?data.enrollments.map(e=>e.course_id).join("、"):"（無）"}</div>
              <div>遊戲存取：{data.subscriptions.length?data.subscriptions.map(s=>`${s.plan_type}（${s.status}）`).join("、"):"（無）"}</div>
            </div>
          </div>
          {data.profile&&(
            <div className={styles.panel}>
              <div className={styles.panelHead}><h3 style={{margin:0}}>學員資料</h3></div>
              <div style={{padding:"4px 14px 14px",fontSize:13,color:"#374151",lineHeight:1.9}}>
                <div>姓名：{data.profile.real_name||"—"}　手機：{data.profile.phone||"—"}</div>
                <div>程度：{({none:"沒碰過",little:"摸過一點",some:"有基礎"})[data.profile.level]||"—"}</div>
                <div>目標：{data.profile.goal||"—"}</div>
                <div>來源：{sourceLabel(data.profile.source)}　器材：{equipmentLabel(data.profile.equipment)}</div>
                <div>年齡層：{ageGroupLabel(data.profile.age_group)}　性別：{genderLabel(data.profile.gender)}</div>
                <div>填寫時間：{data.profile.consent_at?fmt(data.profile.consent_at):"—"}</div>
              </div>
            </div>
          )}
          <div className={styles.panel}>
            <div className={styles.panelHead}><h3 style={{margin:0}}>寄信紀錄（最近 {data.emails.length}）</h3></div>
            <div className={styles.tableWrap}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={th}>時間</th><th style={th}>主旨</th><th style={th}>類型</th><th style={th}>狀態</th></tr></thead>
              <tbody>{!data.emails.length?<tr><td style={cell} colSpan={4}>（無寄信紀錄）</td></tr>:data.emails.map((m,i)=>(
                <tr key={i}><td style={cell}>{fmt(m.created_at)}</td><td style={cell}>{m.subject||"—"}</td><td style={cell}>{EMAIL_KIND_LABEL[m.kind]||m.kind||"—"}</td><td style={cell}>{m.status==="sent"?"已寄出":m.status==="failed"?"失敗":"略過"}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
          <ComposeEmailModal open={composeOpen} initialTo={data.email} onClose={()=>setComposeOpen(false)} showToast={showToast}/>
        </>
      )}
    </div>
  );
}

"use client";
import { useState, useCallback, useEffect } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { fmt, EMAIL_KIND_LABEL } from "./shared";

export default function AuditLogPage(){
  const [tab,setTab]=useState("audit");
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [loadErr,setLoadErr]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);setLoadErr("");
    try{
      const r=await _api(tab==="audit"?"/api/admin/audit":"/api/admin/email-log");
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`載入失敗（HTTP ${r.status}）`);
      setRows(d.data||[]);
    }
    catch(e){setRows([]);setLoadErr(e.message||"載入失敗");}
    finally{setLoading(false);}
  },[tab]);
  useEffect(()=>{load();},[load]);
  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>紀錄</h1><p>後台敏感操作稽核（退款／開通／優惠券／銷售設定）與所有對外寄信紀錄</p></div>
        <div className={styles.pageActions}><button className={styles.btnSmall} onClick={load}>重新整理</button></div>
      </div>
      <div className={styles.filterGroup} style={{marginBottom:14}}>
        <button className={`${styles.filterBtn} ${tab==="audit"?styles.filterActive:""}`} onClick={()=>setTab("audit")}>操作紀錄</button>
        <button className={`${styles.filterBtn} ${tab==="email"?styles.filterActive:""}`} onClick={()=>setTab("email")}>寄信紀錄</button>
      </div>
      <div className={styles.panel}>
        <div className={styles.tableWrap}>
          {tab==="audit"?(
          <table className={styles.table}>
            <thead><tr><th>時間</th><th>操作者</th><th>動作</th><th>IP</th><th>對象</th><th>細節</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={6} style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</td></tr>
              :loadErr?<tr><td colSpan={6} style={{textAlign:"center",padding:28,color:"#dc2626"}}>⚠️ {loadErr}　<button className={styles.btnSmall} onClick={load}>重試</button></td></tr>
              :!rows.length?<tr><td colSpan={6} className={styles.empty}><span className={styles.emptyIcon}>📋</span><span className={styles.emptyTitle}>尚無操作紀錄</span><span className={styles.emptySub}>敏感操作後會在此留痕</span></td></tr>
              :rows.map(r=>(
                <tr key={r.id}>
                  <td className={styles.dim} style={{whiteSpace:"nowrap",fontSize:12}}>{fmt(r.created_at)}</td>
                  <td style={{fontSize:13}}>{r.actor_email||"—"}</td>
                  <td><code style={{fontSize:11,padding:"2px 6px",borderRadius:4,
                    background:r.action==="admin.login_failed"?"#fee2e2":r.action==="admin.login"?"#dcfce7":"#f1f5f9",
                    color:r.action==="admin.login_failed"?"#991b1b":r.action==="admin.login"?"#166534":"inherit"}}>{r.action}</code></td>
                  <td className={styles.dim} style={{fontSize:11,whiteSpace:"nowrap"}}>{r.ip||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12}}>{r.target_type||""}{r.target_id?`：${r.target_id}`:""}</td>
                  <td className={styles.dim} style={{fontSize:11,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.meta?JSON.stringify(r.meta):""}>{r.meta?JSON.stringify(r.meta):""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          ):(
          <table className={styles.table}>
            <thead><tr><th>時間</th><th>收件人</th><th>主旨</th><th>類型</th><th>狀態</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={6} style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</td></tr>
              :loadErr?<tr><td colSpan={6} style={{textAlign:"center",padding:28,color:"#dc2626"}}>⚠️ {loadErr}　<button className={styles.btnSmall} onClick={load}>重試</button></td></tr>
              :!rows.length?<tr><td colSpan={5} className={styles.empty}><span className={styles.emptyIcon}>✉️</span><span className={styles.emptyTitle}>尚無寄信紀錄</span><span className={styles.emptySub}>每封對外信件會在此留痕</span></td></tr>
              :rows.map(r=>(
                <tr key={r.id}>
                  <td className={styles.dim} style={{whiteSpace:"nowrap",fontSize:12}}>{fmt(r.created_at)}</td>
                  <td style={{fontSize:13}}>{r.to_email||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.subject||""}>{r.subject||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12}}>{EMAIL_KIND_LABEL[r.kind]||r.kind||"—"}</td>
                  <td><span className={styles.pill} style={{background:r.status==="sent"?"#dcfce7":r.status==="failed"?"#fee2e2":"#f1f5f9",color:r.status==="sent"?"#166534":r.status==="failed"?"#991b1b":"#6b7280",fontSize:11}} title={r.error||""}>{r.status==="sent"?"已寄出":r.status==="failed"?"失敗":"略過"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}

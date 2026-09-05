"use client";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import { statusLabel, levelLabel, fmt } from "./shared";
import styles from "./admin.module.css";
import { CheckCircle2, X } from "lucide-react";
import { isEarlyAccess } from "@/lib/early-access";

// ── Students Page ──────────────────────────────────────────────────────────
// 學員學習進度儲存格：完成度 %（完成單元/已發布單元）＋累計實際觀看時數（viewed_seconds，拖拉不計）
export function ProgressCell({ p }) {
  const pct = p.percentage || 0;
  const mins = Math.round((p.viewedSeconds || 0) / 60);
  const timeLabel = mins >= 60 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${mins} 分`;
  return (
    <div style={{minWidth:118}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
        <div style={{flex:1,height:5,background:"#eef2f7",borderRadius:99,overflow:"hidden"}}>
          <div style={{width:`${Math.min(100,pct)}%`,height:"100%",background:pct>=100?"#16a34a":"#2563eb",borderRadius:99}}/>
        </div>
        <span style={{fontSize:12,fontWeight:700,color:"#0f172a",fontVariantNumeric:"tabular-nums"}}>{pct}%</span>
      </div>
      <div style={{fontSize:11,color:"#94a3b8"}}>
        {p.completedCount}/{p.totalVideos} 單元・看了 {timeLabel}
      </div>
    </div>
  );
}

// 學員管理：實際學員（有 enrollment 課程存取的人，含 concert/WordPress 現場購買者）∪ 體驗名單。
// 自帶資料來源 /api/admin/students（合併 enrollments + 已付款 orders + course_preview_leads），
// 不再只讀 course_preview_leads —— 開通課程後現場購買者即可在此出現。
export default function StudentsPage({showToast}){
  const [students,setStudents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [showUnfilledOnly,setShowUnfilledOnly]=useState(false);
  // 預設只列真實付費學員（paid）；取消勾選才看得到測試帳號／體驗名單等未付款者
  const [showPaidOnly,setShowPaidOnly]=useState(true);
  const [detailStudent,setDetailStudent]=useState(null);
  const [busy,setBusy]=useState(false);
  const dlRef=useRef(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const res=await _api("/api/admin/students");
      const d=await res.json();
      if(!res.ok||d.ok===false)throw new Error(d.error||"fetch_failed");
      setStudents(d.data||[]);
    }catch{setStudents([]);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);

  // 標記狀態只對「體驗名單」列（isLead）有效——真正學員無 course_preview_leads 列可 PATCH。
  async function mark(row,status){
    if(busy||!row?.isLead)return;
    setBusy(true);
    try{
      const res=await _api("/api/admin/leads",{method:"PATCH",body:JSON.stringify({id:row.id,status})});
      if(res.ok){showToast?.("✅ 已更新狀態");await load();}
      else{const d=await res.json().catch(()=>({}));showToast?.("❌ 更新失敗："+(d.error||"unknown"));}
    }catch(e){showToast?.("❌ 更新失敗："+e.message);}
    finally{setBusy(false);}
  }

  function exportCsv(){
    if(!dlRef.current)return;
    const head=["Email","電話","方案","來源","狀態","已購課","建立時間"];
    const rows=[head,...filtered.map(s=>[s.email,s.phone||"",s.plan_label||"",s.source||"",statusLabel(s.status),s.purchased?"是":"否",s.created_at||""])];
    const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    dlRef.current.href=url;dlRef.current.download="inrecord_students.csv";dlRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);showToast?.("✅ 已匯出 CSV");
  }

  const now=new Date();
  const thisMonth=students.filter(s=>{const d=new Date(s.created_at||0);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  const purchased=students.filter(s=>s.paid);

  const display=useMemo(()=>students.map(s=>({...s,name:(s.email?.split("@")[0])||"—",purchasedCount:s.purchased?1:0})),[students]);
  const filtered=display.filter(s=>!search||s.email?.toLowerCase().includes(search.toLowerCase())||s.name?.toLowerCase().includes(search.toLowerCase())).filter(s=>!showUnfilledOnly||!s.hasProfile).filter(s=>!showPaidOnly||s.paid);

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>學員管理</h1><p>共 {students.length} 位學員</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={load}>重新整理</button>
          <button className={styles.btnSmall} onClick={exportCsv}>匯出 CSV</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        {[["總學員",students.length,"位"],["本月新增",thisMonth.length,"位"],["已購課",purchased.length,"位"],["未購課",students.length-purchased.length,"位"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <input className={styles.searchInput} placeholder="搜尋學員姓名、Email…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,whiteSpace:"nowrap"}}>
            <input type="checkbox" checked={showUnfilledOnly} onChange={e=>setShowUnfilledOnly(e.target.checked)}/> 只看未填資料</label>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,whiteSpace:"nowrap"}}>
            <input type="checkbox" checked={showPaidOnly} onChange={e=>setShowPaidOnly(e.target.checked)}/> 只看已付款</label>
          <span className={styles.dim}>共 {filtered.length} 位</span>
        </div>
        {loading?<p style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</p>:(
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th></th><th>姓名</th><th>Email</th><th>電話</th><th>已購課程數</th><th>狀態</th><th>程度</th><th>學習進度</th><th>已填</th><th>建立時間</th><th>操作</th></tr></thead>
              <tbody>
                {!filtered.length?<tr><td colSpan={11} className={styles.empty}><span className={styles.emptyIcon}>👥</span><span className={styles.emptyTitle}>還沒有任何學員</span><span className={styles.emptySub}>尚無名單資料</span></td></tr>
                :filtered.map(s=>(
                  <tr key={s.id}>
                    <td><div className={styles.studentAvatar}>{s.name[0]?.toUpperCase()}</div></td>
                    <td><strong>{s.name}</strong></td>
                    <td className={styles.dim}>{s.email}</td>
                    <td className={styles.dim}>{s.phone||"—"}</td>
                    <td><span className={styles.courseBadge}>{s.purchasedCount}</span></td>
                    <td><span className={`${styles.pill} ${styles[s.status]||styles.requested}`}>{statusLabel(s.status)}</span></td>
                    <td className={styles.dim}>{levelLabel(s.level)}</td>
                    <td>{s.purchased&&s.progress?<ProgressCell p={s.progress}/>:<span className={styles.dim}>—</span>}</td>
                    <td className={styles.dim}>{s.hasProfile?"✓":"—"}</td>
                    <td className={styles.dim}>{fmt(s.created_at)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className={styles.btnSmall} onClick={()=>setDetailStudent(s)}>詳情</button>
                        {s.isLead&&!s.purchased&&<>
                          <button className={styles.btnSmall} disabled={busy} onClick={()=>mark(s,"demo_opened")}>Demo ✓</button>
                          <button className={`${styles.btnSmall} ${styles.green}`} disabled={busy} onClick={()=>mark(s,"purchased")}><CheckCircle2 size={12}/> 購買 ✓</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <a ref={dlRef} style={{display:"none"}} aria-hidden/>
      {detailStudent&&(
        <div className={styles.modalOverlay} onClick={()=>setDetailStudent(null)}>
          <div className={styles.modalCard} style={{width:"min(480px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0}}>學員詳情</h3>
              <button className={styles.iconBtn} onClick={()=>setDetailStudent(null)}><X size={18}/></button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14,paddingBottom:16,marginBottom:16,borderBottom:"1px solid #f1f5f9"}}>
              <div className={styles.studentAvatar} style={{width:52,height:52,fontSize:20,flexShrink:0}}>{detailStudent.name?.[0]?.toUpperCase()}</div>
              <div>
                <div style={{fontWeight:900,fontSize:18,marginBottom:2}}>{detailStudent.name}</div>
                <div style={{color:"#64748b",fontSize:13}}>{detailStudent.email}</div>
              </div>
            </div>
            <div style={{display:"grid",gap:10,marginBottom:20}}>
              {[
                ["狀態",<span key="s" className={`${styles.pill} ${styles[detailStudent.status]||styles.requested}`}>{statusLabel(detailStudent.status)}</span>],
                ["電話",detailStudent.phone||"—"],
                ["已購課程",detailStudent.purchased?(detailStudent.plan_label||"從零開始學鋼琴"):"—"],
                ["開通狀態",detailStudent.purchased?(detailStudent.enrolled?"已開通":"未開通（待開課）"):"—"],
                ["學習進度",detailStudent.purchased&&detailStudent.progress
                  ?`${detailStudent.progress.percentage}%（${detailStudent.progress.completedCount}/${detailStudent.progress.totalVideos} 單元）・累計觀看 ${Math.round((detailStudent.progress.viewedSeconds||0)/60)} 分鐘${detailStudent.progress.lastWatchedAt?`・最後觀看 ${new Date(detailStudent.progress.lastWatchedAt).toLocaleString("zh-TW")}`:""}`
                  :"—"],
                ["觀看權限",(()=>{
                  if(!detailStudent.enrolled)return "—（未開通）";
                  const o=detailStudent.early_override;
                  if(o==="early")return "早鳥搶先看（手動指定）";
                  if(o==="standard")return "9/30 正式上架後開放（手動指定）";
                  const auto=isEarlyAccess({orderTimes:[detailStudent.first_paid_at].filter(Boolean),enrollTimes:[detailStudent.enrolled_at].filter(Boolean)});
                  return auto?"早鳥搶先看（自動：9/2 前購課）":"9/30 正式上架後開放（自動：9/2 起購課）";
                })()],
                ["程度",levelLabel(detailStudent.level)],
                ["來源",detailStudent.source||"—"],
                ["建立時間",fmt(detailStudent.created_at)],
              ].map(([label,val])=>(
                <div key={label} style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:8,fontSize:14,borderBottom:"1px solid #f8fafc",paddingBottom:10}}>
                  <span style={{color:"#64748b",fontWeight:700}}>{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
            {detailStudent.enrolled&&(
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14,padding:"10px 12px",background:"#f8fafc",borderRadius:10}}>
                <span style={{fontSize:12.5,fontWeight:700,color:"#475569"}}>調整觀看權限</span>
                {[["early","設為早鳥"],["standard","設為 9/30 開放"],[null,"恢復自動判斷"]].map(([ov,label])=>(
                  <button key={label} className={styles.btnSmall} disabled={busy||detailStudent.early_override===ov}
                    onClick={async()=>{
                      setBusy(true);
                      try{
                        const r=await _api("/api/admin/early-access",{method:"PATCH",body:JSON.stringify({email:detailStudent.email,override:ov})});
                        if(r.ok){showToast?.("✅ 已更新觀看權限");setDetailStudent(null);await load();}
                        else{const d=await r.json().catch(()=>({}));showToast?.("❌ 更新失敗："+(d.error||"unknown"));}
                      }catch(e){showToast?.("❌ 更新失敗："+e.message);}
                      finally{setBusy(false);}
                    }}>{label}</button>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className={styles.btnSmall} onClick={()=>setDetailStudent(null)}>關閉</button>
              {detailStudent.isLead&&!detailStudent.purchased&&<>
                <button className={styles.btnSmall} disabled={busy} onClick={()=>{mark(detailStudent,"demo_opened");setDetailStudent(null);}}>標記 Demo ✓</button>
                <button className={`${styles.btnSmall} ${styles.green}`} disabled={busy} onClick={()=>{mark(detailStudent,"purchased");setDetailStudent(null);}}>標記已購買 ✓</button>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

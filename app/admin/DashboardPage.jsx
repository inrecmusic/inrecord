"use client";
import { fmt, StatCard, SalesTrendChart, DonutChart, OrderStatusPill } from "./shared";
import { useEffect, useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { DollarSign, ShoppingCart, TrendingUp, Users, GraduationCap, Eye } from "lucide-react";
import { excludeManual } from "@/lib/order-stats";

// 試看領取：平常只在統計卡顯示一個數字，點卡片才展開趨勢圖。
// 圖表很佔版面、但不是每天都要看細節，所以預設收起——儀表板的第一屏要留給營收與訂單。
function useTrialStats(days){
  const [d,setD]=useState(null);
  const [state,setState]=useState("loading");
  useEffect(()=>{
    let off=false; setState("loading");
    _api("/api/admin/trial-stats?days="+days)
      .then(r=>r.json())
      .then(j=>{ if(off)return; if(j.ok){setD(j);setState("ok");} else setState("error"); })
      .catch(()=>{ if(!off)setState("error"); });
    return()=>{off=true;};
  },[days]);
  return { d, state };
}

function TrialTrendPanel({days,setDays,d,state,onClose}){
  const series=d?.series||[];
  // 超過 30 天改成週彙總：90 根細線大部分是 0 又全擠在右邊，看不出東西
  const bars=(()=>{
    if(days<=30)return series.map(x=>({key:x.day,label:x.day.slice(5).replace("-","/"),people:x.people,span:"日"}));
    const out=[];
    for(let i=series.length;i>0;i-=7){
      const g=series.slice(Math.max(0,i-7),i);
      out.unshift({key:g[0].day,label:g[0].day.slice(5).replace("-","/"),people:g.reduce((s,x)=>s+x.people,0),span:"週"});
    }
    return out;
  })();
  const max=Math.max(1,...bars.map(x=>x.people));
  return (
    <div className={styles.panel} style={{marginBottom:16,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:10}}>
        <h2 style={{margin:0,fontSize:15}}>試看領取趨勢</h2>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {[7,30,90].map(n=>(
            <button key={n} className={`${styles.filterBtn} ${days===n?styles.filterActive:""}`} onClick={()=>setDays(n)}>{n} 天</button>
          ))}
          <button className={styles.btnSmall} onClick={onClose}>收合</button>
        </div>
      </div>
      {state==="loading"&&<span className={styles.dim}>載入中…</span>}
      {state==="error"&&<span className={styles.dim}>讀取失敗，請重新整理。</span>}
      {state==="ok"&&(
        <>
          <div style={{display:"flex",alignItems:"flex-end",gap:bars.length>40?1:3,height:64}}>
            {bars.map(x=>(
              <div key={x.key} title={x.label+" 起這一"+x.span+"："+x.people+" 人"}
                style={{flex:1,minWidth:0,height:"100%",display:"flex",alignItems:"flex-end"}}>
                <div style={{width:"100%",height:Math.max(x.people?8:2,Math.round(x.people/max*100))+"%",
                  background:x.people?"#2563eb":"#eef2f7",borderRadius:"2px 2px 0 0"}}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#b6bfcc",marginTop:4}}>
            <span>{bars[0]?.label}</span>
            <span>{days>30?"每根＝一週":"每根＝一天"}</span>
            <span>{bars.at(-1)?.label}</span>
          </div>
          <div style={{display:"flex",gap:22,marginTop:12,fontSize:13,color:"#475569",flexWrap:"wrap"}}>
            <span>今天 <strong style={{color:"#0f172a"}}>{series.at(-1)?.people??0}</strong></span>
            <span>昨天 <strong style={{color:"#0f172a"}}>{series.at(-2)?.people??0}</strong></span>
            <span>{days} 天內 <strong style={{color:"#0f172a"}}>{d.totals.people}</strong> 人 / {d.totals.sent} 封</span>
            {d.totals.failed>0&&<span style={{color:"#b45309",fontWeight:700}}>寄送失敗 {d.totals.failed} 封</span>}
          </div>
          <p style={{fontSize:12,color:"#94a3b8",margin:"8px 0 0"}}>
            一封試看信＝一次領取。同一個信箱重複領取只算一人。
          </p>
        </>
      )}
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────
export default function DashboardPage({leads,leadsTotal=null,leadCount=null,orders=[],trendFilter,donutFilter,setTrendFilter,setDonutFilter,onViewOrders}){
  const now=new Date();
  const [trialOpen,setTrialOpen]=useState(false);
  const [trialDays,setTrialDays]=useState(30);
  const trial=useTrialStats(trialDays);
  // 學員數＝實際付過錢的人（同一人多筆訂單只算一次；$0 手動開通單不算，與訂單頁／銷售分析同口徑）。
  // 舊版這兩張卡讀 course_preview_leads，但 2026-09 起留 Email 只進 Brevo、那張表已無人寫入 → 永遠 0。
  const fmtTWD=n=>n>=10000?`$${(n/10000).toFixed(1)}萬`:`$${n.toLocaleString()}`;

  const sameMonth=v=>{const d=new Date(v||0);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();};
  const paidOrders=orders.filter(o=>o.status==="paid");
  const buyerCount=new Set(excludeManual(paidOrders).map(o=>(o.email||"").trim().toLowerCase()).filter(Boolean)).size;
  const paidM=paidOrders.filter(o=>sameMonth(o.created_at||o.updated_at));
  const totalRev=paidOrders.reduce((s,o)=>s+(Number(o.amount)||0),0);
  const monthRev=paidM.reduce((s,o)=>s+(Number(o.amount)||0),0);

  const recentOrders=paidOrders.slice(0,5).map(o=>({
    id:o.id,student:o.buyer_name||o.email?.split("@")[0]||"學員",email:o.email,
    amount:Number(o.amount)||0,status:o.status||"paid",time:fmt(o.created_at||o.updated_at),
  }));
  const FUNNEL=[
    {stage:"瀏覽課程頁",count:0,color:"#2563eb"},
    {stage:"查看銷售頁",count:0, color:"#7c3aed"},
    {stage:"點擊購買",  count:0, color:"#f59e0b"},
    {stage:"完成付款",  count:paidOrders.length,  color:"#16a34a"},
  ];
  // 上層漏斗需接行為分析(目前無)，故為 0；防呆避免除以 0 出現 NaN/Infinity，
  // 無基準時百分比顯示「—」、長條改以最大值為基準（避免完成付款長條空白）。
  const funnelBase=FUNNEL[0].count;
  const funnelDenom=funnelBase>0?funnelBase:Math.max(...FUNNEL.map(f=>f.count),1);

  return(
    <div className={styles.dashContent}>
      <div className={styles.welcomeHead}><h1>歡迎回來，管理員</h1><p>這是您的課程平台營運概況</p></div>
      <div className={styles.statsGrid}>
        <StatCard label="本月營收" value={fmtTWD(monthRev)} sub="本月累計營收" icon={DollarSign} color="#f59e0b"/>
        <StatCard label="本月訂單" value={excludeManual(paidM).length} sub="本月已完成訂單數（不含手動開通）" icon={ShoppingCart} color="#2563eb"/>
        <StatCard label="總營收"   value={fmtTWD(totalRev)} sub="累計至今" icon={TrendingUp} color="#16a34a"/>
        <StatCard label="付費學員" value={buyerCount} sub="已付款人數（不含手動開通）" icon={GraduationCap} color="#7c3aed"/>
        <StatCard label="潛客名單" value={leadCount??"—"} sub="留 Email 換試看（Brevo 名單）" icon={Users} color="#0891b2"/>
        <div role="button" tabIndex={0} onClick={()=>setTrialOpen(v=>!v)}
          onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setTrialOpen(v=>!v);}}}
          style={{cursor:"pointer"}} aria-expanded={trialOpen} aria-label="試看領取，點擊展開趨勢">
          <StatCard label="試看領取" value={trial.d?trial.d.last7:"—"}
            sub={trialOpen?"近 7 天・點此收合":"近 7 天・點此看趨勢"}
            growth={trial.d?.changePct!=null?(trial.d.changePct>=0?"+":"")+trial.d.changePct+"%":undefined}
            icon={Eye} color="#0d9488"/>
        </div>
      </div>
      {trialOpen&&<TrialTrendPanel days={trialDays} setDays={setTrialDays} d={trial.d} state={trial.state} onClose={()=>setTrialOpen(false)}/>}

      <div className={styles.chartsRow}>
        <SalesTrendChart orders={orders} filter={trendFilter} onFilter={setTrendFilter}/>
        <DonutChart orders={orders} filter={donutFilter} onFilter={setDonutFilter}/>
      </div>
      <div className={styles.chartsRow} style={{alignItems:"stretch"}}>
        {/* 轉換漏斗 */}
        <div className={styles.panel} style={{flex:"1 1 0"}}>
          <div className={styles.panelHead}><h2>轉換漏斗</h2><span className={styles.dim}>整體轉換率 {FUNNEL[0].count?Math.round(FUNNEL[3].count/FUNNEL[0].count*100)+"%":"—"}</span></div>
          <div style={{display:"grid",gap:10}}>
            {FUNNEL.map((f,i)=>{
              const barPct=Math.round(f.count/funnelDenom*100);
              const rate=funnelBase>0?Math.round(f.count/funnelBase*100)+"%":"—";
              const prev=FUNNEL[i-1]?.count||0;
              const conv=prev>0?Math.round(f.count/prev*100)+"%":"—";
              return(
                <div key={f.stage}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span style={{fontWeight:700,color:"#374151"}}>{f.stage}</span>
                    <span style={{color:"#64748b"}}>{f.count.toLocaleString()} 人 · {rate}{i>0&&<span style={{color:"#94a3b8",fontSize:12}}> (轉 {conv})</span>}</span>
                  </div>
                  <div style={{height:8,background:"#f1f5f9",borderRadius:999,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${barPct}%`,background:f.color,borderRadius:999,transition:".4s"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* 最新訂單 */}
        <div className={styles.panel} style={{flex:"1 1 0"}}>
          <div className={styles.panelHead}><h2>最新訂單</h2><button className={styles.btnSmall} onClick={onViewOrders}>查看全部</button></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>學員</th><th>金額</th><th>狀態</th><th>時間</th></tr></thead>
              <tbody>
                {recentOrders.length===0?<tr><td colSpan={4} className={styles.empty} style={{fontSize:13}}>尚無訂單</td></tr>:recentOrders.map(o=>(
                  <tr key={o.id}>
                    <td><div style={{fontWeight:700,fontSize:13}}>{o.student}</div><div style={{fontSize:12,color:"#94a3b8"}}>{o.email}</div></td>
                    <td style={{fontWeight:800}}>NT$ {o.amount.toLocaleString()}</td>
                    <td><OrderStatusPill status={o.status}/></td>
                    <td className={styles.dim} style={{fontSize:12,whiteSpace:"nowrap"}}>{o.time.split(" ")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

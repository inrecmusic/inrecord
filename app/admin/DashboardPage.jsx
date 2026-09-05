"use client";
import { fmt, StatCard, SalesTrendChart, DonutChart, OrderStatusPill } from "./shared";
import styles from "./admin.module.css";
import { DollarSign, ShoppingCart, TrendingUp, Users, GraduationCap, BookOpen } from "lucide-react";
import { excludeManual } from "@/lib/order-stats";

// ── Dashboard Page ─────────────────────────────────────────────────────────
export default function DashboardPage({leads,orders=[],trendFilter,donutFilter,setTrendFilter,setDonutFilter,onViewOrders}){
  const now=new Date();
  const demoOpened=leads.filter(l=>l.demo_opened||["demo_opened","purchased"].includes(l.status));
  const fmtTWD=n=>n>=10000?`$${(n/10000).toFixed(1)}萬`:`$${n.toLocaleString()}`;

  const sameMonth=v=>{const d=new Date(v||0);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();};
  const paidOrders=orders.filter(o=>o.status==="paid");
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
        <StatCard label="總學員數" value={leads.length} sub="已留存 Email" icon={Users} color="#7c3aed"/>
        <StatCard label="Demo 開啟率" value={leads.length?Math.round(demoOpened.length/leads.length*100)+"%":"—"} sub={`Demo 開啟 ${demoOpened.length} 人`} icon={GraduationCap} color="#0891b2"/>
        <StatCard label="課程數量" value="1" sub="已建立課程" icon={BookOpen} color="#dc2626"/>
      </div>
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

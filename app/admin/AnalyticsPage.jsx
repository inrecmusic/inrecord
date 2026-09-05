"use client";
import styles from "./admin.module.css";
import { StatCard, SalesTrendChart, DonutChart } from "./shared";
import { DollarSign, TrendingUp, ShoppingCart, BarChart2, Music } from "lucide-react";
import SourceAttributionTable from "@/components/admin/SourceAttributionTable";

// ── Analytics Page ─────────────────────────────────────────────────────────
export default function AnalyticsPage({orders=[],trendFilter,donutFilter,setTrendFilter,setDonutFilter}){
  const now=new Date();
  const paidOrders=orders.filter(o=>o.status==="paid");
  const purchased=paidOrders.length;
  const totalRev=paidOrders.reduce((s,o)=>s+(Number(o.amount)||0),0);
  const avgOrder=purchased>0?Math.round(totalRev/purchased):0;
  const monthRev=paidOrders.filter(o=>{const d=new Date(o.created_at||o.updated_at||0);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();}).reduce((s,o)=>s+(Number(o.amount)||0),0);

  const RANKING=[
    {rank:1,title:"從零開始學鋼琴",orders:purchased,revenue:totalRev,color:"#f59e0b"},
  ];
  const FUNNEL=[{stage:"瀏覽課程頁",count:0},{stage:"查看銷售頁",count:0},{stage:"點擊購買",count:0},{stage:"完成付款",count:purchased}];
  const funnelBase=FUNNEL[0].count;
  const funnelDenom=funnelBase>0?funnelBase:Math.max(...FUNNEL.map(f=>f.count),1);

  return(
    <div>
      <div className={styles.pageHeader}><div><h1>銷售分析</h1><p>深入了解您的課程銷售數據</p></div></div>
      <div className={styles.statsGrid4}>
        <StatCard label="總營收" value={`NT$ ${totalRev.toLocaleString()}`} sub="累計" icon={DollarSign} color="#16a34a"/>
        <StatCard label="本月營收" value={`NT$ ${monthRev.toLocaleString()}`} sub="本月已付款" icon={TrendingUp} color="#2563eb"/>
        <StatCard label="總訂單數" value={purchased} sub="筆" icon={ShoppingCart} color="#7c3aed"/>
        <StatCard label="平均客單價" value={`NT$ ${avgOrder.toLocaleString()}`} sub="已付款訂單" icon={BarChart2} color="#f59e0b"/>
      </div>
      <div className={styles.chartsRow}>
        <SalesTrendChart orders={orders} filter={trendFilter} onFilter={setTrendFilter}/>
        <DonutChart orders={orders} filter={donutFilter} onFilter={setDonutFilter}/>
      </div>
      <div className={styles.chartsRow} style={{alignItems:"stretch"}}>
        {/* Top courses */}
        <div className={styles.panel} style={{flex:"1 1 0"}}>
          <div className={styles.panelHead}><h2>熱門課程排行</h2></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>排名</th><th>課程</th><th>訂單數</th><th>營收</th><th>操作</th></tr></thead>
              <tbody>
                {RANKING.map((r,i)=>(
                  <tr key={r.rank}>
                    <td><span className={styles.rankBadge} style={{background:i===0?"#fef3c7":i===1?"#f1f5f9":"#fff7ed",color:i===0?"#92400e":i===1?"#475569":"#c2410c"}}>#{r.rank}</span></td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div className={styles.courseCoverThumb} style={{width:36,height:36,flexShrink:0}}><Music size={16} color="#f59e0b"/></div>
                        <span style={{fontWeight:700,fontSize:13}}>{r.title}</span>
                      </div>
                    </td>
                    <td style={{fontWeight:800}}>{r.orders} 筆</td>
                    <td style={{fontWeight:800}}>NT$ {r.revenue.toLocaleString()}</td>
                    <td><a href="/" target="_blank" className={styles.btnSmall}>查看課程</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Funnel */}
        <div className={styles.panel} style={{flex:"1 1 0"}}>
          <div className={styles.panelHead}><h2>轉換漏斗</h2><span className={styles.dim}>整體轉換率 {FUNNEL[0].count?Math.round(FUNNEL[3].count/FUNNEL[0].count*100)+"%":"—"}</span></div>
          <div style={{display:"grid",gap:12}}>
            {FUNNEL.map((f,i)=>{
              const barPct=Math.round(f.count/funnelDenom*100);
              const rate=funnelBase>0?Math.round(f.count/funnelBase*100)+"%":"—";
              const colors=["#2563eb","#7c3aed","#f59e0b","#16a34a"];
              return(
                <div key={f.stage}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                    <span style={{fontWeight:700}}>{f.stage}</span>
                    <span style={{color:"#64748b"}}>{f.count.toLocaleString()} 人 · {rate}</span>
                  </div>
                  <div style={{height:10,background:"#f1f5f9",borderRadius:999,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${barPct}%`,background:colors[i],borderRadius:999}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <SourceAttributionTable orders={paidOrders} />
    </div>
  );
}

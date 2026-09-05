"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import Logo from "@/components/Logo";
import styles from "./admin.module.css";
import { DEFAULT_TERMS_MD, DEFAULT_PRIVACY_MD } from "@/lib/legal-docs";
import {
  LayoutDashboard, BookOpen, MessageCircle, Image as Img,
  Users, ShoppingCart, Ticket, TrendingUp, Settings, Shield, FileText,
  DollarSign, LogOut, ExternalLink,
  ArrowUpRight, Tag, CreditCard, GraduationCap, Music,
  CheckCircle2, BarChart2, Play, Video, X,
  Filter, Percent, List, ClipboardList, Star, MessageSquare, Gamepad2,
  AlertTriangle, CalendarClock, Mail, Search, Megaphone, ListChecks, Activity, BarChart3, History
} from "lucide-react";
import ChaptersUnitsPage from "./ChaptersUnitsPage";
import AssignmentsPage from "./AssignmentsPage";
import UnitCommentsPage from "./UnitCommentsPage";
import CourseRatingsPage from "./CourseRatingsPage";
import GamesManagePage from "./GamesManagePage";
import QuizzesPage from "./QuizzesPage";
import SaleSettingsPage from "./SaleSettingsPage";
import TrackingSettingsPage from "./TrackingSettingsPage";
import AdsPerformancePage from "./AdsPerformancePage";
import AnnouncementsPage from "./AnnouncementsPage";
import ChangelogPage from "./ChangelogPage";
import { excludeManual, paidOrderCount } from "@/lib/order-stats";
import { adminFetch as _api, ADMIN_TOKEN_KEY, setAdminUnauthorizedHandler } from "@/lib/admin-client";
import SourceAttributionTable from "@/components/admin/SourceAttributionTable";
import { PLAN_CATALOG } from "@/lib/plans";
import { LEAD_SOURCES } from "@/lib/admin-leads";
import { countPaidBuyers } from "@/lib/admin-students";
import { inDateRange } from "@/lib/date-range";
import { summarizeOrders } from "@/lib/reconciliation";
import { buildSalesTrend, buildPayDistribution } from "@/lib/dashboard";
import { isEarlyAccess } from "@/lib/early-access";
import CouponsPage from "./CouponsPage";
import SubscriptionsPage from "./SubscriptionsPage";
import OrdersPage from "./OrdersPage";
import { fmt, StatCard, OrderStatusPill, levelLabel, genderLabel, ComposeEmailModal } from "./shared";

const NAV_GROUPS = [
  { title:"主選單", items:[
    { id:"dashboard",   label:"儀表板",     icon:LayoutDashboard },
    { id:"courses",     label:"課程管理",   icon:BookOpen, badgeKey:"courses" },
    { id:"messages",    label:"留言管理",   icon:MessageCircle, badgeKey:"messages" },
    { id:"media",       label:"媒體中心",   icon:Img },
  ]},
  { title:"學員服務", items:[
    { id:"students",      label:"學員管理",   icon:Users,        badgeKey:"leads" },
    { id:"orders",        label:"訂單管理",   icon:ShoppingCart, badgeKey:"orders" },
    { id:"customer",      label:"顧客查詢",   icon:Search },
    { id:"subscriptions", label:"遊戲存取",   icon:CreditCard },
    { id:"coupons",       label:"優惠券",     icon:Ticket },
    { id:"analytics",     label:"銷售分析",   icon:TrendingUp },
    { id:"ads",           label:"廣告成效",   icon:BarChart3 },
  ]},
  { title:"設定", items:[
    { id:"sale",        label:"銷售設定",   icon:CalendarClock },
    { id:"tracking",   label:"追蹤碼",   icon: Activity },
    { id:"audit",       label:"操作紀錄",   icon:ClipboardList },
    { id:"integration", label:"系統設定",   icon:Settings },
    { id:"privacy",     label:"隱私權政策", icon:Shield },
    { id:"terms",       label:"服務條款",   icon:FileText },
    { id:"newsletter",  label:"電子報",     icon:Mail },
    { id:"announcements", label:"公告",    icon:Megaphone },
    { id:"changelog",   label:"更新記錄",  icon:History },
  ]},
];

// ── Chart helpers ──────────────────────────────────────────────────────────
// 銷售趨勢分桶改用 lib/dashboard.js 的 buildSalesTrend（真實訂單，可測）。
function smoothPath(pts) {
  if (!pts.length) return "";
  let d=`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i=1;i<pts.length;i++){const p=pts[i-1],c=pts[i],cx=((p.x+c.x)/2).toFixed(1); d+=` C ${cx} ${p.y.toFixed(1)} ${cx} ${c.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;}
  return d;
}
const CHART_FILTERS = [{key:"day",label:"最近 24 小時"},{key:"week",label:"本週"},{key:"month",label:"月"},{key:"year",label:"年"}];
function FilterBtns({filter,onFilter}){return(<div className={styles.filterGroup}>{CHART_FILTERS.map(f=>(<button key={f.key} className={`${styles.filterBtn} ${filter===f.key?styles.filterActive:""}`} onClick={()=>onFilter(f.key)}>{f.label}</button>))}</div>);}

// ── Charts ─────────────────────────────────────────────────────────────────
function SalesTrendChart({orders=[],filter,onFilter}){
  const data=useMemo(()=>buildSalesTrend(orders,filter,new Date()),[orders,filter]);
  const W=800,H=220,pL=54,pR=44,pT=16,pB=34,cW=W-pL-pR,cH=H-pT-pB;
  const maxRev=Math.max(...data.map(d=>d.revenue),1),maxOrd=Math.max(...data.map(d=>d.orders),1);
  const revCeil=Math.ceil(maxRev/10000)*10000,ordCeil=Math.ceil(maxOrd/3)*3;
  const xStep=data.length>1?cW/(data.length-1):cW;
  const revPts=data.map((d,i)=>({x:pL+i*xStep,y:pT+cH-(d.revenue/revCeil)*cH}));
  const ordPts=data.map((d,i)=>({x:pL+i*xStep,y:pT+cH-(d.orders/ordCeil)*cH}));
  const revTicks=[0,.25,.5,.75,1].map(p=>({y:pT+cH*(1-p),label:p===0?"0":`${((revCeil*p)/10000).toFixed(1)}萬`}));
  const ordTicks=[0,.25,.5,.75,1].map(p=>({y:pT+cH*(1-p),label:Math.round(ordCeil*p)}));
  const showEvery=data.length>20?Math.ceil(data.length/14):1,dotEvery=data.length>14?Math.ceil(data.length/14):1;
  return(
    <div className={styles.chartCard} style={{flex:"1 1 0"}}>
      <div className={styles.chartHead}><div className={styles.chartTitle}><TrendingUp size={15}/><span>銷售趨勢</span></div><FilterBtns filter={filter} onFilter={onFilter}/></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        {revTicks.slice(1).map((t,i)=><line key={i} x1={pL} y1={t.y} x2={W-pR} y2={t.y} stroke="#f1f5f9" strokeWidth="1"/>)}
        {revTicks.map((t,i)=><text key={i} x={pL-6} y={t.y+4} textAnchor="end" fontSize="11" fill="#94a3b8">{t.label}</text>)}
        {ordTicks.map((t,i)=><text key={i} x={W-pR+6} y={t.y+4} textAnchor="start" fontSize="11" fill="#94a3b8">{t.label}</text>)}
        {data.map((d,i)=>i%showEvery===0?<text key={i} x={pL+i*xStep} y={H-6} textAnchor="middle" fontSize="11" fill="#94a3b8">{d.label}</text>:null)}
        <path d={`${smoothPath(revPts)} L ${revPts[revPts.length-1].x.toFixed(1)} ${pT+cH} L ${pL} ${pT+cH} Z`} fill="#f59e0b" fillOpacity="0.07"/>
        <path d={smoothPath(revPts)} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={`${smoothPath(ordPts)} L ${ordPts[ordPts.length-1].x.toFixed(1)} ${pT+cH} L ${pL} ${pT+cH} Z`} fill="#1e293b" fillOpacity="0.04"/>
        <path d={smoothPath(ordPts)} fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {revPts.filter((_,i)=>i%dotEvery===0).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#f59e0b" stroke="#fff" strokeWidth="1.5"/>)}
        {ordPts.filter((_,i)=>i%dotEvery===0).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#1e293b" stroke="#fff" strokeWidth="1.5"/>)}
      </svg>
      <div className={styles.chartLegend}><span><span className={styles.dot} style={{background:"#1e293b"}}/>訂單數</span><span><span className={styles.dot} style={{background:"#f59e0b"}}/>營收</span></div>
    </div>
  );
}

const DONUT_COLORS=["#2563eb","#7c3aed","#f59e0b","#16a34a","#dc2626","#0891b2"];
function DonutChart({orders=[],filter,onFilter}){
  const dist=useMemo(()=>buildPayDistribution(orders,filter,new Date()),[orders,filter]);
  const total=dist.reduce((s,d)=>s+d.count,0);
  const R=58,C=2*Math.PI*R; let acc=0;
  return(
    <div className={styles.chartCard} style={{width:360,flexShrink:0}}>
      <div className={styles.chartHead}><div className={styles.chartTitle}><CreditCard size={15}/><span>付款方式分布</span></div><FilterBtns filter={filter} onFilter={onFilter}/></div>
      {total===0?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:170,color:"#94a3b8",fontSize:13,flexDirection:"column",gap:8}}>
          <CreditCard size={28} color="#e2e8f0"/><span>尚無付款數據</span>
        </div>
      ):(
        <div style={{display:"flex",alignItems:"center",gap:18,padding:"10px 6px"}}>
          <svg width="140" height="140" viewBox="0 0 140 140" style={{flexShrink:0}}>
            <g transform="rotate(-90 70 70)">
              {dist.map((d,i)=>{const frac=d.count/total;const seg=frac*C;const off=-acc*C;acc+=frac;
                return <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={DONUT_COLORS[i%DONUT_COLORS.length]} strokeWidth="18" strokeDasharray={`${seg.toFixed(2)} ${(C-seg).toFixed(2)}`} strokeDashoffset={off.toFixed(2)}/>;})}
            </g>
            <text x="70" y="65" textAnchor="middle" fontSize="12" fill="#94a3b8">總筆數</text>
            <text x="70" y="87" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">{total}</text>
          </svg>
          <div style={{flex:1,display:"grid",gap:9,minWidth:0}}>
            {dist.map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
                <span style={{width:10,height:10,borderRadius:3,background:DONUT_COLORS[i%DONUT_COLORS.length],flexShrink:0}}/>
                <span style={{flex:1,color:"#374151",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.label}</span>
                <span style={{fontWeight:800,color:"#0f172a"}}>{d.count}</span>
                <span style={{color:"#94a3b8",width:36,textAlign:"right"}}>{Math.round(d.count/total*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────
function DashboardPage({leads,orders=[],trendFilter,donutFilter,setTrendFilter,setDonutFilter,onViewOrders}){
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

// ── Courses Page ───────────────────────────────────────────────────────────
function CoursesPage({orders, onManage, showToast}){
  const [search,setSearch]=useState("");
  const [courses,setCourses]=useState([]);
  const [loading,setLoading]=useState(false);
  const [showModal,setShowModal]=useState(false);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({title:"",desc:"",price:"",status:"published"});
  const [formErr,setFormErr]=useState("");

  // 已購人數＝確實付款的人頭數（orders status=paid、email 去重）；
  // 舊版讀名單的人工標記，且 leads 在課程頁根本不會撈 → 永遠顯示 0。
  const purchased=useMemo(()=>countPaidBuyers(orders),[orders]);

  const fetchCourses=useCallback(async()=>{
    setLoading(true);
    try{const r=await _api("/api/admin/courses");const{data}=await r.json();setCourses(data||[]);}
    catch{setCourses([]);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{fetchCourses();},[fetchCourses]);

  const filtered=useMemo(()=>courses.filter(c=>!search||c.title.includes(search)),[courses,search]);
  function openCreate(){setEditing(null);setForm({title:"",desc:"",price:"",status:"published"});setFormErr("");setShowModal(true);}
  function openEdit(c){setEditing(c);setForm({title:c.title,desc:c.description||"",price:String(c.price),status:c.status});setFormErr("");setShowModal(true);}

  async function handleSave(e){
    e.preventDefault();setFormErr("");
    if(!form.title.trim()){setFormErr("請輸入課程標題");return;}
    if(form.price===""||isNaN(form.price)){setFormErr("請輸入有效售價");return;}
    setSaving(true);
    try{
      const body={title:form.title.trim(),description:form.desc.trim()||null,price:Number(form.price),status:form.status};
      if(editing)body.id=editing.id;
      const r=await _api("/api/admin/courses",{method:editing?"PATCH":"POST",body:JSON.stringify(body)});
      if(!r.ok)throw new Error((await r.json()).error||"儲存失敗");
      showToast?.(editing?"✅ 課程已更新":"✅ 課程已新增");
      setShowModal(false);fetchCourses();
    }catch(err){setFormErr(err.message);}
    finally{setSaving(false);}
  }

  async function toggleStatus(c){
    try{const r=await _api("/api/admin/courses",{method:"PATCH",body:JSON.stringify({id:c.id,status:c.status==="published"?"draft":"published"})});if(!r.ok)throw new Error();fetchCourses();}
    catch{showToast?.("❌ 操作失敗");}
  }
  async function removeCourse(c){
    if(!window.confirm(`確定要刪除課程「${c.title}」嗎？此操作無法復原。`))return;
    try{const r=await _api(`/api/admin/courses?id=${c.id}`,{method:"DELETE"});if(!r.ok)throw new Error();showToast?.("✅ 課程已刪除");fetchCourses();}
    catch{showToast?.("❌ 刪除失敗");}
  }

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>課程管理</h1><p>管理您的所有課程內容</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchCourses}>重新整理</button>
          <a href="/" target="_blank" className={styles.btnSmall} style={{display:"flex",alignItems:"center",gap:5}}>前台預覽</a>
          <button className={styles.btnPrimary} onClick={openCreate}>新增課程</button>
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <input className={styles.searchInput} placeholder="搜尋課程…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <span className={styles.dim}>共 {filtered.length} 筆課程</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>封面</th><th>標題</th><th>狀態</th><th>價格</th><th>已購人數</th><th>建立日期</th><th>操作</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={7} className={styles.empty}>載入中…</td></tr>
              :!filtered.length?<tr><td colSpan={7} className={styles.empty}><span className={styles.emptyIcon}>📚</span><span className={styles.emptyTitle}>還沒有任何課程</span><span className={styles.emptySub}>點右上角「新增課程」開始建立</span></td></tr>
              :filtered.map(c=>(
                <tr key={c.id}>
                  <td><div className={styles.courseCoverThumb}><Music size={22} color="#f59e0b"/></div></td>
                  <td>
                    <div style={{fontWeight:800,fontSize:14}}>{c.title}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{c.description||"零基礎・流行鋼琴"}</div>
                  </td>
                  <td><span className={styles.pill} style={{background:c.status==="published"?"#dcfce7":"#f1f5f9",color:c.status==="published"?"#166534":"#475569"}}>{c.status==="published"?"已發佈":"草稿"}</span></td>
                  <td style={{fontWeight:800}}>NT$ {Number(c.price).toLocaleString()}</td>
                  <td>{purchased} 位</td>
                  <td className={styles.dim}>{fmt(c.created_at).split(" ")[0]}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <a href="/" target="_blank" className={styles.btnSmall}>查看</a>
                      <button className={styles.btnSmall} onClick={()=>openEdit(c)}>編輯</button>
                      <button className={styles.btnSmall} onClick={()=>toggleStatus(c)}>{c.status==="published"?"下架":"發佈"}</button>
                      <button className={styles.btnPrimary} style={{padding:"6px 12px",fontSize:12}} onClick={()=>onManage?.(c)}><BookOpen size={12}/> 管理教室</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>removeCourse(c)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal&&(
        <div className={styles.modalOverlay} onClick={()=>setShowModal(false)}>
          <div className={styles.modalCard} style={{width:"min(520px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0,fontSize:18}}>{editing?"編輯課程":"新增課程"}</h3>
              <button className={styles.iconBtn} onClick={()=>setShowModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSave} style={{display:"grid",gap:14}}>
              <div className={styles.formGroup}>
                <label>課程標題 *</label>
                <input className={styles.input} value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="例：零基礎流行鋼琴入門課"/>
              </div>
              <div className={styles.formGroup}>
                <label>課程簡介</label>
                <textarea className={styles.replyTextarea} rows={3} value={form.desc} onChange={e=>setForm(p=>({...p,desc:e.target.value}))} placeholder="簡短描述課程內容…"/>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>售價（TWD）*</label>
                  <input className={styles.input} type="number" min="0" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))} placeholder="3500"/>
                </div>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>狀態</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                    <option value="published">已發佈</option>
                    <option value="draft">草稿</option>
                  </select>
                </div>
              </div>
              {formErr&&<p style={{color:"#dc2626",fontSize:13,margin:0,fontWeight:700}}>{formErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={()=>setShowModal(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving?"儲存中…":editing?"儲存變更":"建立課程"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Messages Page ──────────────────────────────────────────────────────────

const MSG_PER_PAGE = 20;

function MessagesPage({ showToast }){
  const [comments,setComments]=useState([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [videos,setVideos]=useState([]);
  const [chapters,setChapters]=useState([]);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [replyingId,setReplyingId]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [replying,setReplying]=useState(false);
  const [deleteId,setDeleteId]=useState(null);
  const [deleting,setDeleting]=useState(false);

  const fetchComments=useCallback(async()=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({page,per_page:MSG_PER_PAGE});
      if(filter!=="all")params.set("status",filter==="unread"?"pending":filter);
      const r=await _api(`/api/admin/unit-comments?${params}`);
      const {data,total:t}=await r.json();
      setComments(data||[]);
      setTotal(t||0);
    }catch{}
    finally{setLoading(false);}
  },[page,filter]);

  const fetchMeta=useCallback(async()=>{
    try{
      const [rv,rc]=await Promise.all([_api("/api/admin/videos"),_api("/api/admin/chapters")]);
      setVideos((await rv.json()).data||[]);
      setChapters((await rc.json()).data||[]);
    }catch{}
  },[]);

  useEffect(()=>{fetchMeta();},[fetchMeta]);
  useEffect(()=>{fetchComments();},[fetchComments]);

  const filtered=useMemo(()=>{
    if(!search)return comments;
    const q=search.toLowerCase();
    return comments.filter(c=>
      c.content?.toLowerCase().includes(q)||
      c.user_name?.toLowerCase().includes(q)||
      c.user_email?.toLowerCase().includes(q)||
      c.videos?.title?.toLowerCase().includes(q)
    );
  },[comments,search]);

  const pendingCount=useMemo(()=>comments.filter(c=>c.status==="pending").length,[comments]);
  const repliedCount=useMemo(()=>comments.filter(c=>c.status==="replied").length,[comments]);
  const videoName=id=>videos.find(v=>v.id===id)?.title||"—";
  const totalPages=Math.max(1,Math.ceil(total/MSG_PER_PAGE));

  async function submitReply(commentId){
    if(!replyText.trim())return;
    setReplying(true);
    try{
      const r=await _api("/api/admin/comment-replies",{method:"POST",body:JSON.stringify({comment_id:commentId,admin_content:replyText.trim()})});
      if(!r.ok)throw new Error((await r.json()).error);
      showToast("✅ 回覆已送出");
      setReplyingId(null);setReplyText("");fetchComments();
    }catch(e){showToast("❌ "+(e.message||"回覆失敗"));}
    finally{setReplying(false);}
  }

  async function confirmDelete(){
    setDeleting(true);
    try{
      const r=await _api(`/api/admin/unit-comments?id=${deleteId}`,{method:"DELETE"});
      if(!r.ok)throw new Error((await r.json()).error);
      showToast("✅ 留言已刪除");setDeleteId(null);fetchComments();
    }catch(e){showToast("❌ "+(e.message||"刪除失敗"));}
    finally{setDeleting(false);}
  }

  function openReply(c){
    if(replyingId===c.id){setReplyingId(null);return;}
    setReplyingId(c.id);setReplyText("");
  }

  return(
    <div>
      <div className={styles.pageHeader}><div><h1>留言管理</h1><p>共 {total} 則課程單元留言</p></div></div>
      <div className={styles.statsGrid} style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        {[["全部留言",total,"則"],["未回覆",pendingCount,"則待處理"],["已回覆",repliedCount,"則"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:12}}>
          <div className={styles.tabGroup}>
            {[["all","全部"],["unread","未回覆"],["replied","已回覆"]].map(([key,label])=>(
              <button key={key} className={`${styles.tab} ${filter===key?styles.tabActive:""}`} onClick={()=>{setFilter(key);setPage(1);}}>
                {label}{key==="unread"&&pendingCount>0&&<span className={styles.tabBadge}>{pendingCount}</span>}
              </button>
            ))}
          </div>
          <input className={styles.searchInput} placeholder="搜尋留言、學員姓名…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>單元</th><th>留言者</th><th>時間</th><th>內容</th><th>操作</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={5} className={styles.empty}>載入中…</td></tr>
              :!filtered.length?<tr><td colSpan={5} className={styles.empty}><span className={styles.emptyIcon}>💬</span><span className={styles.emptyTitle}>{total===0?"還沒有任何留言":"沒有符合的留言"}</span><span className={styles.emptySub}>學員提問將在這裡顯示</span></td></tr>
              :filtered.map(c=>(
                <Fragment key={c.id}>
                  <tr className={replyingId===c.id?styles.commentRowActive:""}>
                    <td style={{minWidth:140}}><span className={styles.unitTag}>{c.videos?.title||videoName(c.video_id)}</span></td>
                    <td style={{minWidth:160}}>
                      <div className={styles.commenterCell}>
                        <div className={styles.commenterAvatar}>{(c.user_name||c.user_email||"?")[0].toUpperCase()}</div>
                        <div>
                          <div className={styles.commenterName}>{c.user_name||"匿名"}</div>
                          <div className={styles.realIdentity}>{c.user_email}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.dim} style={{whiteSpace:"nowrap",minWidth:120}}>
                      {c.created_at?new Date(c.created_at).toLocaleString("zh-TW",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}
                    </td>
                    <td>
                      <div className={styles.commentContent}>{c.content}</div>
                      {c.comment_replies?.length>0&&<div className={styles.replyPreview}><span className={styles.replyLabel}>已回覆：</span>{c.comment_replies[0].admin_content}</div>}
                    </td>
                    <td style={{minWidth:140}}>
                      <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-start"}}>
                        <span className={`${styles.pill} ${c.status==="replied"?styles.demo_opened:styles.requested}`}>{c.status==="replied"?"已回覆":"未回覆"}</span>
                        <div className={styles.rowActions}>
                          <button className={styles.btnSmall} onClick={()=>openReply(c)}>{replyingId===c.id?"收起":"回覆"}</button>
                          <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteId(c.id)}>刪除</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {replyingId===c.id&&(
                    <tr className={styles.replyRow}>
                      <td colSpan={5}>
                        <div className={styles.replyBox}>
                          <textarea className={styles.replyTextarea} placeholder="輸入回覆內容…" value={replyText} rows={3} onChange={e=>setReplyText(e.target.value)} autoFocus/>
                          <div className={styles.replyActions}>
                            <button className={styles.btnPrimary} onClick={()=>submitReply(c.id)} disabled={replying}>{replying?"送出中…":"送出回覆"}</button>
                            <button className={styles.btnSmall} onClick={()=>setReplyingId(null)}>取消</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages>1&&(
          <div className={styles.pagination}>
            <button className={styles.pageBtn} disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
              <button key={p} className={`${styles.pageBtn} ${p===page?styles.pageBtnActive:""}`} onClick={()=>setPage(p)}>{p}</button>
            ))}
            <button className={styles.pageBtn} disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
          </div>
        )}
      </div>
      {deleteId&&(
        <div className={styles.modalOverlay} onClick={()=>setDeleteId(null)}>
          <div className={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontSize:17}}>確認刪除留言</h3>
            <p style={{margin:"0 0 20px",color:"#64748b",fontSize:14}}>此操作無法復原，確定要刪除這則留言嗎？</p>
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteId(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete} disabled={deleting}>確認刪除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Media Page ─────────────────────────────────────────────────────────────
function MediaPage(){
  const [videos,setVideos]=useState([]);
  const [loading,setLoading]=useState(false);

  const fetchVideos=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await _api("/api/admin/videos");
      const {data}=await r.json();
      setVideos(data||[]);
    }catch{}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchVideos();},[fetchVideos]);

  const published=videos.filter(v=>v.published).length;
  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>媒體中心</h1><p>檢視課程影片單元與串接狀態</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchVideos}>重新整理</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        {[["影片單元",videos.length,"支"],["已發布",published,"支"],["草稿",videos.length-published,"支"],["已串接影片",videos.filter(v=>v.bunny_video_id||v.vimeo_id).length,"支（Bunny/Vimeo）"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}><h2 style={{display:"flex",alignItems:"center",gap:7}}><Video size={16} color="#2563eb"/>影片單元</h2><span className={styles.dim}>共 {videos.length} 支</span></div>
        {loading?<p style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</p>
        :!videos.length?(
          <div className={styles.placeholderCard} style={{padding:"40px 24px"}}>
            <Video size={36} color="#cbd5e1"/>
            <p style={{margin:"12px 0 0",fontSize:14,color:"#94a3b8"}}>尚無影片單元，請先在「課程管理 → 管理教室 → 章節與單元管理」新增單元</p>
          </div>
        ):(
          <div className={styles.mediaGrid}>
          {videos.map(v=>(
            <div key={v.id} className={styles.videoCard}>
              <div className={styles.videoThumb}>
                {v.vimeo_id
                  ?<a href={`https://vimeo.com/${v.vimeo_id}`} target="_blank" rel="noreferrer" style={{position:"absolute",inset:0,display:"grid",placeItems:"center"}}>
                      <div className={styles.videoPlay}><Play size={22} fill="#fff" color="#fff"/></div>
                    </a>
                  :<div className={styles.videoPlay}><Play size={22} fill="#fff" color="#fff"/></div>
                }
                {v.duration&&<span className={styles.videoDuration}>{v.duration}</span>}
              </div>
              <div className={styles.videoInfo}>
                <div className={styles.videoTitle}>{v.title}</div>
                <div className={styles.videoMeta}><span>{v.bunny_video_id?`Bunny ${v.bunny_video_id.slice(0,8)}…`:v.vimeo_id?`Vimeo ${v.vimeo_id}`:"未設定影片"}</span></div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
                  <span className={styles.pill} style={{background:v.published?"#dcfce7":"#f1f5f9",color:v.published?"#166534":"#475569",fontSize:11}}>{v.published?"已發布":"草稿"}</span>
                  <div className={styles.rowActions}>
                    {v.vimeo_id&&<a href={`https://vimeo.com/${v.vimeo_id}`} target="_blank" rel="noreferrer" className={styles.btnSmall} style={{padding:"4px 8px",fontSize:12}}>查看</a>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

// ── Students Page ──────────────────────────────────────────────────────────
// 學員學習進度儲存格：完成度 %（完成單元/已發布單元）＋累計實際觀看時數（viewed_seconds，拖拉不計）
function ProgressCell({ p }) {
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
function StudentsPage({showToast}){
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

// ── Analytics Page ─────────────────────────────────────────────────────────
function AnalyticsPage({orders=[],trendFilter,donutFilter,setTrendFilter,setDonutFilter}){
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

// ── Integration Page ───────────────────────────────────────────────────────
function IntegrationPage({showToast}){
  const [payuniStatus,setPayuniStatus]=useState("unknown");const [payuniMsg,setPayuniMsg]=useState("");

  // ── 分析追蹤設定 ──────────────────────────────────────────────────────────
  const LS_ANALYTICS="inrecord_analytics";
  const ADEF={gaId:"",phKey:"",phHost:"https://us.i.posthog.com",phPersonalKey:"",pixelId:"",capiToken:""};
  const [a,setA]=useState(ADEF);
  const [aSaved,setASaved]=useState(ADEF);
  const aDirty=JSON.stringify(a)!==JSON.stringify(aSaved);
  const af=(k)=>(e)=>setA(p=>({...p,[k]:e.target.value}));
  useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(LS_ANALYTICS)||"null");if(v){setA(v);setASaved(v);}}catch{}},[]);
  function saveAnalytics(){localStorage.setItem(LS_ANALYTICS,JSON.stringify(a));setASaved({...a});showToast("✅ 分析追蹤設定已儲存");}

  async function testPayuni(){if(payuniStatus==="testing")return;setPayuniMsg("測試中…");setPayuniStatus("testing");try{const res=await fetch("/api/payuni/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dryRun:true})});const d=await res.json().catch(()=>({}));if(res.ok&&d.ok){setPayuniStatus("ok");setPayuniMsg("✅ Payuni 設定正常");}else throw new Error(d.error||"config_missing");}catch(e){setPayuniStatus("error");setPayuniMsg("❌ "+(e.message.includes("fetch")?"後端尚未部署":e.message));}}
  const s2={card:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:24,marginBottom:20},h3:{margin:"0 0 4px",fontSize:20},desc:{color:"#64748b",fontSize:14,margin:"0 0 16px"},stepList:{paddingLeft:20,display:"grid",gap:8,fontSize:14,color:"#334155"},codeBlock:{background:"#0f172a",color:"#e2e8f0",borderRadius:12,padding:16,fontFamily:"monospace",fontSize:13,lineHeight:1.8,overflowX:"auto"},envTable:{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:10},th:{background:"#f8fafc",color:"#94a3b8",padding:"10px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontSize:12,textTransform:"uppercase"},td:{padding:"10px 12px",borderBottom:"1px solid #e2e8f0"},code:{background:"#f1f5f9",padding:"2px 6px",borderRadius:5,fontFamily:"monospace",fontSize:12},badge:(s)=>({display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:999,fontSize:13,fontWeight:900,background:s==="ok"?"#dcfce7":s==="error"?"#fee2e2":"#f1f5f9",color:s==="ok"?"#166534":s==="error"?"#991b1b":"#6b7280"}),testRow:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:16}};
  return(
    <div>
      <div className={styles.pageHeader}><div><h1>系統設定</h1><p>管理外部服務整合與環境變數</p></div></div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#0B996E",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:20,flexShrink:0}}>B</div><div style={{flex:1}}><h3 style={s2.h3}>Brevo</h3><div style={{color:"#94a3b8",fontSize:13}}>交易與課程通知信寄送（lib/brevo）</div></div></div>
        <p style={s2.desc}>課程購買成功後，後端透過 Brevo 寄送開課通知信（<code style={s2.code}>lib/brevo</code>），供 notify 開課信與後台補寄信使用。</p>
        <table style={s2.envTable}><thead><tr><th style={s2.th}>環境變數</th><th style={s2.th}>說明</th><th style={s2.th}>範例</th></tr></thead><tbody>{[["BREVO_API_KEY","Brevo API 金鑰","xkeysib-xxx..."],["BREVO_LIST_ID","目標名單 ID","3"],["BREVO_SENDER_EMAIL","已驗證寄件人","hello@你的網域.com"],["BREVO_SENDER_NAME","寄件人名稱","InRecord"],["BREVO_TEMPLATE_ID","（可選）Template ID","5"]].map(([k,d,e])=><tr key={k}><td><code style={s2.code}>{k}</code></td><td style={{color:"#64748b"}}>{d}</td><td style={{color:"#94a3b8"}}><code style={s2.code}>{e}</code></td></tr>)}</tbody></table>
        <ol style={s2.stepList}><li>前往 <strong>app.brevo.com</strong> → Settings → API Keys → 建立新的 API Key</li><li>Contacts → Lists → 建立名單，記下 List ID</li><li>Settings → Senders → 新增並驗證寄件人 Email</li><li><strong>Vercel</strong> → Settings → Environment Variables 填入所有變數後重新部署</li></ol>
      </div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#D4192C",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0}}>PAY</div><div style={{flex:1}}><h3 style={s2.h3}>Payuni 統一金流</h3><div style={{color:"#94a3b8",fontSize:13}}>信用卡、ATM 轉帳、超商繳費 金流結帳</div></div><div style={s2.badge(payuniStatus)}>{payuniStatus==="ok"?"已連線":payuniStatus==="error"?"連線失敗":"未測試"}</div></div>
        <table style={s2.envTable}><thead><tr><th style={s2.th}>環境變數</th><th style={s2.th}>說明</th></tr></thead><tbody>{[["PAYUNI_MERCHANT_ID","特店代號（Payuni 後台取得）"],["PAYUNI_HASH_KEY","HashKey（32 字元）"],["PAYUNI_HASH_IV","HashIV（16 字元）"],["PAYUNI_API_URL","正式：https://api.payuni.com.tw/api/upp"],["NEXT_PUBLIC_SITE_URL","正式網域，用於 ReturnURL / NotifyURL"]].map(([k,d])=><tr key={k}><td><code style={s2.code}>{k}</code></td><td style={{color:"#64748b"}}>{d}</td></tr>)}</tbody></table>
        <ol style={{...s2.stepList,marginTop:14}}><li>前往 <strong>www.payuni.com.tw</strong> → 申請特店帳號</li><li>後台 → 系統設定 → 取得 特店代號、HashKey、HashIV</li><li>測試環境使用 <code style={s2.code}>https://sandbox-api.payuni.com.tw/api/upp</code></li><li>Vercel 填入所有變數後重新部署，測試通過後換成正式 API URL</li></ol>
        <div style={s2.testRow}><button onClick={testPayuni} disabled={payuniStatus==="testing"} style={{border:0,background:"#D4192C",color:"#fff",borderRadius:10,padding:"9px 14px",fontWeight:900,cursor:payuniStatus==="testing"?"default":"pointer",opacity:payuniStatus==="testing"?0.6:1}}>測試 Payuni 連線</button>{payuniMsg&&<span style={{fontSize:13,fontWeight:800,color:payuniStatus==="ok"?"#16a34a":"#dc2626"}}>{payuniMsg}</span>}</div>
      </div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#3ECF8E",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0}}>SB</div><div><h3 style={s2.h3}>Supabase</h3><div style={{color:"#94a3b8",fontSize:13}}>PostgreSQL 資料庫・名單 + 訂單記錄</div></div></div>
        <ol style={s2.stepList}><li>前往 <strong>supabase.com</strong> → New project</li><li>SQL Editor → 貼上 <code style={s2.code}>supabase-schema.sql</code> → Run</li><li>Settings → API → 複製 URL、anon key、service_role key</li><li>填入 <code style={s2.code}>NEXT_PUBLIC_SUPABASE_URL</code>、<code style={s2.code}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>、<code style={s2.code}>SUPABASE_SERVICE_ROLE_KEY</code></li></ol>
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12,padding:14,fontSize:13,color:"#1d4ed8",marginTop:14}}>💡 <strong>沒設定 Supabase 也沒關係</strong>：名單會自動 fallback 到 localStorage。</div>
      </div>
      {/* ── 分析追蹤 ──────────────────────────────────────────────────────── */}
      <div style={s2.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <div>
            <h3 style={{...s2.h3,marginBottom:4}}>分析追蹤</h3>
            <div style={{color:"#94a3b8",fontSize:13}}>串接第三方分析工具，追蹤課程頁瀏覽與購買轉換</div>
          </div>
          {aDirty&&<span style={{fontSize:12,fontWeight:800,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",alignSelf:"flex-start"}}>有未儲存的變更</span>}
        </div>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#92400e",marginBottom:16,lineHeight:1.7}}>⚠️ <strong>尚未實際套用</strong>：此區 ID 目前僅儲存在本機，<strong>網站並未注入任何分析腳本</strong>（GA／PostHog／Pixel 皆未啟用）。要真的開始追蹤需另接腳本注入後才會生效。</div>

        {/* Google Analytics 4 */}
        <div style={{marginBottom:24,paddingBottom:24,borderBottom:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"grid",placeItems:"center",flexShrink:0}}><BarChart2 size={16} color="#fff"/></div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>Google Analytics 4</div><div style={{fontSize:12,color:"#94a3b8"}}>追蹤網站流量、事件與電商轉換</div></div>
          </div>
          <div className={styles.formGroup}>
            <label>Google Analytics ID</label>
            <input className={styles.input} value={a.gaId} onChange={af("gaId")} placeholder="G-XXXXXXXXXX"/>
            <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>GA4 管理介面 → 資料串流 → 評估 ID，格式為 <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>G-</code> 開頭</span>
          </div>
        </div>

        {/* PostHog */}
        <div style={{marginBottom:24,paddingBottom:24,borderBottom:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:9,background:"#1e293b",display:"grid",placeItems:"center",flexShrink:0}}><TrendingUp size={16} color="#fff"/></div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>PostHog 產品分析</div><div style={{fontSize:12,color:"#94a3b8"}}>用戶行為熱圖、Session Replay、轉換漏斗</div></div>
          </div>
          <div style={{display:"grid",gap:12}}>
            <div className={styles.formGroup}>
              <label>Project API Key</label>
              <input className={styles.input} value={a.phKey} onChange={af("phKey")} placeholder="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>PostHog 設定 → Project API Keys，格式 <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>phc_</code> 開頭</span>
            </div>
            <div className={styles.formGroup}>
              <label>PostHog Host</label>
              <input className={styles.input} value={a.phHost} onChange={af("phHost")} placeholder="https://us.i.posthog.com"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>美國區：<code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>us.i.posthog.com</code>　歐洲區：<code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>eu.i.posthog.com</code></span>
            </div>
            <div className={styles.formGroup}>
              <label>Personal API Key <span style={{fontWeight:400,color:"#94a3b8",fontSize:12}}>(選填)</span></label>
              <input className={styles.input} value={a.phPersonalKey} onChange={af("phPersonalKey")} placeholder="phx_xxxxxxxx"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>個人設定 → Personal API Keys，格式 <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>phx_</code> 開頭，可解鎖進階 Dashboard 查詢</span>
            </div>
          </div>
        </div>

        {/* Meta Pixel */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:9,background:"#1877f2",display:"grid",placeItems:"center",flexShrink:0}}><span style={{color:"#fff",fontWeight:900,fontSize:16,lineHeight:1}}>f</span></div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>Meta Pixel / Conversions API</div><div style={{fontSize:12,color:"#94a3b8"}}>追蹤 Facebook / Instagram 廣告購買轉換</div></div>
          </div>
          <div style={{display:"grid",gap:12}}>
            <div className={styles.formGroup}>
              <label>Meta Pixel ID</label>
              <input className={styles.input} value={a.pixelId} onChange={af("pixelId")} placeholder="1234567890123456"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>Events Manager → 資料來源 → 像素 ID，15–16 位數字</span>
            </div>
            <div className={styles.formGroup}>
              <label>Conversions API Access Token <span style={{fontWeight:400,color:"#94a3b8",fontSize:12}}>(選填)</span></label>
              <input className={styles.input} value={a.capiToken} onChange={af("capiToken")} placeholder="EAAxxxxxxxxxxxxxxxx"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>伺服器端事件追蹤，提升廣告歸因準確率；不填仍可使用瀏覽器端 Pixel</span>
            </div>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"flex-end",gap:10,paddingTop:16,borderTop:"1px solid #f1f5f9"}}>
          {aDirty&&<button className={styles.btnSmall} onClick={()=>setA({...aSaved})}>復原變更</button>}
          <button className={styles.btnPrimary} onClick={saveAnalytics}>儲存設定</button>
        </div>
      </div>

      <div style={s2.card}>
        <h3 style={s2.h3}>本機啟動指令</h3>
        <div style={{...s2.codeBlock,marginTop:14}}>
          <div><span style={{color:"#64748b"}}># 安裝依賴</span></div><div>npm install</div>
          <div style={{marginTop:8}}><span style={{color:"#64748b"}}># 複製環境變數範本</span></div><div>cp .env.local.example .env.local</div>
          <div style={{marginTop:8}}><span style={{color:"#64748b"}}># 啟動開發伺服器</span></div><div>npm run dev</div>
          <div style={{marginTop:8}}><span style={{color:"#64748b"}}># 部署到 Vercel</span></div><div>npx vercel --prod</div>
        </div>
      </div>
    </div>
  );
}

// ── Markdown default content ───────────────────────────────────────────────
// ── Markdown renderer ──────────────────────────────────────────────────────
function renderMd(text){
  const lines=text.split("\n");
  const out=[];let listBuf=[];let key=0;let tl=null;
  function flush(){if(!listBuf.length)return;out.push(<ul key={key++} style={{margin:"6px 0 14px",paddingLeft:22,display:"grid",gap:5}}>{listBuf}</ul>);listBuf=[];}
  function tlRow(line){const p=line.split("|").map(s=>s.trim());let sub="",dim=false;p.slice(2).forEach(x=>{if(x.toLowerCase()==="dim")dim=true;else if(x)sub=x;});return{badge:p[0]||"",title:p[1]||"",sub,dim};}
  function tlCard(rows){return(<div key={key++} style={{background:"#eff4ff",borderRadius:16,padding:"18px 18px 6px",margin:"6px 0 18px"}}>{rows.map((r,ri)=>(<div key={ri} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><div style={{flex:"0 0 40px",width:40,height:40,borderRadius:20,background:r.dim?"#cbd5e1":"#2563eb",color:"#fff",fontWeight:800,fontSize:r.badge.length>=4?11:12,display:"flex",alignItems:"center",justifyContent:"center"}}>{r.badge}</div><div><div style={{fontSize:15,fontWeight:800,color:r.dim?"#94a3b8":"#0f172a"}}>{r.title}</div>{r.sub?<div style={{fontSize:12,color:"#64748b",marginTop:2}}>{r.sub}</div>:null}</div></div>))}</div>);}
  function inline(s){
    const parts=[];
    s.split(/(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).forEach((p,i)=>{
      const link=p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if(link)parts.push(<a key={i} href={link[2]} target="_blank" rel="noreferrer" style={{color:"#2563eb"}}>{link[1]}</a>);
      else if(p.startsWith("**")&&p.endsWith("**")&&p.length>4)parts.push(<strong key={i}>{p.slice(2,-2)}</strong>);
      else if(p.startsWith("*")&&p.endsWith("*")&&p.length>2)parts.push(<em key={i}>{p.slice(1,-1)}</em>);
      else parts.push(p);
    });
    return parts;
  }
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    // :::timeline 區塊、@badge/@subtitle 指令（後者呈現在深色頁首、預覽內文略過）
    if(tl){if(l.trim()===":::"){out.push(tlCard(tl));tl=null;}else if(l.trim()!=="")tl.push(tlRow(l));continue;}
    if(l.trim()===":::timeline"){flush();tl=[];continue;}
    if(/^@(badge|subtitle)\s+/.test(l.trim()))continue;
    const imgM=l.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s|]+)(?:\|(\d{1,4}))?\)$/);
    if(imgM){flush();const w=imgM[3]?Math.min(560,Number(imgM[3])):160;out.push(<p key={key++} style={{textAlign:"center",margin:"8px 0 18px"}}><img src={imgM[2]} alt={imgM[1]} style={{width:w,maxWidth:"80%",height:"auto"}}/></p>);}
    else if(l.startsWith("# ")){flush();out.push(<h1 key={key++} style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-.03em"}}>{inline(l.slice(2))}</h1>);}
    else if(l.startsWith("## ")){flush();out.push(<h2 key={key++} style={{fontSize:16,fontWeight:900,color:"#0f172a",margin:"24px 0 8px",paddingBottom:7,borderBottom:"1px solid #f1f5f9"}}>{inline(l.slice(3))}</h2>);}
    else if(l.startsWith("### ")){flush();out.push(<h3 key={key++} style={{fontSize:14,fontWeight:800,color:"#1e293b",margin:"14px 0 5px"}}>{inline(l.slice(4))}</h3>);}
    else if(l.trim()==="---"){flush();out.push(<hr key={key++} style={{border:"none",borderTop:"1px solid #e2e8f0",margin:"16px 0"}}/>);}
    else if(l.startsWith("- ")){listBuf.push(<li key={key++} style={{fontSize:14,color:"#374151",lineHeight:1.75}}>{inline(l.slice(2))}</li>);}
    else if(l.trim()===""){flush();}
    else{
      flush();
      // 整行只有一個連結 → 置中按鈕（與 lib/newsletter.js 實寄樣式一致）
      const btn=l.trim().match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if(btn)out.push(<p key={key++} style={{textAlign:"center",margin:"24px 0"}}><a href={btn[2]} target="_blank" rel="noreferrer" style={{display:"inline-block",background:"#2563eb",color:"#fff",fontWeight:700,fontSize:15,padding:"13px 32px",borderRadius:999,textDecoration:"none"}}>{btn[1]}</a></p>);
      else out.push(<p key={key++} style={{fontSize:14,color:"#374151",lineHeight:1.8,margin:"0 0 10px"}}>{inline(l)}</p>);
    }
  }
  if(tl)out.push(tlCard(tl));
  flush();return out;
}

// ── Privacy / Terms ────────────────────────────────────────────────────────
function DocEditorPage({title,contentKey,defaultMd,showToast}){
  const [md,setMd]=useState(defaultMd);
  const [saved,setSaved]=useState(defaultMd);
  const [mode,setMode]=useState("preview");
  const [busy,setBusy]=useState(false);
  const dirty=md!==saved;
  // 從 DB 載入（有編輯過才覆蓋預設）；存檔寫 DB → 正式 /privacy /terms 即時反映（ISR 5 分鐘）。
  useEffect(()=>{let cancelled=false;_api("/api/admin/site-content").then(r=>r.json()).then(d=>{const v=d?.data?.[contentKey];if(!cancelled&&typeof v==="string"&&v.trim()){setMd(v);setSaved(v);}}).catch(()=>{});return()=>{cancelled=true;};},[contentKey]);
  async function save(){
    if(busy)return;setBusy(true);
    try{const r=await _api("/api/admin/site-content",{method:"PATCH",body:JSON.stringify({key:contentKey,body_md:md})});const d=await r.json().catch(()=>({}));
      if(!r.ok||d.ok===false)showToast?.("❌ 儲存失敗："+(d.error||"unknown"));
      else{setSaved(md);showToast?.(`✅ ${title}已儲存，前台將於數分鐘內更新`);}
    }catch(e){showToast?.("❌ 儲存失敗："+e.message);}finally{setBusy(false);}
  }
  return(
    <div>
      <div className={styles.pageHeader} style={{flexWrap:"wrap",gap:12}}>
        <div><h1>{title}</h1><p>將顯示於前台・使用 Markdown 語法編輯</p></div>
        <div className={styles.pageActions} style={{flexWrap:"wrap",gap:8}}>
          <div className={styles.filterGroup}>
            <button className={`${styles.filterBtn} ${mode==="preview"?styles.filterActive:""}`} onClick={()=>setMode("preview")}>預覽</button>
            <button className={`${styles.filterBtn} ${mode==="edit"?styles.filterActive:""}`} onClick={()=>setMode("edit")}>編輯</button>
          </div>
          {dirty&&<span style={{fontSize:12,fontWeight:800,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",alignSelf:"center"}}>有未儲存的變更</span>}
          {dirty&&<button className={styles.btnSmall} onClick={()=>setMd(saved)}>復原</button>}
          <button className={styles.btnPrimary} onClick={save} disabled={busy}>{busy?"儲存中…":"儲存"}</button>
        </div>
      </div>
      <div className={styles.panel}>
        {mode==="edit"
          ?<textarea
              className={styles.replyTextarea}
              value={md}
              onChange={e=>setMd(e.target.value)}
              style={{width:"100%",minHeight:640,fontFamily:"'Courier New',Consolas,monospace",fontSize:13,lineHeight:1.75,boxSizing:"border-box",resize:"vertical"}}
            />
          :<div style={{maxWidth:760,padding:"4px 0"}}>{renderMd(md)}</div>
        }
      </div>
    </div>
  );
}
function PrivacyPage({showToast}){return <DocEditorPage title="隱私權政策" contentKey="privacy" defaultMd={DEFAULT_PRIVACY_MD} showToast={showToast}/>;}
function TermsPage({showToast}){return <DocEditorPage title="服務條款" contentKey="terms" defaultMd={DEFAULT_TERMS_MD} showToast={showToast}/>;}

// 電子報：編輯標題+Markdown 內文 → 群發給「已付款／已開通學員 / 註冊官網帳號」。逐封寄(A 方案)，碰上限即回報。
// 「已付款」對象＝已付款訂單 ∪ enrollments（見 lib/newsletter-send.js），付了錢但還沒開通的人也收得到。
// 電子報範本：點選帶入標題與內文再自行修改。文案為正式敬語體，日期／章節等請發送前確認。
const NEWSLETTER_TEMPLATES=[
  {name:"開課通知（早鳥分層）",subject:"9/30 正式開課・9/2 搶先開放第一章",body:[
    "@badge 上架公告",
    "@subtitle 9/2 搶先開放第一章節，給第一批預購的您。","",
    "![InRecord 吉祥物](https://inrecordmusic.com/mascot-wave-v2.png|120)","",
    "親愛的預購學員，您好：","",
    "感謝您在演奏會期間，以超早鳥方案預購張育瑞「從零開始學鋼琴－了解三和弦與基礎伴奏」。除了享有這堂課推出以來的最低優惠，也包含了為您準備的「搶先觀看」專屬權益。","",
    "## 9/2 起　第一章搶先開放",
    "您於音樂會預購階段完成購課，享有早鳥搶先觀看權益。第一章將於今晚 8 點開放，後續每週開放一章（9/9、9/16、9/23），9/30 完整課程全數上架。","",
    ":::timeline",
    "9/2 | 第一章　搶先開放 | 晚上 8:00 開放",
    "9/9 | 第二章　上架",
    "9/16 | 第三章　上架",
    "9/23 | 第四章　上架",
    "9/30 | 完整課程　正式全數開放 | dim",
    ":::","",
    "近期課程將展開正式對外宣傳，為避免新學員混淆，官方網站的公開資訊會統一標示為「9/30 完整課程正式上架」。請放心，您專屬的 9/2 搶先觀看權益完全不受影響，其他新學員則會統一自 9/30 起才能開始觀看。","",
    "## 9/30　完整課程正式上架",
    "9/30 起，所有課程內容將全數開放。課程購買後可永久觀看，您可以依照自己的學習進度，隨時回來複習。","",
    "## 關於搶先觀看版本",
    "9/2～9/29 期間開放的內容，是正式上架前提供給預購學員的專屬搶先版。","",
    "目前課程正進行最後的字幕校對與網站微調，部分畫面或操作後續仍可能持續更新。我們誠摯邀請第一批加入的您參與這個最終打磨階段；如果您在觀看時發現任何播放異常、字幕錯字，或對教學內容有任何建議，都歡迎直接來信告訴我們。您的回饋，將幫助這堂課在 9/30 正式上架時更加完美。","",
    "## 開始上課前，三分鐘完成準備",
    "![InRecord 吉祥物](https://inrecordmusic.com/mascot-piano-v2.png|110)","",
    "您的觀看權限在完成預購時就已經設定完畢，不需要另外購買或啟用。開始前想先請您花一分鐘填寫學員資料——這份資料會用於寄送新章節上架通知與課程連結、學員專屬活動的優先邀請，以及調整後續內容規劃。跟著下面四個步驟，一次完成：","",
    "**STEP 1｜用購買時的 Email 登入**",
    "在登入頁點「Email 連結登入（免密碼）」，輸入購買時的 Email，收信後點連結或輸入驗證碼即可；第一次登入系統會自動建立帳號。","",
    "![登入頁面](https://inrecordmusic.com/guide/step-1-login.png|500)","",
    "**STEP 2｜花一分鐘填寫學員資料**",
    "第一次進教室會先看到這份表單，填完「姓名、手機、鋼琴程度」三格必填就能開始上課，其餘可之後再補。","",
    "![填寫學員資料](https://inrecordmusic.com/guide/step-2-profile.png|500)","",
    "[填寫學員資料](https://inrecordmusic.com/classroom/account)","",
    "**STEP 3｜進入音樂教室**",
    "儀表板會記住你的學習進度，點「繼續上課」就能接著上次的地方繼續。","",
    "![音樂教室儀表板](https://inrecordmusic.com/guide/step-3-dashboard.png|500)","",
    "**STEP 4｜開始上課**",
    "影片旁的單元清單可切換章節與單元；影片下方還有學員留言、課程評價、作業繳交、互動遊戲與筆記，歡迎多多使用。","",
    "![播放頁功能介紹](https://inrecordmusic.com/guide/step-4-watch.png|500)","",
    "填寫完成後，9/2 晚上 8:00 第一章開放，只要登入購買課程時使用的帳號就可以直接開始觀看。未來每次有新章節上架，我們也會另外寄送通知信，並附上課程連結。","",
    "如果填寫時遇到任何問題，直接回信告訴我們就可以。","",
    "**小提醒**：把 support@inrecordmusic.com 加入通訊錄，之後的新章節上架通知才不會被信箱歸進促銷或垃圾信件夾。","",
    "有任何問題，隨時歡迎來信至 support@inrecordmusic.com，我們收到後會盡快回覆。","",
    "**9/2 晚上 8:00，第一章見！**"].join("\n")},
  {name:"新章節上架",subject:"【InRecord】新章節上架通知",body:[
    "親愛的學員，您好：","",
    "以下章節已於今日上架，歡迎進入音樂教室繼續您的學習：","",
    "## 本次上架內容",
    "- Ch○ 章節名稱（單元 ○-1 ～ ○-6）","",
    "後續章節將依時程陸續上架，全部內容預計 **9/30 前** 上架完畢。","",
    "[前往上課](https://inrecordmusic.com/classroom)","",
    "---","",
    "若有任何問題，歡迎直接回覆此信，我們將盡快為您處理。","",
    "**InRecord・音樂刻 敬上**"].join("\n")},
  {name:"課程異動公告",subject:"【InRecord】課程服務公告",body:[
    "親愛的學員，您好：","",
    "感謝您對 InRecord 的支持，以下事項向您說明：","",
    "## 公告內容",
    "（請填寫異動或維護說明，例：系統將於 ○/○ ○○:○○ 進行維護，期間暫停服務約 ○ 小時。）","",
    "造成不便，敬請見諒。","",
    "---","",
    "若有任何問題，歡迎直接回覆此信，我們將盡快為您處理。","",
    "**InRecord・音樂刻 敬上**"].join("\n")},
  {name:"一般消息",subject:"【InRecord】最新消息",body:[
    "親愛的學員，您好：","",
    "（開頭段落）","",
    "## 標題一",
    "（內文）","",
    "- 條列重點一",
    "- 條列重點二","",
    "[按鈕文字](https://inrecordmusic.com)","",
    "---","",
    "若有任何問題，歡迎直接回覆此信，我們將盡快為您處理。","",
    "**InRecord・音樂刻 敬上**"].join("\n")},
];

function NewsletterPage({showToast}){
  const [subject,setSubject]=useState("");
  const [bodyMd,setBodyMd]=useState("");
  const [savedSubject,setSavedSubject]=useState("");
  const [savedBody,setSavedBody]=useState("");
  const [audience,setAudience]=useState("buyers");
  const [mode,setMode]=useState("edit");
  const [lastSent,setLastSent]=useState(null);
  const [busy,setBusy]=useState("");
  const [result,setResult]=useState(null);
  // 改用 Brevo 後台範本寄送：>0 時主旨／內容以 Brevo 範本為準，本地標題／內文不寄
  const [brevoTemplates,setBrevoTemplates]=useState([]);
  const [brevoTemplateId,setBrevoTemplateId]=useState(0);
  const [testTo,setTestTo]=useState(""); // 測試收件人（逗號/空白分隔，可多個；留空＝ADMIN_EMAIL）
  const [quota,setQuota]=useState(null); // Brevo 寄件額度；期間依方案而定（免費＝每日、付費＝計費週期），見 lib/brevo-quota.js
  const refreshQuota=useCallback(async()=>{
    try{const r=await _api("/api/admin/brevo-quota");const d=await r.json().catch(()=>({}));if(d.ok)setQuota(d);}catch{}
  },[]);
  const useTpl=brevoTemplateId>0;
  const tplName=brevoTemplates.find(t=>t.id===brevoTemplateId)?.name||`#${brevoTemplateId}`;
  const dirty=subject!==savedSubject||bodyMd!==savedBody;

  const load=useCallback(async()=>{
    try{
      const res=await _api("/api/admin/newsletter");
      const {data}=await res.json();
      setSubject(data.subject||"");setBodyMd(data.body_md||"");
      setSavedSubject(data.subject||"");setSavedBody(data.body_md||"");
      if(data.last_sent_at)setLastSent({at:data.last_sent_at,count:data.last_sent_count});
    }catch{}
    try{
      const res=await _api("/api/admin/brevo-templates");
      const d=await res.json().catch(()=>({}));
      if(d.ok)setBrevoTemplates(d.data||[]);
    }catch{}
    refreshQuota();
  },[refreshQuota]);
  useEffect(()=>{load();},[load]);

  async function persist(){
    const res=await _api("/api/admin/newsletter",{method:"PATCH",body:JSON.stringify({subject,body_md:bodyMd})});
    if(res.ok){setSavedSubject(subject);setSavedBody(bodyMd);}
    return res.ok;
  }
  async function save(){
    setBusy("save");
    try{ if(await persist())showToast?.("✅ 草稿已儲存"); else showToast?.("❌ 儲存失敗"); }
    catch(e){showToast?.("❌ 儲存失敗："+e.message);} finally{setBusy("");}
  }
  async function sendTest(){
    if(!useTpl&&(!subject.trim()||!bodyMd.trim())){showToast?.("請先填標題與內文");return;}
    setBusy("test");setResult(null);
    try{
      if(!useTpl)await persist();
      const list=testTo.split(/[\s,;、]+/).filter(Boolean);
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({test:true,...(list.length?{testEmails:list}:{}),...(useTpl?{brevoTemplateId}:{})})});
      const d=await res.json();
      if(d.ok)showToast?.("✅ 測試信已寄到 "+(d.to||"管理員信箱")+(d.unsubscribed?.length?`（${d.unsubscribed.length} 位已退訂，略過）`:""));
      else if(d.test&&d.sent!=null)showToast?.(`⚠️ 測試信 ${d.failed} 封失敗（成功 ${d.sent}：${d.to||"—"}）`);
      else showToast?.("❌ 測試寄送失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 測試寄送失敗："+e.message);} finally{setBusy("");refreshQuota();}
  }
  async function sendAll(){
    if(!useTpl&&(!subject.trim()||!bodyMd.trim())){showToast?.("請先填標題與內文");return;}
    const label=audience==="buyers"?"已付款／已開通學員":"註冊官網帳號";
    const what=useTpl?`用 Brevo 範本「${tplName}」`:"把這封電子報";
    if(!window.confirm(`確定${what}「正式群發」給【${label}】嗎？\n寄出後無法收回，建議先用「寄測試給我自己」確認版面。`))return;
    setBusy("all");setResult(null);
    try{
      if(!useTpl)await persist();
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({audience,...(useTpl?{brevoTemplateId}:{})})});
      const d=await res.json();
      if(!d.ok){showToast?.("❌ 群發失敗："+(d.error||"unknown"));}
      else{
        setResult(d);
        if(d.total===0)showToast?.("名單為空，沒有寄出");
        else if(d.limitHit)showToast?.(`⚠️ 已寄 ${d.sent} 封，剩 ${d.total-d.sent} 封未寄（碰到單日安全閥）`);
        else showToast?.(`✅ 群發完成：成功 ${d.sent}/${d.total}${d.failed?`，失敗 ${d.failed}`:""}`);
        await load();
      }
    }catch(e){showToast?.("❌ 群發失敗："+e.message);} finally{setBusy("");refreshQuota();}
  }

  return(
    <div>
      <div className={styles.pageHeader} style={{flexWrap:"wrap",gap:12}}>
        <div><h1>電子報</h1><p>編輯內容 → 群發給學員（支援 Markdown）</p></div>
        <div className={styles.pageActions} style={{flexWrap:"wrap",gap:8}}>
          <div className={styles.filterGroup}>
            <button className={`${styles.filterBtn} ${mode==="edit"?styles.filterActive:""}`} onClick={()=>setMode("edit")}>編輯</button>
            <button className={`${styles.filterBtn} ${mode==="preview"?styles.filterActive:""}`} onClick={()=>setMode("preview")}>預覽</button>
          </div>
          {dirty&&<span style={{fontSize:12,fontWeight:800,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",alignSelf:"center"}}>未儲存</span>}
          <button className={styles.btnSmall} disabled={!!busy} onClick={save}>{busy==="save"?"儲存中…":"儲存草稿"}</button>
        </div>
      </div>

      <div className={styles.panel} style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
          <span style={{fontSize:13,fontWeight:700,color:"#475569"}}>範本</span>
          {NEWSLETTER_TEMPLATES.map(t=>(
            <button key={t.name} type="button" className={styles.btnSmall}
              onClick={()=>{
                if((subject.trim()||bodyMd.trim())&&!window.confirm(`套用「${t.name}」範本會覆蓋目前編輯中的標題與內文，確定？`))return;
                setSubject(t.subject);setBodyMd(t.body);setMode("edit");
              }}>{t.name}</button>
          ))}
          <span style={{fontSize:12,color:"#94a3b8"}}>套用後請確認日期與內容再發送</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
          <span style={{fontSize:13,fontWeight:700,color:"#475569"}}>Brevo 範本</span>
          <select className={styles.searchInput} style={{width:"auto",minWidth:280}} value={brevoTemplateId} onChange={e=>setBrevoTemplateId(Number(e.target.value))}>
            <option value={0}>不使用（寄下方標題／內文）</option>
            {brevoTemplates.map(t=><option key={t.id} value={t.id}>#{t.id} {t.name}</option>)}
          </select>
          {useTpl
            ?<span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>會以 Brevo 後台「{tplName}」的主旨與內容寄出，下方標題／內文不會寄</span>
            :<span style={{fontSize:12,color:"#94a3b8"}}>在 Brevo 後台建好的 Transactional 範本會列在這裡</span>}
        </div>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:"#475569",marginBottom:6}}>標題</label>
        <input className={styles.searchInput} style={{width:"100%",marginBottom:16}} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="例：六月課程最新消息 🎹"/>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:"#475569",marginBottom:6}}>內文（Markdown：# 標題 / **粗體** / - 清單 / --- 分隔線 / [文字](網址)＝連結 / 整行只放連結＝置中按鈕）</label>
        {mode==="edit"
          ?<textarea value={bodyMd} onChange={e=>setBodyMd(e.target.value)} style={{width:"100%",minHeight:360,fontFamily:"'Courier New',Consolas,monospace",fontSize:13,lineHeight:1.75,boxSizing:"border-box",resize:"vertical",border:"1px solid #e2e8f0",borderRadius:10,padding:12}}/>
          :<div style={{maxWidth:760,padding:"4px 0"}}>{renderMd(bodyMd)}</div>}
      </div>

      <div className={styles.panel}>
        <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap",margin:"0 0 12px"}}>
          <h3 style={{margin:0}}>群發</h3>
          {quota&&quota.ok&&(
            <span style={{fontSize:12.5,color:quota.remaining==null?"#64748b":quota.remaining<=30?"#dc2626":quota.remaining<=100?"#b45309":"#64748b"}}>
              {quota.limit!=null
                ? <>{quota.daily?"今日":"本期"} Brevo 額度剩 <b style={{fontVariantNumeric:"tabular-nums"}}>{quota.remaining}</b>／{quota.limit} 封</>
                : <>{quota.daily?"今日":"本期"} Brevo 已寄 <b style={{fontVariantNumeric:"tabular-nums"}}>{quota.used}</b> 封</>}
              <span style={{color:"#94a3b8"}}>
                （{quota.limit!=null&&`已寄 ${quota.used}，`}含登入驗證信；{quota.daily?"台灣早上 8 點重置":`自 ${quota.periodStart} 起算`}）
              </span>
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:18,flexWrap:"wrap",marginBottom:14}}>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="buyers"} onChange={()=>setAudience("buyers")}/> 🎓 已付款／已開通學員</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="registered"} onChange={()=>setAudience("registered")}/> 👤 註冊官網帳號</label>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input className={styles.searchInput} style={{width:300}} value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder="測試收件人，逗號分隔可多個（留空＝寄給我自己）"/>
          <button className={styles.btnSmall} disabled={!!busy} onClick={sendTest}>{busy==="test"?"寄送中…":testTo.trim()?"寄測試":"寄測試給我自己"}</button>
          <button className={styles.btnPrimary} disabled={!!busy} onClick={sendAll}>{busy==="all"?"群發中…":"正式群發"}</button>
        </div>
        {lastSent&&<p className={styles.dim} style={{fontSize:12,marginTop:12}}>上次寄送：{fmt(lastSent.at)}（{lastSent.count} 封）</p>}
        {result&&<div style={{marginTop:12,fontSize:13,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
          本次：對象 {result.total} 人 · 成功 {result.sent} · 失敗 {result.failed}{result.limitHit?` · ⚠️ 碰單日安全閥，剩 ${result.total-result.sent} 未寄`:""}
        </div>}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function statusLabel(s){return{requested:"已留 Email",preview_mode:"預覽模式",email_sent:"已寄試看信",demo_opened:"已開 Demo",purchased:"已購買"}[s]||s||"—";}
// 學員資料頁（student_profiles）enum 顯示對照，比照 levelLabel；空值/未知值一律回退「—」。
function sourceLabel(v){return{ig:"Instagram",friend:"朋友介紹",concert:"演奏會",search:"網路搜尋",other:"其他"}[v]||"—";}
function equipmentLabel(v){return{acoustic:"鋼琴",digital:"電鋼琴",none:"目前沒有"}[v]||"—";}
function ageGroupLabel(v){return{"under18":"未滿18","18_29":"18–29","30_44":"30–44","45_59":"45–59","60plus":"60以上"}[v]||"—";}

// ── Course Detail Page (classroom sub-pages) ──────────────────────────────
const COURSE_TABS = [
  { id:"chapters",     label:"章節與單元管理", icon:List },
  { id:"assignments",  label:"作業設定",       icon:ClipboardList },
  { id:"unitcomments", label:"單元評論",       icon:MessageSquare },
  { id:"ratings",      label:"課程評價",       icon:Star },
  { id:"games",        label:"互動遊戲",        icon:Gamepad2 },
  // 測驗管理：學員端 UI 尚未做（播放頁沒有測驗、bootstrap 不帶測驗），先藏起入口避免以為已上線；
  // API（/api/classroom/quiz*、/api/admin/quizzes）與資料表保留，要開放時把這行放回來即可。
  // { id:"quizzes",      label:"測驗管理",       icon:ListChecks },
];

function CourseDetailPage({ course, onBack, showToast, unreadUnitComments, onUnreadChange }) {
  const [tab, setTab] = useState("chapters");
  const Icon = COURSE_TABS.find(t => t.id === tab)?.icon || List;
  return (
    <div>
      {/* breadcrumb */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
        <button
          onClick={onBack}
          style={{ border:0, background:"none", cursor:"pointer", color:"#64748b", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:4, padding:0 }}
        >
          <BookOpen size={14}/> 課程管理
        </button>
        <span style={{ color:"#cbd5e1", fontSize:13 }}>›</span>
        <span style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>{course.title}</span>
      </div>

      {/* course identity strip */}
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 20px", background:"#fff", borderRadius:14, border:"1px solid #e8ecf0", marginBottom:20 }}>
        <div style={{ width:44, height:44, borderRadius:12, background:"#eff6ff", display:"grid", placeItems:"center", flexShrink:0 }}>
          <Music size={22} color="#2563eb"/>
        </div>
        <div>
          <div style={{ fontWeight:900, fontSize:16, color:"#0f172a" }}>{course.title}</div>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:2 }}>{course.desc || ""}</div>
        </div>
        <span style={{ marginLeft:"auto", fontSize:12, fontWeight:800, padding:"4px 10px", borderRadius:999, background: course.status==="published"?"#dcfce7":"#f1f5f9", color: course.status==="published"?"#166534":"#475569" }}>
          {course.status==="published"?"已發佈":"草稿"}
        </span>
      </div>

      {/* sub-tab nav */}
      <div style={{ display:"flex", gap:4, background:"#fff", border:"1px solid #e8ecf0", borderRadius:12, padding:6, marginBottom:20, flexWrap:"wrap" }}>
        {COURSE_TABS.map(t => {
          const TIcon = t.icon;
          const badge = t.id==="unitcomments" && unreadUnitComments > 0 ? unreadUnitComments : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                border:0, borderRadius:9, padding:"8px 14px", fontSize:13, fontWeight:700,
                cursor:"pointer", display:"flex", alignItems:"center", gap:6,
                background: tab===t.id ? "#2563eb" : "none",
                color: tab===t.id ? "#fff" : "#475569",
                position:"relative",
              }}
            >
              <TIcon size={14}/> {t.label}
              {badge && <span style={{ background:"#ef4444", color:"#fff", borderRadius:999, fontSize:11, fontWeight:900, padding:"1px 6px", marginLeft:2 }}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      {tab==="chapters"     && <ChaptersUnitsPage  showToast={showToast} courseId={course.id}/>}
      {tab==="assignments"  && <AssignmentsPage    showToast={showToast} courseId={course.id}/>}
      {tab==="unitcomments" && <UnitCommentsPage   showToast={showToast} courseId={course.id} onUnreadChange={onUnreadChange}/>}
      {tab==="ratings"      && <CourseRatingsPage  showToast={showToast} courseId={course.id}/>}
      {tab==="games"        && <GamesManagePage    showToast={showToast} courseId={course.id}/>}
      {tab==="quizzes"      && <QuizzesPage        showToast={showToast} courseId={course.id}/>}
    </div>
  );
}

// ── Customer 360 Page ──────────────────────────────────────────────────────
function CustomerLookupPage({showToast}){
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

// ── Audit / Email Log Page ─────────────────────────────────────────────────
const EMAIL_KIND_LABEL={purchase:"購買確認",presale:"預購信",launch:"開課通知",newsletter:"電子報",custom:"自訂信",followup:"批次追單"};
function AuditLogPage(){
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

// ── Main AdminPage ─────────────────────────────────────────────────────────
const TOKEN_KEY = ADMIN_TOKEN_KEY;
const getToken = () => (typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null);

export default function AdminPage(){
  const [authed,setAuthed]=useState(false);
  const [authChecked,setAuthChecked]=useState(false);
  const [emailInput,setEmailInput]=useState("");
  const [pwInput,setPwInput]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [loginLoading,setLoginLoading]=useState(false);
  const [page,setPage]=useState("dashboard");
  const [selectedCourse,setSelectedCourse]=useState(null);
  const [navOpen,setNavOpen]=useState(false);
  const [leads,setLeads]=useState([]);
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState("");
  const [trendFilter,setTrendFilter]=useState("month");
  const [donutFilter,setDonutFilter]=useState("month");
  const [unreadUnitComments,setUnreadUnitComments]=useState(0);

  // Auto-verify stored token on mount
  useEffect(()=>{
    const token=getToken();
    if(!token){setAuthChecked(true);return;}
    fetch("/api/admin/verify",{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>{if(r.ok){setAuthed(true);}else{sessionStorage.removeItem(TOKEN_KEY);}})
      .catch(()=>{sessionStorage.removeItem(TOKEN_KEY);})
      .finally(()=>setAuthChecked(true));
  },[]);

  // 任一透過 _api 的後台動作回 401（token 過期/失效）→ 清 token、跳回登入頁並提示。
  useEffect(()=>{
    setAdminUnauthorizedHandler(()=>{ sessionStorage.removeItem(TOKEN_KEY); setAuthed(false); setLoginErr("登入已過期，請重新登入"); });
    return ()=>{ setAdminUnauthorizedHandler(null); };
  },[]);

  async function doLogin(){
    if(!emailInput||!pwInput){setLoginErr("請輸入 Email 與密碼");return;}
    setLoginLoading(true);setLoginErr("");
    try{
      const res=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:emailInput,password:pwInput})});
      const data=await res.json();
      if(!res.ok){
        setLoginErr(data.error==="too_many_attempts"?"登入失敗次數過多，請 15 分鐘後再試":"Email 或密碼錯誤");
        return;
      }
      sessionStorage.setItem(TOKEN_KEY,data.token);
      setAuthed(true);setLoginErr("");
    }catch{setLoginErr("網路錯誤，請稍後再試");}
    finally{setLoginLoading(false);}
  }

  function doLogout(){sessionStorage.removeItem(TOKEN_KEY);setAuthed(false);setEmailInput("");setPwInput("");}
  function showToast(msg){setToast(msg);setTimeout(()=>setToast(""),2400);}

  const fetchLeads=useCallback(async()=>{
    setLoading(true);
    try{const res=await fetch("/api/admin/leads",{headers:{Authorization:`Bearer ${getToken()}`}});if(!res.ok)throw new Error((await res.json()).error||"fetch_failed");const{data}=await res.json();setLeads(data||[]);}
    catch{const raw=localStorage.getItem("inrecord_course_preview_leads");try{setLeads(JSON.parse(raw||"[]"));}catch{setLeads([]);}}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{if(authed&&["dashboard","students","orders","messages","analytics"].includes(page))fetchLeads();},[authed,page,fetchLeads]);

  const fetchOrders=useCallback(async()=>{
    try{const res=await fetch("/api/admin/orders",{headers:{Authorization:`Bearer ${getToken()}`}});if(!res.ok)throw new Error("fetch_failed");const{data}=await res.json();setOrders(data||[]);}
    catch{setOrders([]);}
  },[]);

  useEffect(()=>{if(authed)fetchOrders();},[authed,page,fetchOrders]);

  const purchasedCount=leads.filter(l=>l.purchased||l.status==="purchased").length;
  // 側欄「訂單管理」徽章＝已付款訂單數（不含手動開通），與訂單頁「已付款訂單」卡同一個數字
  const failedInvoiceCount=paidOrderCount(orders);

  useEffect(()=>{
    if(!authed)return;
    fetch("/api/admin/unit-comments?count=true",{headers:{Authorization:`Bearer ${getToken()}`}})
      .then(r=>r.json()).then(d=>{ if(d.unread!=null) setUnreadUnitComments(d.unread); }).catch(()=>{});
  },[authed,page]);

  function getBadge(key){if(key==="leads")return leads.length||null;if(key==="orders")return failedInvoiceCount||null;if(key==="messages")return unreadUnitComments||null;if(key==="courses")return unreadUnitComments||null;return null;}

  if(!authChecked)return(
    <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f1f5f9"}}>
      <div style={{width:32,height:32,border:"3px solid #e2e8f0",borderTopColor:"#2563eb",borderRadius:"50%",animation:"spin .65s linear infinite"}}/>
    </div>
  );

  if(!authed)return(
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <Logo size={28}/><h1>後台登入</h1><p className={styles.sub}>管理課程試看名單與整合設定</p>
        <div className={styles.field}><label>Email</label><input className={styles.input} type="email" placeholder="inrecmusic@gmail.com" value={emailInput} onChange={e=>setEmailInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} autoComplete="email"/></div>
        <div className={styles.field}><label>密碼</label><input className={styles.input} type="password" placeholder="••••••••" value={pwInput} onChange={e=>setPwInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} autoComplete="current-password"/></div>
        {loginErr&&<p className={styles.loginErr}>{loginErr}</p>}
        <button className={styles.btnPrimary} style={{width:"100%",marginTop:16}} onClick={doLogin} disabled={loginLoading}>{loginLoading?"驗證中…":"登入後台"}</button>
        <p style={{textAlign:"center",marginTop:12,fontSize:13,color:"#888"}}><a href="/" style={{color:"var(--brand)"}}>← 返回前台</a></p>
      </div>
    </div>
  );

  return(
    <div className={styles.app}>
      <aside className={`${styles.sidebar} ${navOpen?styles.sidebarOpen:""}`}>
        <div className={styles.sideTop}><Logo white size={20} /><span className={styles.brandName}>後台</span></div>
        <nav className={styles.sideNav}>
          {NAV_GROUPS.map(group=>(
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map(item=>{
                const Icon=item.icon;const badge=item.badgeKey?getBadge(item.badgeKey):null;
                return(
                  <button key={item.id} className={`${styles.navItem} ${page===item.id?styles.active:""}`} onClick={()=>{setPage(item.id);if(item.id!=="courses")setSelectedCourse(null);setNavOpen(false);}}>
                    <span className={styles.navItemInner}><Icon size={17} className={styles.navIcon}/><span>{item.label}</span></span>
                    {badge?<span className={styles.badge}>{badge}</span>:null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={styles.sideBottom}><button className={styles.sideBtn} onClick={doLogout}><LogOut size={15}/> 登出</button></div>
      </aside>
      {navOpen&&<div className={styles.navOverlay} onClick={()=>setNavOpen(false)}/>}

      <div className={styles.main}>
        <div className={styles.topbar}>
          <button className={styles.hamburger} onClick={()=>setNavOpen(true)} aria-label="開啟選單"><List size={20}/></button>
          <span className={styles.topbarTitle}>後台管理系統</span>
          <div className={styles.topbarRight}>
            <div className={styles.adminAvatar}>管</div>
          </div>
        </div>
        <div className={styles.content}>
          {page==="dashboard"   &&<DashboardPage leads={leads} orders={orders} trendFilter={trendFilter} donutFilter={donutFilter} setTrendFilter={setTrendFilter} setDonutFilter={setDonutFilter} onViewOrders={()=>setPage("orders")}/>}
          {page==="courses"     &&(selectedCourse
            ? <CourseDetailPage course={selectedCourse} onBack={()=>setSelectedCourse(null)} showToast={showToast} unreadUnitComments={unreadUnitComments} onUnreadChange={n=>setUnreadUnitComments(n)}/>
            : <CoursesPage orders={orders} onManage={c=>{setSelectedCourse(c);}} showToast={showToast}/>
          )}
          {page==="messages"    &&<MessagesPage showToast={showToast}/>}
          {page==="media"       &&<MediaPage/>}
          {page==="students"    &&<StudentsPage showToast={showToast}/>}
          {page==="orders"      &&<OrdersPage leads={leads} showToast={showToast}/>}
          {page==="customer"    &&<CustomerLookupPage showToast={showToast}/>}
          {page==="subscriptions"&&<SubscriptionsPage showToast={showToast}/>}
          {page==="coupons"     &&<CouponsPage showToast={showToast}/>}
          {page==="analytics"   &&<AnalyticsPage leads={leads} orders={orders} trendFilter={trendFilter} donutFilter={donutFilter} setTrendFilter={setTrendFilter} setDonutFilter={setDonutFilter}/>}
          {page==="ads"         &&<AdsPerformancePage showToast={showToast}/>}
          {page==="sale"        &&<SaleSettingsPage showToast={showToast}/>}
          {page==="tracking"    && <TrackingSettingsPage showToast={showToast}/>}
          {page==="audit"       &&<AuditLogPage/>}
          {page==="integration" &&<IntegrationPage showToast={showToast}/>}
          {page==="privacy"     &&<PrivacyPage showToast={showToast}/>}
          {page==="terms"       &&<TermsPage showToast={showToast}/>}
          {page==="newsletter"  &&<NewsletterPage showToast={showToast}/>}
          {page==="announcements" &&<AnnouncementsPage showToast={showToast}/>}
          {page==="changelog"     &&<ChangelogPage/>}
        </div>
      </div>

      {toast&&<div className={styles.toast}>{toast}</div>}
    </div>
  );
}

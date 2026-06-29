"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import Logo from "@/components/Logo";
import styles from "./admin.module.css";
import {
  LayoutDashboard, BookOpen, MessageCircle, Image as Img,
  Users, ShoppingCart, Ticket, TrendingUp, Settings, Shield, FileText,
  DollarSign, RefreshCw, Download, LogOut, ExternalLink,
  Eye, ArrowUpRight, Tag, CreditCard, GraduationCap, Music,
  CheckCircle2, BarChart2, Play, Video, X, Plus, Upload,
  Trash2, Edit2, Copy, Filter, Percent, List, ClipboardList, Star, MessageSquare, Gamepad2,
  AlertTriangle, CalendarClock, Mail, Search
} from "lucide-react";
import ChaptersUnitsPage from "./ChaptersUnitsPage";
import AssignmentsPage from "./AssignmentsPage";
import UnitCommentsPage from "./UnitCommentsPage";
import CourseRatingsPage from "./CourseRatingsPage";
import GamesManagePage from "./GamesManagePage";
import SaleSettingsPage from "./SaleSettingsPage";
import { PLAN_CATALOG } from "@/lib/plans";
import { LEAD_SOURCES } from "@/lib/admin-leads";
import { inDateRange } from "@/lib/date-range";
import { summarizeOrders } from "@/lib/reconciliation";
import { buildSalesTrend, buildPayDistribution } from "@/lib/dashboard";



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
  ]},
  { title:"設定", items:[
    { id:"sale",        label:"銷售設定",   icon:CalendarClock },
    { id:"audit",       label:"操作紀錄",   icon:ClipboardList },
    { id:"integration", label:"系統設定",   icon:Settings },
    { id:"privacy",     label:"隱私權政策", icon:Shield },
    { id:"terms",       label:"服務條款",   icon:FileText },
    { id:"newsletter",  label:"電子報",     icon:Mail },
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

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({label,value,sub,icon:Icon,growth,color="#2563eb"}){
  const isUp=growth&&growth.startsWith("+");
  return(
    <div className={styles.statCard}>
      <div className={styles.statHead}><span className={styles.statLabel}>{label}</span>{Icon&&<span className={styles.statIcon} style={{color}}><Icon size={16}/></span>}</div>
      <strong className={styles.statValue}>{value}</strong>
      <div className={styles.statFoot}>
        <span className={styles.statSub}>{sub}</span>
        {growth&&<span className={`${styles.statGrowth} ${isUp?styles.up:styles.down}`}><ArrowUpRight size={12}/>{growth}</span>}
      </div>
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
        <StatCard label="本月訂單" value={paidM.length} sub="本月已完成訂單數" icon={ShoppingCart} color="#2563eb"/>
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
function CoursesPage({leads, onManage, showToast}){
  const [search,setSearch]=useState("");
  const [courses,setCourses]=useState([]);
  const [loading,setLoading]=useState(false);
  const [showModal,setShowModal]=useState(false);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({title:"",desc:"",price:"",status:"published"});
  const [formErr,setFormErr]=useState("");

  const purchased=leads.filter(l=>l.purchased||l.status==="purchased").length;

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
          <button className={styles.btnSmall} onClick={fetchCourses}><RefreshCw size={13}/> 重新整理</button>
          <a href="/" target="_blank" className={styles.btnSmall} style={{display:"flex",alignItems:"center",gap:5}}><Eye size={13}/> 前台預覽</a>
          <button className={styles.btnPrimary} onClick={openCreate}><Plus size={14}/> 新增課程</button>
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
                      <a href="/" target="_blank" className={styles.btnSmall}><Eye size={12}/> 查看</a>
                      <button className={styles.btnSmall} onClick={()=>openEdit(c)}><Edit2 size={12}/> 編輯</button>
                      <button className={styles.btnSmall} onClick={()=>toggleStatus(c)}>{c.status==="published"?"下架":"發佈"}</button>
                      <button className={styles.btnPrimary} style={{padding:"6px 12px",fontSize:12}} onClick={()=>onManage?.(c)}><BookOpen size={12}/> 管理教室</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>removeCourse(c)}><Trash2 size={12}/></button>
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
const _pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
function _api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${_pw()}`, ...(opts.headers || {}) } });
}

// 憑證圖（proof-uploads 為私有 bucket）：向 /api/admin/proof-signed 取短期簽名 URL 顯示
function ProofImage({ url }) {
  const [signed, setSigned] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSigned(null); setErr(false);
    _api("/api/admin/proof-signed", { method: "POST", body: JSON.stringify({ url }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) (d.signedUrl ? setSigned(d.signedUrl) : setErr(true)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [url]);
  if (err) return <span style={{ color: "#dc2626", fontSize: 13 }}>憑證載入失敗</span>;
  if (!signed) return <span style={{ color: "#94a3b8", fontSize: 13 }}>載入憑證…</span>;
  return <a href={signed} target="_blank" rel="noreferrer"><img src={signed} alt="憑證" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, border: "1px solid #ddd" }} /></a>;
}

// 寄信常用範本（追單/歡迎/退款）—— 選了會填入主旨與內文，可再自由編輯。
const EMAIL_TEMPLATES = [
  { id: "", name: "— 套用範本 —", subject: "", body: "" },
  { id: "followup", name: "追單（未完成付款）", subject: "您的課程訂單尚未完成付款 🎹",
    body: "嗨，\n\n感謝您選擇 InRecord！我們注意到您的課程訂單尚未完成付款。\n\n名額有限，完成付款即可保留您的優惠價與課程權益：\n\n- **付款連結**：（請貼上付款連結）\n- 若已完成付款請忽略本信。\n\n如有任何問題，直接回覆此信即可，我們很樂意協助 🙌" },
  { id: "welcome", name: "歡迎 / 開通通知", subject: "歡迎加入 InRecord！課程已為您開通 🎹",
    body: "嗨，\n\n歡迎加入 InRecord，您的課程已開通！\n\n- **登入方式**：請用本次購買的 Email 登入教室\n- 課程連結：https://inrecordmusic.com/classroom\n\n祝學習愉快，有任何問題隨時回覆此信 🙌" },
  { id: "refund", name: "退款通知", subject: "您的 InRecord 退款已處理",
    body: "嗨，\n\n您的退款申請已處理完成，款項將依原付款方式退還（信用卡約 3–7 個工作天、ATM/超商依銀行作業時間）。\n\n退款後，本課程之觀看權限已同步終止。\n\n如有任何問題，直接回覆此信即可。" },
];

// 單封自訂信（追單/客服）：對單一消費者寄一封自己編輯的信。內文支援受限 Markdown。
function ComposeEmailModal({ open, initialTo = "", onClose, showToast }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(initialTo || ""); setSubject(""); setBody(""); setBusy(false); } }, [open, initialTo]);
  function applyTemplate(id) { const t = EMAIL_TEMPLATES.find(x => x.id === id); if (t && t.id) { setSubject(t.subject); setBody(t.body); } }
  if (!open) return null;

  async function send() {
    if (busy) return;
    const em = to.trim();
    if (!em) { showToast?.("❌ 請填寫收件 Email"); return; }
    if (!subject.trim() || !body.trim()) { showToast?.("❌ 請填寫主旨與內文"); return; }
    setBusy(true);
    try {
      const res = await _api("/api/admin/send-custom-email", { method: "POST", body: JSON.stringify({ to: em, subject: subject.trim(), bodyMd: body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) showToast?.("❌ 寄送失敗：" + (d.error || "unknown"));
      else { showToast?.("✅ 已寄出給 " + em); onClose?.(); }
    } catch (e) { showToast?.("❌ 寄送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const lbl = { fontSize: 13, fontWeight: 700, color: "#374151", display: "block" };
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} style={{ width: "min(580px,100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>✉️ 寄信給客人</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={lbl}>常用範本
            <select className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} defaultValue="" onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}>
              {EMAIL_TEMPLATES.map(t => <option key={t.id || "_"} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={lbl}>收件 Email
            <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" />
          </label>
          <label style={lbl}>主旨
            <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="例如：您的課程訂單尚未完成付款" />
          </label>
          <label style={lbl}>內文<span style={{ fontWeight: 400, color: "#94a3b8" }}>（Markdown：# 標題、**粗體**、- 清單、--- 分隔線）</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "vertical" }} placeholder={"嗨，\n\n感謝您的支持！我們注意到您的訂單尚未完成付款。\n\n以下是您的付款連結：…\n\n如有任何問題，直接回覆此信即可。"} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className={styles.btnSmall} onClick={onClose} disabled={busy}>取消</button>
            <button className={`${styles.btnSmall} ${styles.green}`} onClick={send} disabled={busy}>{busy ? "寄送中…" : "寄送"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
// 批次追單：對一批未付款/失敗訂單的消費者一次寄出同一封追單信。
function BulkFollowupModal({ open, recipients = [], onClose, showToast }) {
  const FOLLOWUP = EMAIL_TEMPLATES.find(t => t.id === "followup");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (open) { setSubject(FOLLOWUP?.subject || ""); setBody(FOLLOWUP?.body || ""); setBusy(false); setResult(null); }
  }, [open]);
  function applyTemplate(id) { const t = EMAIL_TEMPLATES.find(x => x.id === id); if (t && t.id) { setSubject(t.subject); setBody(t.body); } }
  if (!open) return null;

  async function send() {
    if (busy) return;
    if (!recipients.length) { showToast?.("❌ 沒有可追單的收件人"); return; }
    if (!subject.trim() || !body.trim()) { showToast?.("❌ 請填寫主旨與內文"); return; }
    if (!window.confirm(`確定要對 ${recipients.length} 位未付款顧客寄出追單信嗎？`)) return;
    setBusy(true); setResult(null);
    try {
      const res = await _api("/api/admin/bulk-followup", { method: "POST", body: JSON.stringify({ emails: recipients, subject: subject.trim(), bodyMd: body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) { showToast?.("❌ 批次寄送失敗：" + (d.error || "unknown")); setBusy(false); return; }
      setResult(d);
      showToast?.(`✅ 已寄出 ${d.sent}/${d.total}${d.failed?.length ? `，失敗 ${d.failed.length}` : ""}`);
    } catch (e) { showToast?.("❌ 批次寄送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const lbl = { fontSize: 13, fontWeight: 700, color: "#374151", display: "block" };
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} style={{ width: "min(580px,100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>📨 批次追單</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {result ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 14, color: "#374151" }}>已寄出 <b style={{ color: "#16a34a" }}>{result.sent}</b> / {result.total} 封{result.failed?.length ? <>，失敗 <b style={{ color: "#dc2626" }}>{result.failed.length}</b></> : null}。</div>
            {result.failed?.length ? (
              <div style={{ maxHeight: 160, overflow: "auto", fontSize: 12, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: 10 }}>
                {result.failed.map((f, i) => <div key={i}>{f.to}：{f.error}</div>)}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className={styles.btnSmall} onClick={onClose}>關閉</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
              將寄給目前篩選出的 <b>{recipients.length}</b> 位未付款／付款失敗顧客（已自動去重）。
            </div>
            <label style={lbl}>常用範本
              <select className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} defaultValue="" onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}>
                {EMAIL_TEMPLATES.map(t => <option key={t.id || "_"} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label style={lbl}>主旨
              <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="例如：您的課程訂單尚未完成付款" />
            </label>
            <label style={lbl}>內文<span style={{ fontWeight: 400, color: "#94a3b8" }}>（Markdown：# 標題、**粗體**、- 清單、--- 分隔線）</span>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className={styles.btnSmall} onClick={onClose} disabled={busy}>取消</button>
              <button className={`${styles.btnSmall} ${styles.green}`} onClick={send} disabled={busy || !recipients.length}>{busy ? "寄送中…" : `寄給 ${recipients.length} 位`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
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
          <button className={styles.btnSmall} onClick={fetchVideos}><RefreshCw size={13}/> 重新整理</button>
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
                    {v.vimeo_id&&<a href={`https://vimeo.com/${v.vimeo_id}`} target="_blank" rel="noreferrer" className={styles.btnSmall} style={{padding:"4px 8px",fontSize:12}}><Eye size={11}/></a>}
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
// 學員管理：實際學員（有 enrollment 課程存取的人，含 concert/WordPress 現場購買者）∪ 體驗名單。
// 自帶資料來源 /api/admin/students（合併 enrollments + 已付款 orders + course_preview_leads），
// 不再只讀 course_preview_leads —— 開通課程後現場購買者即可在此出現。
function StudentsPage({showToast}){
  const [students,setStudents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
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
    const rows=[head,...display.map(s=>[s.email,s.phone||"",s.plan_label||"",s.source||"",statusLabel(s.status),s.purchased?"是":"否",s.created_at||""])];
    const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    dlRef.current.href=url;dlRef.current.download="inrecord_students.csv";dlRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);showToast?.("✅ 已匯出 CSV");
  }

  const now=new Date();
  const thisMonth=students.filter(s=>{const d=new Date(s.created_at||0);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  const purchased=students.filter(s=>s.purchased);

  const display=useMemo(()=>students.map(s=>({...s,name:(s.email?.split("@")[0])||"—",purchasedCount:s.purchased?1:0})),[students]);
  const filtered=display.filter(s=>!search||s.email?.toLowerCase().includes(search.toLowerCase())||s.name?.toLowerCase().includes(search.toLowerCase()));

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>學員管理</h1><p>共 {students.length} 位學員</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={load}><RefreshCw size={13}/> 重新整理</button>
          <button className={styles.btnSmall} onClick={exportCsv}><Download size={13}/> 匯出 CSV</button>
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
          <span className={styles.dim}>共 {filtered.length} 位</span>
        </div>
        {loading?<p style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</p>:(
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th></th><th>姓名</th><th>Email</th><th>電話</th><th>已購課程數</th><th>狀態</th><th>建立時間</th><th>操作</th></tr></thead>
              <tbody>
                {!filtered.length?<tr><td colSpan={8} className={styles.empty}><span className={styles.emptyIcon}>👥</span><span className={styles.emptyTitle}>還沒有任何學員</span><span className={styles.emptySub}>尚無名單資料</span></td></tr>
                :filtered.map(s=>(
                  <tr key={s.id}>
                    <td><div className={styles.studentAvatar}>{s.name[0]?.toUpperCase()}</div></td>
                    <td><strong>{s.name}</strong></td>
                    <td className={styles.dim}>{s.email}</td>
                    <td className={styles.dim}>{s.phone||"—"}</td>
                    <td><span className={styles.courseBadge}>{s.purchasedCount}</span></td>
                    <td><span className={`${styles.pill} ${styles[s.status]||styles.requested}`}>{statusLabel(s.status)}</span></td>
                    <td className={styles.dim}>{fmt(s.created_at)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className={styles.btnSmall} onClick={()=>setDetailStudent(s)}><Eye size={12}/> 詳情</button>
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
                ["來源",detailStudent.source||"—"],
                ["建立時間",fmt(detailStudent.created_at)],
              ].map(([label,val])=>(
                <div key={label} style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:8,fontSize:14,borderBottom:"1px solid #f8fafc",paddingBottom:10}}>
                  <span style={{color:"#64748b",fontWeight:700}}>{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
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

// ── Order status pill helper ───────────────────────────────────────────────
function OrderStatusPill({status}){
  const MAP={paid:["已付款","#dcfce7","#166534"],pending:["待付款","#fef3c7","#92400e"],refunded:["已退款","#dbeafe","#1e40af"],failed:["付款失敗","#fee2e2","#991b1b"],cancelled:["已取消","#f1f5f9","#475569"]};
  const [label,bg,fg]=MAP[status]||MAP.pending;
  return <span className={styles.pill} style={{background:bg,color:fg}}>{label}</span>;
}

// ── Orders Page ────────────────────────────────────────────────────────────
// 手動開通課程：外部站台(concert-shop/現場)已成交但名單沒進來時，直接輸入 Email 開通。
function ManualGrantCard({reload,showToast}){
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
        if(doGrant) parts.push(d.alreadyGranted?"⚠️ 此 Email 已開通過（未重複建立）":"✅ 已開通課程存取");
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
function WordpressLeadsPanel({rows,reload,showToast}){
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

function OrdersPage({leads,showToast}){
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
  const PER=20;

  const loadOrders=useCallback(async()=>{
    try{
      const res=await _api("/api/admin/orders");
      if(!res.ok)throw new Error("fetch_failed");
      const{data}=await res.json();
      setRows(data||[]);
    }catch{
      // 後端尚未部署 / 無資料表：以 leads 衍生顯示（無發票資訊）
      setRows((leads||[]).filter(l=>l.purchased||l.status==="purchased").map((l,i)=>({
        id:`LEAD-${i+1}`,mer_trade_no:`ORD-REAL-${String(i+1).padStart(3,"0")}`,email:l.email,plan_label:"零基礎流行鋼琴入門課",amount:3000,pay_type:"信用卡",status:"paid",created_at:l.purchased_at||l.updated_at||l.created_at,
      })));
    }
  },[leads]);

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

  async function refundOrder(realId){
    if(!realId||refunding)return;
    if(!window.confirm("確定要對此訂單申請退款嗎？\n退款成功後將同步撤銷該學員的課程／遊戲存取，且無法復原。"))return;
    setRefunding(true);
    try{
      const res=await _api("/api/admin/refund",{method:"POST",body:JSON.stringify({id:realId})});
      const d=await res.json();
      if(res.ok&&d.ok){await loadOrders();setDetailOrder(null);showToast?.("✅ "+(d.method==="cancel"?"已取消授權（未請款）":"退款成功")+"，存取已撤銷");}
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
    student:o.buyer_name||o.email?.split("@")[0]||"學員",
    email:o.email,
    course:o.plan_label||"從零開始學鋼琴",
    amount:Number(o.amount)||0,
    method:o.pay_type||"—",
    status:o.status||"pending",
    time:fmt(o.created_at||o.updated_at),
    createdRaw:o.created_at||o.updated_at, // 原始時間，供日期篩選（顯示用 time 已在地化，不可拿來 new Date）
    invoiceNo:o.invoice_no||"",
    invoiceError:o.invoice_error||"",
    emailError:o.email_error||"",
    needInvoice:(o.status==="paid" && !o.invoice_no && !LEAD_SOURCES.includes(o.source)), // 已付款但未開票（待補開）；外部來源由各站自行開票，不列告警
    proofUrl:o.proof_url||null,
    fanReview:o.fan_review||null,
  })),[rows]);

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
          <button className={styles.btnSmall} onClick={exportOrders}><Download size={13}/> 匯出 CSV</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        <StatCard label="總營收" value={`NT$ ${totalRev.toLocaleString()}`} sub="所有已付款" icon={DollarSign} color="#16a34a"/>
        <StatCard label="已付款訂單" value={paid.length} sub="筆" icon={CheckCircle2} color="#2563eb"/>
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
          <button className={styles.btnSmall} onClick={exportReconciliation}><Download size={13}/> 匯出對帳 CSV</button>
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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>訂單編號</th><th>學員</th><th>課程</th><th>金額</th><th>付款方式</th><th>狀態</th><th>發票號碼</th><th>建立時間</th><th>操作</th></tr></thead>
            <tbody>
              {!filtered.length?<tr><td colSpan={9} className={styles.empty}><span className={styles.emptyIcon}>📋</span><span className={styles.emptyTitle}>還沒有任何訂單</span><span className={styles.emptySub}>＋ 等待第一筆購買</span></td></tr>
              :pageRows.map(o=>(
                <tr key={o.id}>
                  <td><code style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{o.id}</code></td>
                  <td><div style={{fontWeight:700,fontSize:13}}>{o.student}</div><div style={{fontSize:12,color:"#94a3b8"}}>{o.email}</div></td>
                  <td className={styles.dim} style={{maxWidth:160,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.course}</td>
                  <td style={{fontWeight:800}}>NT$ {o.amount.toLocaleString()}</td>
                  <td className={styles.dim}>{o.method}</td>
                  <td><OrderStatusPill status={o.status}/></td>
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
                  <td><button className={styles.btnSmall} onClick={()=>setDetailOrder(o)}><Eye size={12}/> 查看</button></td>
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
              {detailOrder.status==="paid"&&detailOrder.realId&&<button className={`${styles.btnSmall} ${styles.btnDanger}`} disabled={refunding} onClick={()=>refundOrder(detailOrder.realId)}>{refunding?"退款中…":"申請退款"}</button>}
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

// ── Coupons Page ───────────────────────────────────────────────────────────
function CouponsPage({ showToast }){
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

  async function confirmDeleteBatch(){
    try{
      const r=await _api(`/api/admin/coupon-batches?id=${deleteBatch.id}`,{method:"DELETE"});
      if(!r.ok)throw new Error();
      showToast?.("✅ 批次已刪除");setDeleteBatch(null);
      if(expandId===deleteBatch.id){setExpandId(null);setExpandCodes([]);}
      fetchBatches();
    }catch{showToast?.("❌ 刪除失敗");}
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
  async function confirmDelete(){
    try{
      const r=await _api(`/api/admin/coupons?id=${deleteId}`,{method:"DELETE"});
      if(!r.ok)throw new Error();
      showToast?.("✅ 優惠券已刪除");setDeleteId(null);fetchCoupons();
    }catch{showToast?.("❌ 刪除失敗");}
  }

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>優惠券管理</h1><p>建立與管理折扣代碼（結帳時自動套用）</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchCoupons}><RefreshCw size={13}/> 重新整理</button>
          <button className={styles.btnPrimary} onClick={()=>setShowCreate(true)}><Plus size={14}/> 新增優惠券</button>
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
                      <button className={styles.iconBtn} onClick={()=>{navigator.clipboard?.writeText(c.code)}} title="複製"><Copy size={12}/></button>
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
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteId(c.id)}><Trash2 size={12}/></button>
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
          <button className={styles.btnSmall} onClick={fetchBatches}><RefreshCw size={13}/> 重新整理</button>
          <button className={styles.btnPrimary} onClick={()=>setShowBatchCreate(true)}><Plus size={14}/> 新增批次</button>
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
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteBatch(b)}><Trash2 size={12}/></button>
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
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteId(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete}>確認刪除</button></div>
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
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteBatch(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDeleteBatch}>確認刪除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subscriptions Page ────────────────────────────────────────────────────
function SubscriptionsPage({ showToast }) {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", plan_type: "bundle", expires_at: "2999-12-31" });
  const [addErr, setAddErr]   = useState("");
  const [acting, setActing]   = useState(null);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await _api("/api/admin/subscriptions");
      const { data } = await r.json();
      setSubs(data || []);
    } catch { setSubs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const now = new Date();

  const isLive = s => s.status === "active" && new Date(s.expires_at) > now;

  const filtered = useMemo(() => {
    if (filter === "active")  return subs.filter(isLive);
    if (filter === "expired") return subs.filter(s => !isLive(s));
    return subs;
  }, [subs, filter, now]);

  const activeCount = subs.filter(isLive).length;
  const thisMonth   = subs.filter(s => { const d = new Date(s.created_at || 0); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const bundleCount = subs.filter(s => s.plan_type === "bundle" && isLive(s)).length;
  const gameCount   = subs.filter(s => s.plan_type === "game"   && isLive(s)).length;

  const planLabel = { bundle: "學琴全攻略", game: "互動遊戲", monthly: "月繳", yearly: "年繳", gift: "贈送" };

  async function extendOne(id) {
    setActing(id + "_extend");
    try {
      const r = await _api("/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "extend_month" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已延長 1 個月"); fetchSubs();
    } catch (e) { showToast("❌ " + (e.message || "操作失敗")); }
    finally { setActing(null); }
  }

  async function cancelOne(id) {
    if (!window.confirm("確定要取消這筆遊戲存取嗎？\n學員將立即失去遊戲權限，且無法復原。")) return;
    setActing(id + "_cancel");
    try {
      const r = await _api("/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "cancel" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已取消訂閱"); fetchSubs();
    } catch (e) { showToast("❌ " + (e.message || "操作失敗")); }
    finally { setActing(null); }
  }

  async function handleAdd(e) {
    e.preventDefault(); setAddErr("");
    if (!addForm.email.trim()) { setAddErr("請輸入 Email"); return; }
    if (!addForm.expires_at)   { setAddErr("請選擇到期日"); return; }
    try {
      const r = await _api("/api/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify(addForm),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已新增遊戲存取");
      setShowAdd(false);
      setAddForm({ email: "", plan_type: "bundle", expires_at: "2999-12-31" });
      fetchSubs();
    } catch (e) { setAddErr(e.message || "新增失敗"); }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>遊戲存取</h1><p>管理已購買互動遊戲的學員存取</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchSubs}><RefreshCw size={13}/> 重新整理</button>
          <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}><Plus size={14}/> 手動新增</button>
        </div>
      </div>

      <div className={styles.statsGrid4}>
        <StatCard label="有效存取人數" value={activeCount} sub="目前有效" icon={Users} color="#16a34a"/>
        <StatCard label="本月新增"     value={thisMonth}   sub="新增存取數" icon={TrendingUp} color="#2563eb"/>
        <StatCard label="課程包永久"   value={bundleCount} sub="課程＋遊戲" icon={GraduationCap} color="#f59e0b"/>
        <StatCard label="遊戲單買永久" value={gameCount}   sub="互動遊戲" icon={CreditCard} color="#7c3aed"/>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead} style={{ flexWrap: "wrap", gap: 12 }}>
          <div className={styles.tabGroup}>
            {[
              ["all",     "全部"],
              ["active",  "有效"],
              ["expired", "已失效"],
            ].map(([key, label]) => (
              <button key={key}
                className={`${styles.tab} ${filter === key ? styles.tabActive : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className={styles.dim}>共 {filtered.length} 筆</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>方案</th>
                <th>狀態</th>
                <th>到期日</th>
                <th>剩餘天數</th>
                <th>來源</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className={styles.empty}>載入中…</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={7} className={styles.empty}><span className={styles.emptyIcon}>🎮</span><span className={styles.emptyTitle}>還沒有任何訂閱</span><span className={styles.emptySub}>學員訂閱互動遊戲後將在這裡顯示</span></td></tr>
              ) : filtered.map(s => {
                const expDate  = new Date(s.expires_at);
                const isActive = s.status === "active" && expDate > now;
                const daysLeft = isActive ? Math.ceil((expDate - now) / 86400000) : 0;
                const isSoon   = isActive && daysLeft <= 7;
                return (
                  <tr key={s.id}>
                    <td style={{ fontSize: 13 }}>{s.email}</td>
                    <td>
                      <span className={styles.pill} style={{
                        background: s.plan_type === "bundle" ? "#fef3c7" : s.plan_type === "game" ? "#eff6ff" : "#f1f5f9",
                        color: s.plan_type === "bundle" ? "#92400e" : s.plan_type === "game" ? "#1d4ed8" : "#475569",
                      }}>
                        {planLabel[s.plan_type] || s.plan_type}
                      </span>
                    </td>
                    <td>
                      <span className={styles.pill} style={{
                        background: isActive ? "#dcfce7" : "#fee2e2",
                        color: isActive ? "#166534" : "#991b1b",
                      }}>
                        {isActive ? "訂閱中" : "已到期"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {expDate.toLocaleDateString("zh-TW")}
                    </td>
                    <td>
                      {isActive ? (
                        <span style={{ color: isSoon ? "#dc2626" : "#374151", fontWeight: isSoon ? 700 : 400 }}>
                          {daysLeft} 天{isSoon ? " ⚠️" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className={styles.dim} style={{ fontSize: 12 }}>{s.source || "—"}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className={styles.btnSmall}
                          disabled={acting === s.id + "_extend"}
                          onClick={() => extendOne(s.id)}
                        >
                          +1月
                        </button>
                        {isActive && (
                          <button
                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                            disabled={acting === s.id + "_cancel"}
                            onClick={() => cancelOne(s.id)}
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className={styles.modalOverlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modalCard} style={{ width: "min(480px,100%)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>手動新增遊戲存取</h3>
              <button className={styles.iconBtn} onClick={() => setShowAdd(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleAdd} style={{ display: "grid", gap: 14 }}>
              <div className={styles.formGroup}>
                <label>Email *</label>
                <input className={styles.input} type="email" value={addForm.email}
                  onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="student@example.com"/>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>方案</label>
                  <select className={styles.selectInput} style={{ width: "100%" }} value={addForm.plan_type}
                    onChange={e => setAddForm(p => ({ ...p, plan_type: e.target.value }))}>
                    <option value="bundle">學琴全攻略（課程＋遊戲）</option>
                    <option value="game">互動遊戲</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>到期日 *</label>
                  <input className={styles.input} type="date" value={addForm.expires_at}
                    onChange={e => setAddForm(p => ({ ...p, expires_at: e.target.value }))}/>
                  <span style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, display: "block" }}>永久存取請填 <code style={{ background:"#f1f5f9", padding:"1px 5px", borderRadius:4 }}>2999-12-31</code></span>
                </div>
              </div>
              {addErr && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{addErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={() => setShowAdd(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary}>新增存取</button>
              </div>
            </form>
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
                    <td><a href="/" target="_blank" className={styles.btnSmall}><Eye size={12}/> 查看課程</a></td>
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

  async function testPayuni(){setPayuniMsg("測試中…");setPayuniStatus("testing");try{const res=await fetch("/api/payuni/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan:"course",price:3800,label:"後台測試",email:"_test_admin@gmail.com"})});const d=await res.json();if(res.ok&&d.url&&d.fields){setPayuniStatus("ok");setPayuniMsg("✅ Payuni 連線正常");}else throw new Error(d.error||"checkout_failed");}catch(e){setPayuniStatus("error");setPayuniMsg("❌ "+(e.message.includes("fetch")?"後端尚未部署":e.message));}}
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
        <div style={s2.testRow}><button onClick={testPayuni} style={{border:0,background:"#D4192C",color:"#fff",borderRadius:10,padding:"9px 14px",fontWeight:900,cursor:"pointer"}}>🔍 測試 Payuni 連線</button>{payuniMsg&&<span style={{fontSize:13,fontWeight:800,color:payuniStatus==="ok"?"#16a34a":"#dc2626"}}>{payuniMsg}</span>}</div>
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
const DEFAULT_PRIVACY_MD =
`# 隱私權政策

**InRecord｜零基礎流行鋼琴入門課**

最後更新日期：2026 年 5 月 1 日

---

## 1. 適用範圍

本隱私權政策適用於 InRecord（以下簡稱「本平台」）所提供之線上鋼琴課程服務，包括課程試看申請、購買、學習及相關客服互動。使用本平台即表示您同意本政策之內容。

---

## 2. 蒐集的個人資料

當您使用本平台服務時，我們可能蒐集以下資料：

- **Gmail 地址**：您填寫課程試看申請表單時主動提供。
- **購買資訊**：透過 Payuni 統一金流處理，本平台不儲存完整信用卡號碼。
- **使用紀錄**：課程頁瀏覽行為與影片觀看紀錄（用於改善課程體驗）。
- **裝置資訊**：瀏覽器類型、作業系統、IP 位址（僅用於系統安全與統計）。

---

## 3. 資料使用目的

蒐集的個人資料將用於以下用途：

- 寄送課程試看連結及相關學習資訊。
- 處理課程購買訂單與開立收據。
- 提供售後客服與技術支援。
- 發送重要課程更新或促銷通知（可隨時退訂）。
- 改善課程內容與平台使用體驗。

---

## 4. 資料分享與第三方服務

本平台使用以下第三方服務處理部分資料：

- **Payuni 統一金流**：金流支付處理，受 Payuni 隱私權政策保護。
- **Brevo**：Email 名單管理與自動化郵件寄送。
- **Supabase**：PostgreSQL 資料庫儲存，採用業界標準加密。
- **Google Analytics / Meta Pixel**：網站流量與廣告成效分析（可透過瀏覽器設定退出）。

本平台不會將您的個人資料出售、出租或以任何形式交換給第三方商業機構。

---

## 5. Cookie 與追蹤技術

本平台使用 Cookie 及類似技術以：

- 維持您的課程存取狀態。
- 分析網站使用情況以改善服務。
- 提供個人化學習體驗。

您可透過瀏覽器設定拒絕或刪除 Cookie，但部分功能可能因此受限。

---

## 6. 資料保存期限

- 試看申請資料：自申請日起保存 **2 年**。
- 購買訂單資料：依電商交易法規保存 **5 年**。
- 您可隨時要求提前刪除個人資料（詳見第 7 條）。

---

## 7. 您的權利

依據個人資料保護法，您享有以下權利：

- **查詢或閱覽**您的個人資料。
- **請求複製**您的個人資料。
- **請求補充或更正**不正確的個人資料。
- **請求刪除**您的個人資料。
- **請求停止蒐集、處理或使用**您的個人資料。

如需行使上述權利，請透過 Email 聯絡我們，我們將於 **7 個工作天內**回覆處理。

---

## 8. 未成年人保護

本平台服務適用年齡為 13 歲以上。若您未滿 13 歲，請勿提供個人資料，並請由家長或監護人代為操作。

---

## 9. 隱私權政策異動

本平台保留隨時修改本政策之權利。重大異動時，將透過 Email 或網站公告通知您。繼續使用本服務即表示您同意修訂後的政策。

---

## 10. 聯絡我們

如對本隱私權政策有任何疑問，請透過以下方式聯繫：

- **Email**：inrecmusic@gmail.com
- **Instagram**：@inrec.music
- 服務時間：週一至週五 10:00–18:00`;

const DEFAULT_TERMS_MD =
`# 服務條款

**InRecord｜零基礎流行鋼琴入門課**

最後更新日期：2026 年 5 月 1 日

---

## 1. 服務說明

InRecord（以下簡稱「本平台」）提供零基礎流行鋼琴線上課程的試看、購買與學習服務。使用本平台服務，即表示您同意遵守本服務條款。

---

## 2. 課程存取

- 本平台課程以 **Email 連結** 形式授權，每組購買僅限購買人本人使用。
- 請勿將課程連結或存取資訊分享、轉讓或販售給他人。
- 課程存取效期為購買日起 **永久有效**（本平台正常營運期間）。

---

## 3. 課程購買與付款

- 所有課程費用以**新台幣（TWD）**計價。
- 付款透過 **Payuni 統一金流**安全處理，支援信用卡、ATM 轉帳、超商繳費。
- 訂單成立後，系統將自動寄送購買確認信至您的 Email。
- 課程售價可能依早鳥或促銷方案調整，恕不另行通知。

---

## 4. 退款政策

- 課程購買後 **7 天內**，如對課程內容不滿意，可申請全額退款。
- 退款申請請 Email 至 inrecmusic@gmail.com，說明購買日期及退款原因。
- 超過 7 天後恕不受理退款申請。
- 已完整觀看超過 **50% 課程內容**者，本平台保留拒絕退款之權利。

---

## 5. 智慧財產權

- 本平台所有課程影片、講義、圖文內容之著作權均歸 **InRecord** 所有。
- 嚴禁以任何形式錄製、截圖、重製、翻譯或散布課程內容。
- 嚴禁將課程內容用於商業目的、教學授課或二次販售。
- 違反著作權相關規定者，本平台保留追究民事及刑事責任之權利。

---

## 6. 使用規範

使用本平台服務，您同意不得：

- 以任何技術手段繞過課程存取限制或 DRM 保護。
- 使用自動化工具（爬蟲、Bot）存取本平台內容。
- 散布不實評論或惡意影響本平台商譽。
- 干擾、攻擊或破壞本平台正常運作。

---

## 7. 課程內容異動

- 本平台保留更新、修改或補充課程內容之權利，以確保內容品質與時效性。
- 重大內容調整將提前透過 Email 通知已購課學員。

---

## 8. 服務中斷與免責聲明

- 本平台課程內容僅供教學參考，不保證特定練習成果或演奏水準。
- 對因網路中斷、系統維護或不可抗力因素（天災、疫情等）造成之服務中斷，本平台不負賠償責任，但將盡速公告並處理。

---

## 9. 準據法與管轄

本服務條款依**中華民國法律**解釋，如發生爭議，雙方同意以**台灣台北地方法院**為第一審管轄法院。

---

## 10. 聯絡方式

如對本服務條款有任何疑問：

- **Email**：inrecmusic@gmail.com
- **Instagram**：@inrec.music
- 服務時間：週一至週五 10:00–18:00`;

// ── Markdown renderer ──────────────────────────────────────────────────────
function renderMd(text){
  const lines=text.split("\n");
  const out=[];let listBuf=[];let key=0;
  function flush(){if(!listBuf.length)return;out.push(<ul key={key++} style={{margin:"6px 0 14px",paddingLeft:22,display:"grid",gap:5}}>{listBuf}</ul>);listBuf=[];}
  function inline(s){
    const parts=[];
    s.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).forEach((p,i)=>{
      if(p.startsWith("**")&&p.endsWith("**")&&p.length>4)parts.push(<strong key={i}>{p.slice(2,-2)}</strong>);
      else if(p.startsWith("*")&&p.endsWith("*")&&p.length>2)parts.push(<em key={i}>{p.slice(1,-1)}</em>);
      else parts.push(p);
    });
    return parts;
  }
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(l.startsWith("# ")){flush();out.push(<h1 key={key++} style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-.03em"}}>{inline(l.slice(2))}</h1>);}
    else if(l.startsWith("## ")){flush();out.push(<h2 key={key++} style={{fontSize:16,fontWeight:900,color:"#0f172a",margin:"24px 0 8px",paddingBottom:7,borderBottom:"1px solid #f1f5f9"}}>{inline(l.slice(3))}</h2>);}
    else if(l.startsWith("### ")){flush();out.push(<h3 key={key++} style={{fontSize:14,fontWeight:800,color:"#1e293b",margin:"14px 0 5px"}}>{inline(l.slice(4))}</h3>);}
    else if(l.trim()==="---"){flush();out.push(<hr key={key++} style={{border:"none",borderTop:"1px solid #e2e8f0",margin:"16px 0"}}/>);}
    else if(l.startsWith("- ")){listBuf.push(<li key={key++} style={{fontSize:14,color:"#374151",lineHeight:1.75}}>{inline(l.slice(2))}</li>);}
    else if(l.trim()===""){flush();}
    else{flush();out.push(<p key={key++} style={{fontSize:14,color:"#374151",lineHeight:1.8,margin:"0 0 10px"}}>{inline(l)}</p>);}
  }
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

// 電子報：編輯標題+Markdown 內文 → 群發給「購課學員 / 註冊官網帳號」。逐封寄(A 方案)，碰每日上限即回報。
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
  const dirty=subject!==savedSubject||bodyMd!==savedBody;

  const load=useCallback(async()=>{
    try{
      const res=await _api("/api/admin/newsletter");
      const {data}=await res.json();
      setSubject(data.subject||"");setBodyMd(data.body_md||"");
      setSavedSubject(data.subject||"");setSavedBody(data.body_md||"");
      if(data.last_sent_at)setLastSent({at:data.last_sent_at,count:data.last_sent_count});
    }catch{}
  },[]);
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
    if(!subject.trim()||!bodyMd.trim()){showToast?.("請先填標題與內文");return;}
    setBusy("test");setResult(null);
    try{
      await persist();
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({test:true})});
      const d=await res.json();
      if(d.ok)showToast?.("✅ 測試信已寄到 "+(d.to||"管理員信箱"));
      else showToast?.("❌ 測試寄送失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 測試寄送失敗："+e.message);} finally{setBusy("");}
  }
  async function sendAll(){
    if(!subject.trim()||!bodyMd.trim()){showToast?.("請先填標題與內文");return;}
    const label=audience==="buyers"?"購課學員":"註冊官網帳號";
    if(!window.confirm(`確定把這封電子報「正式群發」給【${label}】嗎？\n寄出後無法收回，建議先用「寄測試給我自己」確認版面。`))return;
    setBusy("all");setResult(null);
    try{
      await persist();
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({audience})});
      const d=await res.json();
      if(!d.ok){showToast?.("❌ 群發失敗："+(d.error||"unknown"));}
      else{
        setResult(d);
        if(d.total===0)showToast?.("名單為空，沒有寄出");
        else if(d.limitHit)showToast?.(`⚠️ 已寄 ${d.sent} 封，剩 ${d.total-d.sent} 封未寄（碰到每日上限）`);
        else showToast?.(`✅ 群發完成：成功 ${d.sent}/${d.total}${d.failed?`，失敗 ${d.failed}`:""}`);
        await load();
      }
    }catch(e){showToast?.("❌ 群發失敗："+e.message);} finally{setBusy("");}
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
        <label style={{display:"block",fontSize:13,fontWeight:700,color:"#475569",marginBottom:6}}>標題</label>
        <input className={styles.searchInput} style={{width:"100%",marginBottom:16}} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="例：六月課程最新消息 🎹"/>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:"#475569",marginBottom:6}}>內文（Markdown：# 標題 / **粗體** / - 清單 / --- 分隔線）</label>
        {mode==="edit"
          ?<textarea value={bodyMd} onChange={e=>setBodyMd(e.target.value)} style={{width:"100%",minHeight:360,fontFamily:"'Courier New',Consolas,monospace",fontSize:13,lineHeight:1.75,boxSizing:"border-box",resize:"vertical",border:"1px solid #e2e8f0",borderRadius:10,padding:12}}/>
          :<div style={{maxWidth:760,padding:"4px 0"}}>{renderMd(bodyMd)}</div>}
      </div>

      <div className={styles.panel}>
        <h3 style={{margin:"0 0 12px"}}>群發</h3>
        <div style={{display:"flex",gap:18,flexWrap:"wrap",marginBottom:14}}>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="buyers"} onChange={()=>setAudience("buyers")}/> 🎓 購課學員</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="registered"} onChange={()=>setAudience("registered")}/> 👤 註冊官網帳號</label>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className={styles.btnSmall} disabled={!!busy} onClick={sendTest}>{busy==="test"?"寄送中…":"寄測試給我自己"}</button>
          <button className={styles.btnPrimary} disabled={!!busy} onClick={sendAll}>{busy==="all"?"群發中…":"正式群發"}</button>
        </div>
        {lastSent&&<p className={styles.dim} style={{fontSize:12,marginTop:12}}>上次寄送：{fmt(lastSent.at)}（{lastSent.count} 封）</p>}
        {result&&<div style={{marginTop:12,fontSize:13,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
          本次：對象 {result.total} 人 · 成功 {result.sent} · 失敗 {result.failed}{result.limitHit?` · ⚠️ 碰每日上限，剩 ${result.total-result.sent} 未寄`:""}
        </div>}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function statusLabel(s){return{requested:"已留 Email",preview_mode:"預覽模式",email_sent:"已寄試看信",demo_opened:"已開 Demo",purchased:"已購買"}[s]||s||"—";}
function fmt(v){if(!v)return "—";try{return new Date(v).toLocaleString("zh-TW");}catch{return v;}}

// ── Course Detail Page (classroom sub-pages) ──────────────────────────────
const COURSE_TABS = [
  { id:"chapters",     label:"章節與單元管理", icon:List },
  { id:"assignments",  label:"作業設定",       icon:ClipboardList },
  { id:"unitcomments", label:"單元評論",       icon:MessageSquare },
  { id:"ratings",      label:"課程評價",       icon:Star },
  { id:"games",        label:"互動遊戲",        icon:Gamepad2 },
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
      setData(d);
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
        <div className={styles.pageActions}><button className={styles.btnSmall} onClick={load}><RefreshCw size={13}/> 重新整理</button></div>
      </div>
      <div className={styles.filterGroup} style={{marginBottom:14}}>
        <button className={`${styles.filterBtn} ${tab==="audit"?styles.filterActive:""}`} onClick={()=>setTab("audit")}>操作紀錄</button>
        <button className={`${styles.filterBtn} ${tab==="email"?styles.filterActive:""}`} onClick={()=>setTab("email")}>寄信紀錄</button>
      </div>
      <div className={styles.panel}>
        <div className={styles.tableWrap}>
          {tab==="audit"?(
          <table className={styles.table}>
            <thead><tr><th>時間</th><th>操作者</th><th>動作</th><th>對象</th><th>細節</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={5} style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</td></tr>
              :loadErr?<tr><td colSpan={5} style={{textAlign:"center",padding:28,color:"#dc2626"}}>⚠️ {loadErr}　<button className={styles.btnSmall} onClick={load}>重試</button></td></tr>
              :!rows.length?<tr><td colSpan={5} className={styles.empty}><span className={styles.emptyIcon}>📋</span><span className={styles.emptyTitle}>尚無操作紀錄</span><span className={styles.emptySub}>敏感操作後會在此留痕</span></td></tr>
              :rows.map(r=>(
                <tr key={r.id}>
                  <td className={styles.dim} style={{whiteSpace:"nowrap",fontSize:12}}>{fmt(r.created_at)}</td>
                  <td style={{fontSize:13}}>{r.actor_email||"—"}</td>
                  <td><code style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{r.action}</code></td>
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
              {loading?<tr><td colSpan={5} style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</td></tr>
              :loadErr?<tr><td colSpan={5} style={{textAlign:"center",padding:28,color:"#dc2626"}}>⚠️ {loadErr}　<button className={styles.btnSmall} onClick={load}>重試</button></td></tr>
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
const TOKEN_KEY = "inrecord_admin_token";
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
  const failedInvoiceCount=orders.filter(o=>o.status==="paid"&&!o.invoice_no).length; // 已付款待補開發票

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
            : <CoursesPage leads={leads} onManage={c=>{setSelectedCourse(c);}} showToast={showToast}/>
          )}
          {page==="messages"    &&<MessagesPage showToast={showToast}/>}
          {page==="media"       &&<MediaPage/>}
          {page==="students"    &&<StudentsPage showToast={showToast}/>}
          {page==="orders"      &&<OrdersPage leads={leads} showToast={showToast}/>}
          {page==="customer"    &&<CustomerLookupPage showToast={showToast}/>}
          {page==="subscriptions"&&<SubscriptionsPage showToast={showToast}/>}
          {page==="coupons"     &&<CouponsPage showToast={showToast}/>}
          {page==="analytics"   &&<AnalyticsPage leads={leads} orders={orders} trendFilter={trendFilter} donutFilter={donutFilter} setTrendFilter={setTrendFilter} setDonutFilter={setDonutFilter}/>}
          {page==="sale"        &&<SaleSettingsPage showToast={showToast}/>}
          {page==="audit"       &&<AuditLogPage/>}
          {page==="integration" &&<IntegrationPage showToast={showToast}/>}
          {page==="privacy"     &&<PrivacyPage showToast={showToast}/>}
          {page==="terms"       &&<TermsPage showToast={showToast}/>}
          {page==="newsletter"  &&<NewsletterPage showToast={showToast}/>}
        </div>
      </div>

      {toast&&<div className={styles.toast}>{toast}</div>}
    </div>
  );
}

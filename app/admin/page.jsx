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
  Trash2, Edit2, Copy, Filter, Percent, List, ClipboardList, Star, MessageSquare
} from "lucide-react";
import ChaptersUnitsPage from "./ChaptersUnitsPage";
import AssignmentsPage from "./AssignmentsPage";
import UnitCommentsPage from "./UnitCommentsPage";
import CourseRatingsPage from "./CourseRatingsPage";


// ── Mock data (串接真實 API 後移除) ────────────────────────────────────────
const INIT_COMMENTS = [
  { id:1, unit:"第 1 課：認識鍵盤與基礎姿勢",   commenter:"林小明", email:"student1@example.com", anonymous:false, realName:"",     time:"2026/04/20 14:32", content:"老師好！請問右手 C 大調音階練習時，第幾指應該跨過？影片裡沒有很清楚。",           status:"unread",  reply:"" },
  { id:2, unit:"第 3 課：基礎和弦 C、F、G",      commenter:"匿名",   email:"yating@example.com",   anonymous:true,  realName:"王雅婷", time:"2026/04/21 09:15", content:"這堂課真的太有用了！一直以為 F 和弦很難，練了三天終於會了 😊",                 status:"replied", reply:"太棒了！F 和弦確實需要一點時間，繼續加油！" },
  { id:3, unit:"第 5 課：節奏型 Bossa Nova",     commenter:"陳大偉", email:"dawei@example.com",    anonymous:false, realName:"",     time:"2026/04/22 20:45", content:"Bossa Nova 的左手分散和弦跟右手旋律要一起練好難，有沒有什麼訣竅？",           status:"unread",  reply:"" },
  { id:4, unit:"第 2 課：五指位置練習",          commenter:"匿名",   email:"anon1@example.com",    anonymous:true,  realName:"蔡建國", time:"2026/04/23 11:08", content:"影片在 3:45 處聲音突然變小，是我的問題還是影片本身的問題？",                   status:"unread",  reply:"" },
  { id:5, unit:"第 7 課：歌曲實作《小星星》",    commenter:"李美玲", email:"meiling@example.com",  anonymous:false, realName:"",     time:"2026/04/24 16:20", content:"終於把小星星完整彈完了！感謝老師的課程，期待下一首歌！",                       status:"replied", reply:"恭喜！下一課會學更多好聽的歌曲喔 🎹" },
  { id:6, unit:"第 4 課：左手伴奏入門",          commenter:"張建志", email:"jianzhih@example.com", anonymous:false, realName:"",     time:"2026/04/25 08:30", content:"左手的 Bass 音加和弦節奏型，請問練習速度要從多少 BPM 開始比較好？",           status:"unread",  reply:"" },
  { id:7, unit:"第 6 課：流行歌曲伴奏技巧",     commenter:"匿名",   email:"secret2@example.com",  anonymous:true,  realName:"吳婷婷", time:"2026/04/26 13:50", content:"老師可以教怎麼練快速換和弦嗎？我每次換到 Am 都來不及。",                       status:"unread",  reply:"" },
  { id:8, unit:"第 1 課：認識鍵盤與基礎姿勢",   commenter:"高志偉", email:"zhiwei@example.com",   anonymous:false, realName:"",     time:"2026/04/27 19:05", content:"課程內容非常紮實！建議可以多加一些練習曲。",                                   status:"replied", reply:"感謝建議！後續會增加更多練習曲目 🎵" },
];

const MOCK_ORDERS = [
  { id:"ORD-20260428-001", student:"林小明", email:"lin@example.com",   course:"零基礎流行鋼琴入門課", amount:3500, method:"信用卡",    status:"paid",    time:"2026/04/28 14:32" },
  { id:"ORD-20260427-002", student:"王雅婷", email:"wang@example.com",  course:"零基礎流行鋼琴入門課", amount:2200, method:"Apple Pay", status:"paid",    time:"2026/04/27 09:15" },
  { id:"ORD-20260426-003", student:"陳大偉", email:"chen@example.com",  course:"零基礎流行鋼琴入門課", amount:2800, method:"信用卡",    status:"paid",    time:"2026/04/26 20:45" },
  { id:"ORD-20260425-004", student:"李美玲", email:"lee@example.com",   course:"零基礎流行鋼琴入門課", amount:3300, method:"Google Pay","status":"refunded",time:"2026/04/25 11:08" },
  { id:"ORD-20260424-005", student:"張建志", email:"zhang@example.com", course:"零基礎流行鋼琴入門課", amount:3100, method:"信用卡",    status:"paid",    time:"2026/04/24 16:20" },
  { id:"ORD-20260423-006", student:"吳婷婷", email:"wu@example.com",    course:"零基礎流行鋼琴入門課", amount:2400, method:"ATM 轉帳",  status:"pending", time:"2026/04/23 08:30" },
  { id:"ORD-20260422-007", student:"高志偉", email:"gao@example.com",   course:"零基礎流行鋼琴入門課", amount:3500, method:"信用卡",    status:"paid",    time:"2026/04/22 13:50" },
  { id:"ORD-20260421-008", student:"劉雅琪", email:"liu@example.com",   course:"零基礎流行鋼琴入門課", amount:2800, method:"Apple Pay", status:"paid",    time:"2026/04/21 19:05" },
  { id:"ORD-20260420-009", student:"蔡建國", email:"tsai@example.com",  course:"零基礎流行鋼琴入門課", amount:2200, method:"信用卡",    status:"failed",  time:"2026/04/20 22:14" },
  { id:"ORD-20260419-010", student:"楊雅雯", email:"yang@example.com",  course:"零基礎流行鋼琴入門課", amount:3500, method:"信用卡",    status:"paid",    time:"2026/04/19 10:05" },
];

const MOCK_COUPONS_INIT = [
  { id:1, name:"早鳥優惠",   code:"EARLYBIRD",  type:"percent", value:10, used:23, limit:100, status:"active",   start:"2026/01/01", end:"2026/06/30" },
  { id:2, name:"粉絲特惠",   code:"FANCLUB",    type:"fixed",   value:300,used:15, limit:50,  status:"active",   start:"2026/03/01", end:"2026/05/31" },
  { id:3, name:"新年快樂",   code:"NY2026",     type:"percent", value:20, used:88, limit:88,  status:"expired",  start:"2026/01/01", end:"2026/02/28" },
  { id:4, name:"學生優惠",   code:"STUDENT",    type:"fixed",   value:500,used:0,  limit:200, status:"disabled", start:"2026/04/01", end:"2026/12/31" },
  { id:5, name:"週年慶折扣", code:"ANNIV15",    type:"percent", value:15, used:42, limit:150, status:"active",   start:"2026/04/15", end:"2026/07/15" },
  { id:6, name:"舊生回購",   code:"RETURN20",   type:"percent", value:20, used:7,  limit:30,  status:"active",   start:"2026/02/01", end:"2026/08/31" },
];

const MOCK_VIDEOS = [
  { id:1, title:"第 1 課：認識鍵盤與基礎姿勢", duration:"12:34", date:"2026/3/1",  size:"320 MB", status:"ready" },
  { id:2, title:"第 2 課：五指位置練習",         duration:"15:20", date:"2026/3/5",  size:"410 MB", status:"ready" },
  { id:3, title:"第 3 課：基礎和弦 C、F、G",     duration:"18:45", date:"2026/3/10", size:"490 MB", status:"ready" },
  { id:4, title:"第 4 課：左手伴奏入門",          duration:"22:10", date:"2026/3/15", size:"580 MB", status:"ready" },
  { id:5, title:"第 5 課：節奏型 Bossa Nova",     duration:"20:33", date:"2026/3/20", size:"540 MB", status:"ready" },
  { id:6, title:"第 6 課：流行歌曲伴奏技巧",     duration:"25:18", date:"2026/3/25", size:"660 MB", status:"ready" },
  { id:7, title:"第 7 課：歌曲實作《小星星》",   duration:"14:55", date:"2026/3/30", size:"390 MB", status:"ready" },
  { id:8, title:"第 8 課：即興創作入門",          duration:"28:44", date:"2026/4/5",  size:"750 MB", status:"ready" },
];

const NAV_GROUPS = [
  { title:"主選單", items:[
    { id:"dashboard",   label:"儀表板",     icon:LayoutDashboard },
    { id:"courses",     label:"課程管理",   icon:BookOpen, badgeKey:"courses" },
    { id:"messages",    label:"留言管理",   icon:MessageCircle, badgeKey:"messages" },
    { id:"media",       label:"媒體中心",   icon:Img },
  ]},
  { title:"學員服務", items:[
    { id:"students",    label:"學員管理",   icon:Users,        badgeKey:"leads" },
    { id:"orders",      label:"訂單管理",   icon:ShoppingCart, badgeKey:"orders" },
    { id:"coupons",     label:"優惠券",     icon:Ticket },
    { id:"analytics",   label:"銷售分析",   icon:TrendingUp },
  ]},
  { title:"設定", items:[
    { id:"integration", label:"系統設定",   icon:Settings },
    { id:"privacy",     label:"隱私權政策", icon:Shield },
    { id:"terms",       label:"服務條款",   icon:FileText },
  ]},
];

// ── Chart helpers ──────────────────────────────────────────────────────────
function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function genChartData(filter) {
  const now = new Date();
  const rand = seededRand(filter.charCodeAt(0) * 17 + 99);
  if (filter === "day") return Array.from({length:24},(_,i)=>{ const h=(now.getHours()-23+i+24)%24; return {label:`${String(h).padStart(2,"0")}:00`,orders:Math.round(rand()*3),revenue:Math.round(rand()*12000+5000)}; });
  if (filter === "week") { const days=["日","一","二","三","四","五","六"]; return Array.from({length:7},(_,i)=>{ const d=new Date(now); d.setDate(d.getDate()-6+i); return {label:`週${days[d.getDay()]}`,orders:Math.round(rand()*8+1),revenue:Math.round(rand()*50000+20000)}; }); }
  if (filter === "year") return Array.from({length:12},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-11+i,1); return {label:`${d.getMonth()+1}月`,orders:Math.round(rand()*50+10),revenue:Math.round(rand()*400000+100000)}; });
  return Array.from({length:30},(_,i)=>{ const d=new Date(now); d.setDate(d.getDate()-29+i); return {label:`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`,orders:Math.round(rand()*12),revenue:Math.round(rand()*55000+15000)}; });
}
function smoothPath(pts) {
  if (!pts.length) return "";
  let d=`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i=1;i<pts.length;i++){const p=pts[i-1],c=pts[i],cx=((p.x+c.x)/2).toFixed(1); d+=` C ${cx} ${p.y.toFixed(1)} ${cx} ${c.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;}
  return d;
}
const CHART_FILTERS = [{key:"day",label:"最近 24 小時"},{key:"week",label:"本週"},{key:"month",label:"月"},{key:"year",label:"年"}];
function FilterBtns({filter,onFilter}){return(<div className={styles.filterGroup}>{CHART_FILTERS.map(f=>(<button key={f.key} className={`${styles.filterBtn} ${filter===f.key?styles.filterActive:""}`} onClick={()=>onFilter(f.key)}>{f.label}</button>))}</div>);}

// ── Charts ─────────────────────────────────────────────────────────────────
function SalesTrendChart({filter,onFilter}){
  const data=useMemo(()=>genChartData(filter),[filter]);
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

function DonutChart({filter,onFilter}){
  const segs=[{label:"信用卡",pct:70,color:"#f59e0b",count:826},{label:"Apple Pay",pct:15,color:"#1e293b",count:177},{label:"Google Pay",pct:10,color:"#94a3b8",count:118},{label:"其他",pct:5,color:"#e2e8f0",count:59}];
  const cx=90,cy=90,R=74,r=47;
  function polar(a,rad){const ang=(a-90)*Math.PI/180;return{x:cx+rad*Math.cos(ang),y:cy+rad*Math.sin(ang)};}
  function arc(sa,ea){const s1=polar(sa,R),e1=polar(ea,R),s2=polar(ea,r),e2=polar(sa,r),lg=ea-sa>180?1:0;return `M ${s1.x.toFixed(2)} ${s1.y.toFixed(2)} A ${R} ${R} 0 ${lg} 1 ${e1.x.toFixed(2)} ${e1.y.toFixed(2)} L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} A ${r} ${r} 0 ${lg} 0 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)} Z`;}
  let cum=0; const arcs=segs.map(s=>{const a=cum;cum+=s.pct/100*360;return{...s,path:arc(a,cum)};});
  let cum2=0; const lbls=segs.map(s=>{const mid=cum2+(s.pct/100*360)/2;cum2+=s.pct/100*360;const pos=polar(mid,R+16);return{...s,lx:pos.x,ly:pos.y};});
  return(
    <div className={styles.chartCard} style={{width:360,flexShrink:0}}>
      <div className={styles.chartHead}><div className={styles.chartTitle}><CreditCard size={15}/><span>付款方式分布</span></div><FilterBtns filter={filter} onFilter={onFilter}/></div>
      <div className={styles.donutBody}>
        <svg viewBox="0 0 180 180" width={170} height={170} style={{flexShrink:0}}>
          {arcs.map((a,i)=><path key={i} d={a.path} fill={a.color}/>)}
          {lbls.filter(l=>l.pct>=10).map((l,i)=><text key={i} x={l.lx} y={l.ly} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={l.color==="#e2e8f0"?"#475569":l.color}>{l.pct}%</text>)}
          <text x={cx} y={cy-7} textAnchor="middle" fontSize="22" fontWeight="900" fill="#1e293b">70%</text>
          <text x={cx} y={cy+11} textAnchor="middle" fontSize="10" fill="#94a3b8">信用卡</text>
        </svg>
        <div className={styles.donutLegend}>{segs.map((s,i)=><div key={i} className={styles.donutItem}><span className={styles.donutDot} style={{background:s.color}}/><span className={styles.donutLabel}>{s.label}</span><span className={styles.donutCount}>{s.count} 筆</span><span className={styles.donutPct}>{s.pct}%</span></div>)}</div>
      </div>
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
function DashboardPage({leads,trendFilter,donutFilter,setTrendFilter,setDonutFilter,onViewOrders}){
  const now=new Date();
  const thisMonth=leads.filter(l=>{const d=new Date(l.created_at||l.requestedAt||0);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});
  const purchased=leads.filter(l=>l.purchased||l.status==="purchased");
  const purchasedM=thisMonth.filter(l=>l.purchased||l.status==="purchased");
  const demoOpened=leads.filter(l=>l.demo_opened||["demo_opened","purchased"].includes(l.status));
  const fmtTWD=n=>n>=10000?`$${(n/10000).toFixed(1)}萬`:`$${n.toLocaleString()}`;

  const FUNNEL=[
    {stage:"瀏覽課程頁",count:12480,color:"#2563eb"},
    {stage:"查看銷售頁",count:6240, color:"#7c3aed"},
    {stage:"點擊購買",  count:1872, color:"#f59e0b"},
    {stage:"完成付款",  count:936,  color:"#16a34a"},
  ];

  return(
    <div className={styles.dashContent}>
      <div className={styles.welcomeHead}><h1>歡迎回來，管理員</h1><p>這是您的課程平台營運概況</p></div>
      <div className={styles.statsGrid}>
        <StatCard label="本月營收" value={fmtTWD(purchasedM.length*3000)} sub="本月累計營收" icon={DollarSign} growth={purchased.length?"+18.5% 較上月":undefined} color="#f59e0b"/>
        <StatCard label="本月訂單" value={purchasedM.length} sub="本月已完成訂單數" icon={ShoppingCart} growth={purchasedM.length?"+18.4% 較上月":undefined} color="#2563eb"/>
        <StatCard label="總營收"   value={fmtTWD(purchased.length*3000)} sub="累計至今" icon={TrendingUp} color="#16a34a"/>
        <StatCard label="總學員數" value={leads.length} sub="已留存 Email" icon={Users} color="#7c3aed"/>
        <StatCard label="平均完課率" value={leads.length?Math.round(demoOpened.length/leads.length*100)+"%":"—"} sub={`Demo 開啟 ${demoOpened.length} 人`} icon={GraduationCap} color="#0891b2"/>
        <StatCard label="課程數量" value="1" sub="已建立課程" icon={BookOpen} color="#dc2626"/>
      </div>
      <div className={styles.chartsRow}>
        <SalesTrendChart filter={trendFilter} onFilter={setTrendFilter}/>
        <DonutChart filter={donutFilter} onFilter={setDonutFilter}/>
      </div>
      <div className={styles.chartsRow} style={{alignItems:"stretch"}}>
        {/* 轉換漏斗 */}
        <div className={styles.panel} style={{flex:"1 1 0"}}>
          <div className={styles.panelHead}><h2>轉換漏斗</h2><span className={styles.dim}>整體轉換率 {Math.round(936/12480*100)}%</span></div>
          <div style={{display:"grid",gap:10}}>
            {FUNNEL.map((f,i)=>{
              const pct=Math.round(f.count/FUNNEL[0].count*100);
              return(
                <div key={f.stage}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span style={{fontWeight:700,color:"#374151"}}>{f.stage}</span>
                    <span style={{color:"#64748b"}}>{f.count.toLocaleString()} 人 · {pct}%{i>0&&<span style={{color:"#94a3b8",fontSize:12}}> (轉 {Math.round(f.count/FUNNEL[i-1].count*100)}%)</span>}</span>
                  </div>
                  <div style={{height:8,background:"#f1f5f9",borderRadius:999,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:f.color,borderRadius:999,transition:".4s"}}/>
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
                {MOCK_ORDERS.slice(0,5).map(o=>(
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
function CoursesPage({leads, onManage}){
  const [search,setSearch]=useState("");
  const [courses,setCourses]=useState([{id:1,title:"零基礎流行鋼琴入門課",desc:"從零開始學習流行鋼琴，包含基礎樂理、和弦節奏與歌曲實作，共 8 堂課",status:"published",price:3500,students:leads.length,date:"2025/10/01"}]);
  const [showModal,setShowModal]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({title:"",desc:"",price:"",status:"published"});
  const [formErr,setFormErr]=useState("");
  const filtered=useMemo(()=>courses.filter(c=>!search||c.title.includes(search)),[courses,search]);
  function openCreate(){setEditing(null);setForm({title:"",desc:"",price:"",status:"published"});setFormErr("");setShowModal(true);}
  function openEdit(c){setEditing(c);setForm({title:c.title,desc:c.desc||"",price:String(c.price),status:c.status});setFormErr("");setShowModal(true);}
  function handleSave(e){
    e.preventDefault();setFormErr("");
    if(!form.title.trim()){setFormErr("請輸入課程標題");return;}
    if(!form.price||isNaN(form.price)){setFormErr("請輸入有效售價");return;}
    if(editing){setCourses(prev=>prev.map(c=>c.id===editing.id?{...c,title:form.title.trim(),desc:form.desc.trim(),price:Number(form.price),status:form.status}:c));}
    else{const d=new Date();setCourses(prev=>[...prev,{id:Date.now(),title:form.title.trim(),desc:form.desc.trim(),price:Number(form.price),status:form.status,students:0,date:`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`}]);}
    setShowModal(false);
  }
  function toggleStatus(c){setCourses(prev=>prev.map(x=>x.id===c.id?{...x,status:x.status==="published"?"draft":"published"}:x));}

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>課程管理</h1><p>管理您的所有課程內容</p></div>
        <div className={styles.pageActions}>
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
            <thead><tr><th>封面</th><th>標題</th><th>狀態</th><th>價格</th><th>學員數</th><th>建立日期</th><th>操作</th></tr></thead>
            <tbody>
              {filtered.map(c=>(
                <tr key={c.id}>
                  <td><div className={styles.courseCoverThumb}><Music size={22} color="#f59e0b"/></div></td>
                  <td>
                    <div style={{fontWeight:800,fontSize:14}}>{c.title}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{c.desc||"零基礎・流行鋼琴・8 堂課"}</div>
                  </td>
                  <td><span className={styles.pill} style={{background:c.status==="published"?"#dcfce7":"#f1f5f9",color:c.status==="published"?"#166534":"#475569"}}>{c.status==="published"?"已發佈":"草稿"}</span></td>
                  <td style={{fontWeight:800}}>NT$ {c.price.toLocaleString()}</td>
                  <td>{c.students} 位</td>
                  <td className={styles.dim}>{c.date}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <a href="/" target="_blank" className={styles.btnSmall}><Eye size={12}/> 查看</a>
                      <button className={styles.btnSmall} onClick={()=>openEdit(c)}><Edit2 size={12}/> 編輯</button>
                      <button className={styles.btnSmall} onClick={()=>toggleStatus(c)}>{c.status==="published"?"下架":"發佈"}</button>
                      <button className={styles.btnPrimary} style={{padding:"6px 12px",fontSize:12}} onClick={()=>onManage?.(c)}><BookOpen size={12}/> 管理教室</button>
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
                <button type="submit" className={styles.btnPrimary}>{editing?"儲存變更":"建立課程"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Messages Page ──────────────────────────────────────────────────────────
function MessagesPage(){
  const [comments,setComments]=useState(INIT_COMMENTS);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [replyingId,setReplyingId]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [deleteId,setDeleteId]=useState(null);

  const unreadCount=comments.filter(c=>c.status==="unread").length;
  const repliedCount=comments.filter(c=>c.status==="replied").length;

  const filtered=useMemo(()=>comments.filter(c=>{
    if(filter==="unread"&&c.status!=="unread")return false;
    if(filter==="replied"&&c.status!=="replied")return false;
    if(search){const q=search.toLowerCase();return c.content.toLowerCase().includes(q)||c.commenter.toLowerCase().includes(q)||c.unit.toLowerCase().includes(q);}
    return true;
  }),[comments,filter,search]);

  function submitReply(id){if(!replyText.trim())return;setComments(prev=>prev.map(c=>c.id===id?{...c,reply:replyText.trim(),status:"replied"}:c));setReplyingId(null);setReplyText("");}
  function confirmDelete(){setComments(prev=>prev.filter(c=>c.id!==deleteId));setDeleteId(null);}
  function openReply(c){if(replyingId===c.id){setReplyingId(null);return;}setReplyingId(c.id);setReplyText(c.reply||"");}

  return(
    <div>
      <div className={styles.pageHeader}><div><h1>留言管理</h1><p>共 {comments.length} 則留言</p></div></div>
      <div className={styles.statsGrid} style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        {[["全部留言",comments.length,"則"],["未回覆",unreadCount,"則待處理"],["已回覆",repliedCount,"則"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:12}}>
          <div className={styles.tabGroup}>
            {[["all","全部"],["unread","未回覆"],["replied","已回覆"]].map(([key,label])=>(
              <button key={key} className={`${styles.tab} ${filter===key?styles.tabActive:""}`} onClick={()=>setFilter(key)}>
                {label}{key==="unread"&&unreadCount>0&&<span className={styles.tabBadge}>{unreadCount}</span>}
              </button>
            ))}
          </div>
          <input className={styles.searchInput} placeholder="搜尋留言、學員姓名…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>單元</th><th>留言者</th><th>時間</th><th>內容</th><th>操作</th></tr></thead>
            <tbody>
              {!filtered.length?<tr><td colSpan={5} className={styles.empty}>沒有符合的留言</td></tr>
              :filtered.map(c=>(
                <Fragment key={c.id}>
                  <tr className={replyingId===c.id?styles.commentRowActive:""}>
                    <td style={{minWidth:140}}><span className={styles.unitTag}>{c.unit}</span></td>
                    <td style={{minWidth:160}}>
                      <div className={styles.commenterCell}>
                        <div className={styles.commenterAvatar}>{c.commenter[0]}</div>
                        <div>
                          <div className={styles.commenterName}>{c.commenter}</div>
                          <div className={styles.realIdentity}>{c.anonymous&&c.realName?`${c.realName} · ${c.email}`:c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.dim} style={{whiteSpace:"nowrap",minWidth:120}}>{c.time}</td>
                    <td>
                      <div className={styles.commentContent}>{c.content}</div>
                      {c.reply&&<div className={styles.replyPreview}><span className={styles.replyLabel}>已回覆：</span>{c.reply}</div>}
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
                          <textarea className={styles.replyTextarea} placeholder="輸入回覆內容…" value={replyText} rows={3} onChange={e=>setReplyText(e.target.value)}/>
                          <div className={styles.replyActions}>
                            <button className={styles.btnPrimary} onClick={()=>submitReply(c.id)}>送出回覆</button>
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
      </div>
      {deleteId&&(
        <div className={styles.modalOverlay} onClick={()=>setDeleteId(null)}>
          <div className={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontSize:17}}>確認刪除留言</h3>
            <p style={{margin:"0 0 20px",color:"#64748b",fontSize:14}}>此操作無法復原，確定要刪除這則留言嗎？</p>
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteId(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete}>確認刪除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Media Page ─────────────────────────────────────────────────────────────
function MediaPage(){
  const [showUpload,setShowUpload]=useState(null);
  const [dragging,setDragging]=useState(false);
  const totalGB=(MOCK_VIDEOS.reduce((_,v)=>_+parseFloat(v.size),0)/1024).toFixed(2);
  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>媒體中心</h1><p>管理課程影片、圖片與教材</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={()=>setShowUpload("video")}><Upload size={13}/> 上傳影片</button>
          <button className={styles.btnSmall} onClick={()=>setShowUpload("image")}><Upload size={13}/> 上傳圖片</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        {[["影片",MOCK_VIDEOS.length,"支"],["圖片",0,"張"],["附件",0,"個"],["總儲存空間",`${totalGB} GB`,""]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}><h2 style={{display:"flex",alignItems:"center",gap:7}}><Video size={16} color="#2563eb"/>最近影片</h2><span className={styles.dim}>共 {MOCK_VIDEOS.length} 支</span></div>
        <div className={styles.mediaGrid}>
          {MOCK_VIDEOS.map(v=>(
            <div key={v.id} className={styles.videoCard}>
              <div className={styles.videoThumb}>
                <div className={styles.videoPlay}><Play size={22} fill="#fff" color="#fff"/></div>
                <span className={styles.videoDuration}>{v.duration}</span>
              </div>
              <div className={styles.videoInfo}>
                <div className={styles.videoTitle}>{v.title}</div>
                <div className={styles.videoMeta}><span>{v.date}</span><span>{v.size}</span></div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
                  <span className={styles.pill} style={{background:"#dcfce7",color:"#166534",fontSize:11}}>就緒</span>
                  <div className={styles.rowActions}>
                    <button className={styles.btnSmall} style={{padding:"4px 8px",fontSize:12}}><Eye size={11}/></button>
                    <button className={`${styles.btnSmall} ${styles.btnDanger}`} style={{padding:"4px 8px",fontSize:12}}><Trash2 size={11}/></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.panel} style={{marginTop:16}}>
        <div className={styles.panelHead}><h2 style={{display:"flex",alignItems:"center",gap:7}}><Img size={16} color="#7c3aed"/>最近圖片</h2><button className={styles.btnSmall} onClick={()=>setShowUpload("image")}><Upload size={12}/> 上傳圖片</button></div>
        <div className={styles.placeholderCard} style={{padding:"40px 24px"}}>
          <Img size={36} color="#cbd5e1"/>
          <p style={{margin:"12px 0 0",fontSize:14,color:"#94a3b8"}}>尚未上傳任何圖片</p>
        </div>
      </div>
      {showUpload&&(
        <div className={styles.modalOverlay} onClick={()=>{setShowUpload(null);setDragging(false);}}>
          <div className={styles.modalCard} style={{width:"min(480px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0}}>上傳{showUpload==="video"?"影片":"圖片"}</h3>
              <button className={styles.iconBtn} onClick={()=>setShowUpload(null)}><X size={18}/></button>
            </div>
            <label style={{display:"block",cursor:"pointer"}}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);}}
            >
              <input type="file" accept={showUpload==="video"?"video/*":"image/*"} style={{display:"none"}}/>
              <div style={{border:`2px dashed ${dragging?"#2563eb":"#e2e8f0"}`,borderRadius:14,padding:"44px 24px",textAlign:"center",background:dragging?"#eff6ff":"#f8fafc",transition:".15s"}}>
                <Upload size={32} color={dragging?"#2563eb":"#94a3b8"} style={{display:"block",margin:"0 auto 12px"}}/>
                <div style={{fontWeight:800,color:"#374151",marginBottom:4}}>點擊或拖曳{showUpload==="video"?"影片":"圖片"}至此</div>
                <div style={{fontSize:12,color:"#94a3b8"}}>{showUpload==="video"?"支援 MP4、MOV，最大 2 GB":"支援 JPG、PNG、WebP，最大 10 MB"}</div>
              </div>
            </label>
            <div style={{marginTop:12,padding:"11px 14px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,fontSize:13,color:"#92400e"}}>
              ⚠️ Demo 模式 — 實際上傳需串接雲端儲存（如 Supabase Storage 或 Cloudflare R2）。
            </div>
            <div className={styles.modalActions} style={{marginTop:16}}>
              <button className={styles.btnSmall} onClick={()=>setShowUpload(null)}>取消</button>
              <button className={styles.btnPrimary}>開始上傳</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Students Page ──────────────────────────────────────────────────────────
function StudentsPage({leads,loading,onRefresh,onMark,onExport}){
  const [search,setSearch]=useState("");
  const [detailStudent,setDetailStudent]=useState(null);
  const now=new Date();
  const thisMonth=leads.filter(l=>{const d=new Date(l.created_at||l.requestedAt||0);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  const purchased=leads.filter(l=>l.purchased||l.status==="purchased");

  const display=useMemo(()=>leads.map(l=>({...l,name:l.name||(l.email?.split("@")[0])||"—",purchasedCount:(l.purchased||l.status==="purchased")?1:0})),[leads]);
  const filtered=display.filter(l=>!search||l.email?.toLowerCase().includes(search.toLowerCase())||l.name?.toLowerCase().includes(search.toLowerCase()));

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>學員管理</h1><p>共 {leads.length} 位學員</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={onRefresh}><RefreshCw size={13}/> 重新整理</button>
          <button className={styles.btnSmall} onClick={onExport}><Download size={13}/> 匯出 CSV</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        {[["總學員",leads.length,"位"],["本月新增",thisMonth.length,"位"],["已購課",purchased.length,"位"],["未購課",leads.length-purchased.length,"位"]].map(([l,v,s])=>(
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
              <thead><tr><th></th><th>姓名</th><th>Email</th><th>電話</th><th>已購課程數</th><th>狀態</th><th>註冊日期</th><th>操作</th></tr></thead>
              <tbody>
                {!filtered.length?<tr><td colSpan={8} className={styles.empty}>尚無學員，請先到前台點「課程試看」留下 Gmail。</td></tr>
                :filtered.map(l=>(
                  <tr key={l.id||l.email}>
                    <td><div className={styles.studentAvatar}>{l.name[0]?.toUpperCase()}</div></td>
                    <td><strong>{l.name}</strong></td>
                    <td className={styles.dim}>{l.email}</td>
                    <td className={styles.dim}>—</td>
                    <td><span className={styles.courseBadge}>{l.purchasedCount}</span></td>
                    <td><span className={`${styles.pill} ${styles[l.status]||styles.requested}`}>{statusLabel(l.status)}</span></td>
                    <td className={styles.dim}>{fmt(l.created_at||l.requestedAt)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className={styles.btnSmall} onClick={()=>setDetailStudent(l)}><Eye size={12}/> 詳情</button>
                        <button className={styles.btnSmall} onClick={()=>onMark(l,"demo_opened")}>Demo ✓</button>
                        <button className={`${styles.btnSmall} ${styles.green}`} onClick={()=>onMark(l,"purchased")}><CheckCircle2 size={12}/> 購買 ✓</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
                ["電話","—"],
                ["已購課程",detailStudent.purchasedCount?"零基礎流行鋼琴入門課":"—"],
                ["註冊日期",fmt(detailStudent.created_at||detailStudent.requestedAt)],
              ].map(([label,val])=>(
                <div key={label} style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:8,fontSize:14,borderBottom:"1px solid #f8fafc",paddingBottom:10}}>
                  <span style={{color:"#64748b",fontWeight:700}}>{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className={styles.btnSmall} onClick={()=>setDetailStudent(null)}>關閉</button>
              <button className={styles.btnSmall} onClick={()=>{onMark(detailStudent,"demo_opened");setDetailStudent(null);}}>標記 Demo ✓</button>
              <button className={`${styles.btnSmall} ${styles.green}`} onClick={()=>{onMark(detailStudent,"purchased");setDetailStudent(null);}}>標記已購買 ✓</button>
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
function OrdersPage({leads}){
  const [statusFilter,setStatusFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [detailOrder,setDetailOrder]=useState(null);
  const downloadRef=useRef(null);

  // 合併 mock 訂單 + 真實已購學員
  const allOrders=useMemo(()=>{
    const realOrders=leads.filter(l=>l.purchased||l.status==="purchased").map((l,i)=>({
      id:`ORD-REAL-${String(i+1).padStart(3,"0")}`,student:l.email?.split("@")[0]||"學員",email:l.email,course:"零基礎流行鋼琴入門課",amount:3000,method:"信用卡",status:"paid",time:fmt(l.purchased_at||l.updated_at||l.created_at),
    }));
    return [...MOCK_ORDERS,...realOrders];
  },[leads]);

  const filtered=useMemo(()=>allOrders.filter(o=>{
    if(statusFilter!=="all"&&o.status!==statusFilter)return false;
    if(search&&!o.student.toLowerCase().includes(search.toLowerCase())&&!o.email?.toLowerCase().includes(search.toLowerCase())&&!o.id.toLowerCase().includes(search.toLowerCase()))return false;
    if(dateFrom){const od=new Date(o.time.replace(/\//g,"-"));if(od<new Date(dateFrom))return false;}
    if(dateTo){const od=new Date(o.time.replace(/\//g,"-"));const to=new Date(dateTo);to.setHours(23,59,59);if(od>to)return false;}
    return true;
  }),[allOrders,statusFilter,search,dateFrom,dateTo]);

  const paid=allOrders.filter(o=>o.status==="paid");
  const pending=allOrders.filter(o=>o.status==="pending");
  const refunded=allOrders.filter(o=>o.status==="refunded");
  const totalRev=paid.reduce((s,o)=>s+o.amount,0);

  function exportOrders(){
    if(!downloadRef.current)return;
    const cols=["id","student","email","course","amount","method","status","time"];
    const rows=[cols,...filtered.map(o=>cols.map(c=>o[c]??""))];
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    downloadRef.current.href=url;downloadRef.current.download="orders.csv";downloadRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);
  }

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>訂單管理</h1><p>共 {allOrders.length} 筆訂單</p></div>
        <div className={styles.pageActions}>
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
            </select>
            <input className={styles.selectInput} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} title="開始日期"/>
            <input className={styles.selectInput} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} title="結束日期"/>
            {(dateFrom||dateTo)&&<button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>{setDateFrom("");setDateTo("");}}>清除日期</button>}
          </div>
          <span className={styles.dim}>{filtered.length} / {allOrders.length} 筆</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>訂單編號</th><th>學員</th><th>課程</th><th>金額</th><th>付款方式</th><th>狀態</th><th>建立時間</th><th>操作</th></tr></thead>
            <tbody>
              {!filtered.length?<tr><td colSpan={8} className={styles.empty}>尚無符合的訂單</td></tr>
              :filtered.map(o=>(
                <tr key={o.id}>
                  <td><code style={{fontSize:11,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{o.id}</code></td>
                  <td><div style={{fontWeight:700,fontSize:13}}>{o.student}</div><div style={{fontSize:12,color:"#94a3b8"}}>{o.email}</div></td>
                  <td className={styles.dim} style={{maxWidth:160,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.course}</td>
                  <td style={{fontWeight:800}}>NT$ {o.amount.toLocaleString()}</td>
                  <td className={styles.dim}>{o.method}</td>
                  <td><OrderStatusPill status={o.status}/></td>
                  <td className={styles.dim} style={{fontSize:12,whiteSpace:"nowrap"}}>{o.time}</td>
                  <td><button className={styles.btnSmall} onClick={()=>setDetailOrder(o)}><Eye size={12}/> 查看</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                ["建立時間",detailOrder.time],
              ].map(([label,val],i,arr)=>(
                <div key={label} style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,fontSize:14,padding:"11px 14px",borderBottom:i<arr.length-1?"1px solid #f8fafc":"0",background:i%2?"#fafafa":"#fff"}}>
                  <span style={{color:"#64748b",fontWeight:700}}>{label}</span>
                  <span style={{color:"#0f172a"}}>{val}</span>
                </div>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btnSmall} onClick={()=>setDetailOrder(null)}>關閉</button>
              {detailOrder.status==="paid"&&<button className={`${styles.btnSmall} ${styles.btnDanger}`}>申請退款</button>}
            </div>
          </div>
        </div>
      )}
      <a ref={downloadRef} style={{display:"none"}} aria-hidden="true"/>
    </div>
  );
}

// ── Coupons Page ───────────────────────────────────────────────────────────
function CouponsPage(){
  const [coupons,setCoupons]=useState(MOCK_COUPONS_INIT);
  const [showCreate,setShowCreate]=useState(false);
  const [deleteId,setDeleteId]=useState(null);
  const [form,setForm]=useState({name:"",code:"",type:"percent",value:"",limit:"",start:"",end:""});
  const [formErr,setFormErr]=useState("");

  const active=coupons.filter(c=>c.status==="active").length;
  const expired=coupons.filter(c=>c.status==="expired").length;
  const disabled=coupons.filter(c=>c.status==="disabled").length;
  const totalUsed=coupons.reduce((s,c)=>s+c.used,0);

  function CouponStatus({status}){
    const MAP={active:["啟用中","#dcfce7","#166534"],expired:["已過期","#fee2e2","#991b1b"],disabled:["已停用","#f1f5f9","#475569"]};
    const [label,bg,fg]=MAP[status]||MAP.disabled;
    return <span className={styles.pill} style={{background:bg,color:fg}}>{label}</span>;
  }

  function genCode(){const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";return Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join("");}

  function handleCreate(e){
    e.preventDefault();setFormErr("");
    if(!form.name.trim()){setFormErr("請輸入優惠券名稱");return;}
    if(!form.code.trim()){setFormErr("請輸入優惠碼");return;}
    if(!form.value||isNaN(form.value)){setFormErr("請輸入有效的折扣值");return;}
    const newC={id:Date.now(),name:form.name.trim(),code:form.code.trim().toUpperCase(),type:form.type,value:Number(form.value),used:0,limit:form.limit?Number(form.limit):999,status:"active",start:form.start||"—",end:form.end||"—"};
    setCoupons(prev=>[newC,...prev]);
    setShowCreate(false);setForm({name:"",code:"",type:"percent",value:"",limit:"",start:"",end:""});
  }

  function toggleStatus(id){
    setCoupons(prev=>prev.map(c=>c.id===id?{...c,status:c.status==="active"?"disabled":"active"}:c));
  }
  function confirmDelete(){setCoupons(prev=>prev.filter(c=>c.id!==deleteId));setDeleteId(null);}

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>優惠券管理</h1><p>建立與管理折扣代碼</p></div>
        <div className={styles.pageActions}><button className={styles.btnPrimary} onClick={()=>setShowCreate(true)}><Plus size={14}/> 新增優惠券</button></div>
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
              {!coupons.length?<tr><td colSpan={7} className={styles.empty}>尚無優惠券</td></tr>
              :coupons.map(c=>(
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <code style={{background:"#f1f5f9",padding:"3px 8px",borderRadius:6,fontSize:12,fontWeight:700,letterSpacing:1}}>{c.code}</code>
                      <button className={styles.iconBtn} onClick={()=>{navigator.clipboard?.writeText(c.code)}} title="複製"><Copy size={12}/></button>
                    </div>
                  </td>
                  <td>
                    <span className={styles.discountBadge} style={{background:c.type==="percent"?"#eff6ff":"#fef3c7",color:c.type==="percent"?"#1d4ed8":"#92400e"}}>
                      {c.type==="percent"?<><Percent size={11}/> {c.value}%</>:<>NT$ {c.value}</>}
                    </span>
                  </td>
                  <td>
                    <div style={{fontSize:13}}><span style={{fontWeight:800}}>{c.used}</span> / {c.limit}</div>
                    <div style={{marginTop:4,height:4,background:"#f1f5f9",borderRadius:999,width:80,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(c.used/c.limit*100,100)}%`,background:"#2563eb",borderRadius:999}}/>
                    </div>
                  </td>
                  <td><CouponStatus status={c.status}/></td>
                  <td className={styles.dim} style={{fontSize:12}}>{c.start} ~ {c.end}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.btnSmall} onClick={()=>toggleStatus(c.id)}>{c.status==="active"?"停用":"啟用"}</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteId(c.id)}><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.panel} style={{marginTop:16}}>
        <div className={styles.panelHead}><h2>定價方案</h2><span className={styles.dim}>串接 Payuni 後生效</span></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>方案名稱</th><th>plan ID</th><th>售價</th><th>狀態</th></tr></thead>
            <tbody>
              {[["粉絲限定【1】","fan1","$2,200"],["粉絲限定【2】","fan2","$2,400"],["第一波早鳥","early1","$2,800"],["第二波早鳥","early2","$3,100"],["最後早鳥","early3","$3,300"],["原價","full","$3,500"]].map(([name,key,price])=>(
                <tr key={key}>
                  <td><strong>{name}</strong></td>
                  <td><code style={{fontSize:12,background:"#f1f5f9",padding:"2px 6px",borderRadius:4}}>{key}</code></td>
                  <td>{price} TWD</td>
                  <td><span className={styles.pill} style={{background:"#dbeafe",color:"#1e40af"}}>已設定</span></td>
                </tr>
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
                  </select>
                </div>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣值 * {form.type==="percent"?"(%)":"(NT$)"}</label>
                  <input className={styles.input} type="number" min="1" value={form.value} onChange={e=>setForm(p=>({...p,value:e.target.value}))} placeholder={form.type==="percent"?"10":"300"}/>
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
                <button type="submit" className={styles.btnPrimary}>建立優惠券</button>
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
    </div>
  );
}

// ── Analytics Page ─────────────────────────────────────────────────────────
function AnalyticsPage({leads,trendFilter,donutFilter,setTrendFilter,setDonutFilter}){
  const purchased=leads.filter(l=>l.purchased||l.status==="purchased").length;
  const totalRev=MOCK_ORDERS.filter(o=>o.status==="paid").reduce((s,o)=>s+o.amount,0);
  const avgOrder=MOCK_ORDERS.filter(o=>o.status==="paid").length?Math.round(totalRev/MOCK_ORDERS.filter(o=>o.status==="paid").length):0;
  const monthRev=523600;

  const RANKING=[
    {rank:1,title:"零基礎流行鋼琴入門課",orders:MOCK_ORDERS.filter(o=>o.status==="paid").length,revenue:totalRev,color:"#f59e0b"},
  ];
  const FUNNEL=[{stage:"瀏覽課程頁",count:12480},{stage:"查看銷售頁",count:6240},{stage:"點擊購買",count:1872},{stage:"完成付款",count:936}];

  return(
    <div>
      <div className={styles.pageHeader}><div><h1>銷售分析</h1><p>深入了解您的課程銷售數據</p></div></div>
      <div className={styles.statsGrid4}>
        <StatCard label="總營收" value={`NT$ ${totalRev.toLocaleString()}`} sub="累計" icon={DollarSign} color="#16a34a"/>
        <StatCard label="本月營收" value={`NT$ ${monthRev.toLocaleString()}`} sub="+18.5% 較上月" icon={TrendingUp} growth="+18.5% 較上月" color="#2563eb"/>
        <StatCard label="總訂單數" value={MOCK_ORDERS.length} sub="筆" icon={ShoppingCart} color="#7c3aed"/>
        <StatCard label="平均客單價" value={`NT$ ${avgOrder.toLocaleString()}`} sub="已付款訂單" icon={BarChart2} color="#f59e0b"/>
      </div>
      <div className={styles.chartsRow}>
        <SalesTrendChart filter={trendFilter} onFilter={setTrendFilter}/>
        <DonutChart filter={donutFilter} onFilter={setDonutFilter}/>
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
          <div className={styles.panelHead}><h2>轉換漏斗</h2><span className={styles.dim}>整體 {Math.round(936/12480*100)}%</span></div>
          <div style={{display:"grid",gap:12}}>
            {FUNNEL.map((f,i)=>{
              const pct=Math.round(f.count/FUNNEL[0].count*100);
              const colors=["#2563eb","#7c3aed","#f59e0b","#16a34a"];
              return(
                <div key={f.stage}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                    <span style={{fontWeight:700}}>{f.stage}</span>
                    <span style={{color:"#64748b"}}>{f.count.toLocaleString()} 人 · {pct}%</span>
                  </div>
                  <div style={{height:10,background:"#f1f5f9",borderRadius:999,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:colors[i],borderRadius:999}}/>
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
  const [brevoStatus,setBrevoStatus]=useState("unknown");const [brevoMsg,setBrevoMsg]=useState("");
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

  async function testBrevo(){setBrevoMsg("測試中…");setBrevoStatus("testing");try{const res=await fetch("/api/brevo/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"_test_admin@gmail.com"})});const d=await res.json();if(res.ok&&d.ok){setBrevoStatus("ok");setBrevoMsg("✅ Brevo 連線正常");}else throw new Error(d.error||"api_error");}catch(e){setBrevoStatus("error");setBrevoMsg("❌ "+(e.message.includes("fetch")?"後端尚未部署":e.message));}}
  async function testPayuni(){setPayuniMsg("測試中…");setPayuniStatus("testing");try{const res=await fetch("/api/payuni/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan:"full",price:3500,label:"後台測試"})});const d=await res.json();if(res.ok&&d.url&&d.fields){setPayuniStatus("ok");setPayuniMsg("✅ Payuni 連線正常");}else throw new Error(d.error||"checkout_failed");}catch(e){setPayuniStatus("error");setPayuniMsg("❌ "+(e.message.includes("fetch")?"後端尚未部署":e.message));}}
  const s2={card:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:24,marginBottom:20},h3:{margin:"0 0 4px",fontSize:20},desc:{color:"#64748b",fontSize:14,margin:"0 0 16px"},stepList:{paddingLeft:20,display:"grid",gap:8,fontSize:14,color:"#334155"},codeBlock:{background:"#0f172a",color:"#e2e8f0",borderRadius:12,padding:16,fontFamily:"monospace",fontSize:13,lineHeight:1.8,overflowX:"auto"},envTable:{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:10},th:{background:"#f8fafc",color:"#94a3b8",padding:"10px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontSize:12,textTransform:"uppercase"},td:{padding:"10px 12px",borderBottom:"1px solid #e2e8f0"},code:{background:"#f1f5f9",padding:"2px 6px",borderRadius:5,fontFamily:"monospace",fontSize:12},badge:(s)=>({display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:999,fontSize:13,fontWeight:900,background:s==="ok"?"#dcfce7":s==="error"?"#fee2e2":"#f1f5f9",color:s==="ok"?"#166534":s==="error"?"#991b1b":"#6b7280"}),testRow:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:16}};
  return(
    <div>
      <div className={styles.pageHeader}><div><h1>系統設定</h1><p>管理外部服務整合與環境變數</p></div></div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#0B996E",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:20,flexShrink:0}}>B</div><div style={{flex:1}}><h3 style={s2.h3}>Brevo</h3><div style={{color:"#94a3b8",fontSize:13}}>Email 名單管理 + 自動寄送試看信</div></div><div style={s2.badge(brevoStatus)}>{brevoStatus==="ok"?"已連線":brevoStatus==="error"?"連線失敗":"未測試"}</div></div>
        <p style={s2.desc}>前台試看 Modal 填寫 Gmail 後呼叫 <code style={s2.code}>/api/brevo/subscribe</code>，加入 Brevo 名單並自動寄出試看 Email，同時寫入 Supabase。</p>
        <table style={s2.envTable}><thead><tr><th style={s2.th}>環境變數</th><th style={s2.th}>說明</th><th style={s2.th}>範例</th></tr></thead><tbody>{[["BREVO_API_KEY","Brevo API 金鑰","xkeysib-xxx..."],["BREVO_LIST_ID","目標名單 ID","3"],["BREVO_SENDER_EMAIL","已驗證寄件人","hello@你的網域.com"],["BREVO_SENDER_NAME","寄件人名稱","InRecord"],["DEMO_URL","試看按鈕連結","https://你的網址/#courseDemo"],["BREVO_TEMPLATE_ID","（可選）Template ID","5"]].map(([k,d,e])=><tr key={k}><td><code style={s2.code}>{k}</code></td><td style={{color:"#64748b"}}>{d}</td><td style={{color:"#94a3b8"}}><code style={s2.code}>{e}</code></td></tr>)}</tbody></table>
        <ol style={s2.stepList}><li>前往 <strong>app.brevo.com</strong> → Settings → API Keys → 建立新的 API Key</li><li>Contacts → Lists → 建立名單，記下 List ID</li><li>Settings → Senders → 新增並驗證寄件人 Email</li><li><strong>Vercel</strong> → Settings → Environment Variables 填入所有變數後重新部署</li></ol>
        <div style={s2.testRow}><button onClick={testBrevo} style={{border:0,background:"#2563eb",color:"#fff",borderRadius:10,padding:"9px 14px",fontWeight:900,cursor:"pointer"}}>🔍 測試 Brevo 連線</button>{brevoMsg&&<span style={{fontSize:13,fontWeight:800,color:brevoStatus==="ok"?"#16a34a":"#dc2626"}}>{brevoMsg}</span>}</div>
      </div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#D4192C",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0}}>PAY</div><div style={{flex:1}}><h3 style={s2.h3}>Payuni 統一金流</h3><div style={{color:"#94a3b8",fontSize:13}}>信用卡、ATM 轉帳、超商繳費 金流結帳</div></div><div style={s2.badge(payuniStatus)}>{payuniStatus==="ok"?"已連線":payuniStatus==="error"?"連線失敗":"未測試"}</div></div>
        <table style={s2.envTable}><thead><tr><th style={s2.th}>環境變數</th><th style={s2.th}>說明</th></tr></thead><tbody>{[["PAYUNI_MERCHANT_ID","特店代號（Payuni 後台取得）"],["PAYUNI_HASH_KEY","HashKey（32 字元）"],["PAYUNI_HASH_IV","HashIV（16 字元）"],["PAYUNI_API_URL","正式：https://api.payuni.com.tw/api/upp"],["NEXT_PUBLIC_SITE_URL","正式網域，用於 ReturnURL / NotifyURL"]].map(([k,d])=><tr key={k}><td><code style={s2.code}>{k}</code></td><td style={{color:"#64748b"}}>{d}</td></tr>)}</tbody></table>
        <ol style={{...s2.stepList,marginTop:14}}><li>前往 <strong>www.payuni.com.tw</strong> → 申請特店帳號</li><li>後台 → 系統設定 → 取得 特店代號、HashKey、HashIV</li><li>測試環境使用 <code style={s2.code}>https://sandbox-api.payuni.com.tw/api/upp</code></li><li>Vercel 填入所有變數後重新部署，測試通過後換成正式 API URL</li></ol>
        <div style={s2.testRow}><button onClick={testPayuni} style={{border:0,background:"#D4192C",color:"#fff",borderRadius:10,padding:"9px 14px",fontWeight:900,cursor:"pointer"}}>🔍 測試 Payuni 連線</button>{payuniMsg&&<span style={{fontSize:13,fontWeight:800,color:payuniStatus==="ok"?"#16a34a":"#dc2626"}}>{payuniMsg}</span>}</div>
      </div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#3ECF8E",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0}}>SB</div><div><h3 style={s2.h3}>Supabase</h3><div style={{color:"#94a3b8",fontSize:13}}>PostgreSQL 資料庫・試看名單 + 訂單記錄</div></div></div>
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
function DocEditorPage({title,lsKey,defaultMd,showToast}){
  const [md,setMd]=useState(defaultMd);
  const [saved,setSaved]=useState(defaultMd);
  const [mode,setMode]=useState("preview");
  const dirty=md!==saved;
  useEffect(()=>{try{const v=localStorage.getItem(lsKey);if(v){setMd(v);setSaved(v);}}catch{}},[lsKey]);
  function save(){localStorage.setItem(lsKey,md);setSaved(md);showToast(`✅ ${title}已儲存`);}
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
          <button className={styles.btnPrimary} onClick={save}>儲存</button>
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
function PrivacyPage({showToast}){return <DocEditorPage title="隱私權政策" lsKey="inrecord_privacy" defaultMd={DEFAULT_PRIVACY_MD} showToast={showToast}/>;}
function TermsPage({showToast}){return <DocEditorPage title="服務條款" lsKey="inrecord_terms" defaultMd={DEFAULT_TERMS_MD} showToast={showToast}/>;}

// ── Helpers ────────────────────────────────────────────────────────────────
function statusLabel(s){return{requested:"已留 Email",preview_mode:"預覽模式",email_sent:"已寄試看信",demo_opened:"已開 Demo",purchased:"已購買"}[s]||s||"—";}
function fmt(v){if(!v)return "—";try{return new Date(v).toLocaleString("zh-TW");}catch{return v;}}

// ── Course Detail Page (classroom sub-pages) ──────────────────────────────
const COURSE_TABS = [
  { id:"chapters",     label:"章節與單元管理", icon:List },
  { id:"assignments",  label:"作業設定",       icon:ClipboardList },
  { id:"unitcomments", label:"單元評論",       icon:MessageSquare },
  { id:"ratings",      label:"課程評價",       icon:Star },
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
  const [leads,setLeads]=useState([]);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState("");
  const [trendFilter,setTrendFilter]=useState("month");
  const [donutFilter,setDonutFilter]=useState("month");
  const [unreadUnitComments,setUnreadUnitComments]=useState(0);
  const downloadRef=useRef(null);

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

  async function markLead(lead,status){
    try{const res=await fetch("/api/admin/leads",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${getToken()}`},body:JSON.stringify({id:lead.id,status})});if(res.ok){fetchLeads();showToast("✅ 已更新狀態");return;}}catch{}
    const raw=JSON.parse(localStorage.getItem("inrecord_course_preview_leads")||"[]");
    const upd=raw.map(l=>l.email===lead.email?{...l,status,updatedAt:new Date().toISOString()}:l);
    localStorage.setItem("inrecord_course_preview_leads",JSON.stringify(upd));setLeads(upd);showToast("✅ 已更新（localStorage 模式）");
  }

  function exportCsv(){
    if(!downloadRef.current)return;
    const cols=["email","course","source","status","email_sent","demo_opened","purchased","created_at","updated_at"];
    const rows=[cols,...leads.map(l=>cols.map(c=>l[c]??""))];
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    downloadRef.current.href=url;downloadRef.current.download="inrecord_leads.csv";downloadRef.current.click();
    setTimeout(()=>URL.revokeObjectURL(url),100);showToast("✅ 已匯出 CSV");
  }

  const purchasedCount=leads.filter(l=>l.purchased||l.status==="purchased").length;
  const unreadComments=INIT_COMMENTS.filter(c=>c.status==="unread").length;

  useEffect(()=>{
    if(!authed)return;
    fetch("/api/admin/unit-comments?count=true",{headers:{Authorization:`Bearer ${getToken()}`}})
      .then(r=>r.json()).then(d=>{ if(d.unread!=null) setUnreadUnitComments(d.unread); }).catch(()=>{});
  },[authed,page]);

  function getBadge(key){if(key==="leads")return leads.length||null;if(key==="orders")return purchasedCount||null;if(key==="messages")return unreadComments||null;if(key==="courses")return unreadUnitComments||null;return null;}

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
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}><span className={styles.brandName}>InRecord 後台</span></div>
        <nav className={styles.sideNav}>
          {NAV_GROUPS.map(group=>(
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map(item=>{
                const Icon=item.icon;const badge=item.badgeKey?getBadge(item.badgeKey):null;
                return(
                  <button key={item.id} className={`${styles.navItem} ${page===item.id?styles.active:""}`} onClick={()=>{setPage(item.id);if(item.id!=="courses")setSelectedCourse(null);}}>
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

      <div className={styles.main}>
        <div className={styles.topbar}>
          <span className={styles.topbarTitle}>後台管理系統</span>
          <div className={styles.topbarRight}>
            <div className={styles.adminAvatar}>管</div>
          </div>
        </div>
        <div className={styles.content}>
          {page==="dashboard"   &&<DashboardPage leads={leads} trendFilter={trendFilter} donutFilter={donutFilter} setTrendFilter={setTrendFilter} setDonutFilter={setDonutFilter} onViewOrders={()=>setPage("orders")}/>}
          {page==="courses"     &&(selectedCourse
            ? <CourseDetailPage course={selectedCourse} onBack={()=>setSelectedCourse(null)} showToast={showToast} unreadUnitComments={unreadUnitComments} onUnreadChange={n=>setUnreadUnitComments(n)}/>
            : <CoursesPage leads={leads} onManage={c=>{setSelectedCourse(c);}}/>
          )}
          {page==="messages"    &&<MessagesPage/>}
          {page==="media"       &&<MediaPage/>}
          {page==="students"    &&<StudentsPage leads={leads} loading={loading} onRefresh={fetchLeads} onMark={markLead} onExport={exportCsv}/>}
          {page==="orders"      &&<OrdersPage leads={leads}/>}
          {page==="coupons"     &&<CouponsPage/>}
          {page==="analytics"   &&<AnalyticsPage leads={leads} trendFilter={trendFilter} donutFilter={donutFilter} setTrendFilter={setTrendFilter} setDonutFilter={setDonutFilter}/>}
          {page==="integration" &&<IntegrationPage showToast={showToast}/>}
          {page==="privacy"     &&<PrivacyPage showToast={showToast}/>}
          {page==="terms"       &&<TermsPage showToast={showToast}/>}
        </div>
      </div>

      {toast&&<div className={styles.toast}>{toast}</div>}
      <a ref={downloadRef} style={{display:"none"}} aria-hidden="true"/>
    </div>
  );
}

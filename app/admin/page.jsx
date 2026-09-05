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
import NewsletterPage from "./NewsletterPage";
import { PrivacyPage, TermsPage } from "./DocEditorPage";
import IntegrationPage from "./IntegrationPage";
import AuditLogPage from "./AuditLogPage";
import AnalyticsPage from "./AnalyticsPage";
import CustomerLookupPage from "./CustomerLookupPage";
import StudentsPage from "./StudentsPage";
import MediaPage from "./MediaPage";
import MessagesPage from "./MessagesPage";
import CoursesPage from "./CoursesPage";
import CourseDetailPage from "./CourseDetailPage";
import DashboardPage from "./DashboardPage";

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

// ── Messages Page ──────────────────────────────────────────────────────────

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

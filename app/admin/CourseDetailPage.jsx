"use client";
import { List, ClipboardList, MessageSquare, Star, Gamepad2, BookOpen, Music } from "lucide-react";
import { useState } from "react";
import ChaptersUnitsPage from "./ChaptersUnitsPage";
import AssignmentsPage from "./AssignmentsPage";
import UnitCommentsPage from "./UnitCommentsPage";
import CourseRatingsPage from "./CourseRatingsPage";
import GamesManagePage from "./GamesManagePage";
import QuizzesPage from "./QuizzesPage";

// ── Course Detail Page (classroom sub-pages) ──────────────────────────────
export const COURSE_TABS = [
  { id:"chapters",     label:"章節與單元管理", icon:List },
  { id:"assignments",  label:"作業設定",       icon:ClipboardList },
  { id:"unitcomments", label:"單元評論",       icon:MessageSquare },
  { id:"ratings",      label:"課程評價",       icon:Star },
  { id:"games",        label:"互動遊戲",        icon:Gamepad2 },
  // 測驗管理：學員端 UI 尚未做（播放頁沒有測驗、bootstrap 不帶測驗），先藏起入口避免以為已上線；
  // API（/api/classroom/quiz*、/api/admin/quizzes）與資料表保留，要開放時把這行放回來即可。
  // { id:"quizzes",      label:"測驗管理",       icon:ListChecks },
];

export default function CourseDetailPage({ course, onBack, showToast, unreadUnitComments, onUnreadChange }) {
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

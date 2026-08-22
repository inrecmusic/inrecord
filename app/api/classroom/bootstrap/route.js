import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { hasCourseAccess } from "@/lib/course-access";
import { mergePrefill } from "@/lib/student-profile";

// 教室入口一次載入：驗 JWT 一次，之後並行撈 購課 / 遊戲存取 / 學員資料(+預填) /（購課者）章節+影片+進度，
// 單一往返取代原本 verify-purchase + verify-subscription + course + progress + profile 五支
// （原本兩個 waterfall wave），大幅降低教室進場延遲（Supabase 冷啟時尤其明顯）。
//
// 注意：本端點只做「讀取顯示」，不做裝置數上限（那屬於實際播放路徑）——播放頁 /classroom/watch
// 的 course 端點仍照舊強制裝置上限，影片本身另有 video-embed 驗購課，防護不變。
// videos 只回儀表板需要的欄位（不含 bunny_video_id 等），縮小 payload、避免多餘外洩。
export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false }); // 只驗登入；購課與否往下自行判斷
  if (g.res) return g.res;
  const { user, supabase } = g;

  const now = new Date();
  const out = {
    ok: true,
    hasPurchased: false,
    hasSubscription: false,
    profile: null,
    prefill: {},
    chapters: [],
    videos: [],
    progress: [],
    completedCount: 0,
    totalCount: 0,
    percentage: 0,
  };

  // 一律要跑的：購課、遊戲存取、學員資料、預填訂單。並行。
  const [purchased, subRes, profRes, orderRes] = await Promise.all([
    hasCourseAccess(supabase, user.email),
    supabase.from("subscriptions").select("id, plan_type, expires_at, status")
      .eq("email", user.email).eq("status", "active").gte("expires_at", now.toISOString())
      .order("expires_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("orders").select("buyer_name, phone").eq("email", user.email).eq("status", "paid")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const sub = subRes.data;
  out.hasSubscription = !!sub;
  out.subscription = {
    hasSubscription: !!sub,
    expiresAt: sub?.expires_at || null,
    planType: sub?.plan_type || null,
    daysLeft: sub ? Math.ceil((new Date(sub.expires_at) - now) / 86400000) : 0,
  };
  out.profile = profRes.data || null;
  out.prefill = mergePrefill(profRes.data || null, orderRes.data || null);
  out.hasPurchased = !!purchased;

  // 未購課：不回課程/進度（與原 dashboard「購課後才載 course+progress」一致）。
  if (!purchased) return NextResponse.json(out);

  // 購課者：章節 + 影片（僅儀表板欄位）+ 進度 + 已發布單元總數。並行。
  const [chapRes, vidRes, progRes, countRes] = await Promise.all([
    supabase.from("chapters").select("*").order("sort_order", { ascending: true }),
    supabase.from("videos").select("id, chapter_id, title, sort_order").eq("published", true).order("sort_order", { ascending: true }),
    supabase.from("progress").select("video_id, watched_seconds, total_seconds, completed, watched_at").eq("user_id", user.id),
    supabase.from("videos").select("id", { count: "exact", head: true }).eq("published", true),
  ]);

  // 讀取失敗不讓整個教室白畫面：記 log、該區塊退回空值優雅降級（與原 dashboard 各 wave 的容錯一致）。
  if (chapRes.error) console.error("[bootstrap] chapters:", chapRes.error.message);
  if (vidRes.error) console.error("[bootstrap] videos:", vidRes.error.message);
  if (progRes.error) console.error("[bootstrap] progress:", progRes.error.message);

  const progress = progRes.data || [];
  const completedCount = progress.filter((p) => p.completed).length;
  const totalCount = countRes.count || 0;

  out.chapters = chapRes.data || [];
  out.videos = vidRes.data || [];
  out.progress = progress;
  out.completedCount = completedCount;
  out.totalCount = totalCount;
  out.percentage = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  return NextResponse.json(out);
}

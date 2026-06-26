// lib/course-access.js — 課程存取（是否已購課）的權威判斷。
// 單一課程架構：enrollments 以固定 course_id='piano-101' 開通（見 CLAUDE.md）。
// 用 service-role client 查（繞過 RLS），供需要「已購課」把關的 API 共用。
const COURSE_ID = "piano-101";

export async function hasCourseAccess(adminSupabase, email) {
  if (!adminSupabase || !email) return false;
  const { data } = await adminSupabase
    .from("enrollments")
    .select("id")
    .eq("email", email)
    .eq("course_id", COURSE_ID)
    .maybeSingle();
  return !!data;
}

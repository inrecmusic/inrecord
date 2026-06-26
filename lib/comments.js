// lib/comments.js — 前台留言的公開投影。
// ⚠️ comments 表含 user_email / user_id（PII）。前台 API 只能回非敏感欄位，
// 否則任一登入學員打 /api/classroom/comments 即可列舉所有人的 email。

// 查詢投影：只取前台需要的欄位（含管理員回覆），不含 user_email / user_id。
export const COMMENT_LIST_SELECT =
  "id, video_id, chapter_id, user_name, content, status, created_at, comment_replies(admin_content, created_at)";

// 出口再剝一層：即使查詢回了多餘欄位，也保證 PII 不外流（縱深防禦）。
export function toPublicComment(row) {
  if (!row) return row;
  return {
    id: row.id,
    video_id: row.video_id,
    chapter_id: row.chapter_id,
    user_name: row.user_name,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
    comment_replies: row.comment_replies || [],
  };
}

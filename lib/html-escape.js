// lib/html-escape.js — HTML 跳脫（信件模板／告警文字插值共用）。
// 原本 admin-alert / admin-login-audit / brevo-email / newsletter / recovery 各有一份，集中到這裡；行為不變。
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 截長版：信件裡插入使用者輸入時先截到 max 字再跳脫，避免超長字串撐爆版面。
export function escClip(s, max = 200) {
  return escapeHtml(String(s ?? "").slice(0, max));
}

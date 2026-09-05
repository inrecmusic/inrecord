// lib/admin-client.js — 後台前端呼叫 admin API 的共用小工具（token 存 sessionStorage）。
// 原本 13 個後台頁面各自複製一份 pw()/api()，集中到這裡；行為不變。
export const ADMIN_TOKEN_KEY = "inrecord_admin_token";

export const adminToken = () => (typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : "");

// 任一 admin API 回 401（token 過期／失效）時觸發：由 AdminPage 註冊，清 token＋跳回登入頁並提示，
// 取代散落各動作處籠統的「更新失敗」。未註冊時什麼都不做。
let onUnauthorized = null;
export function setAdminUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function adminFetch(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}`, ...(opts.headers || {}) } })
    .then((res) => { if (res.status === 401) onUnauthorized?.(); return res; });
}

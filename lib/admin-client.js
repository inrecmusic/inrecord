// lib/admin-client.js — 後台前端呼叫 admin API 的共用小工具（token 存 sessionStorage）。
// 原本 13 個後台頁面各自複製一份 pw()/api()，集中到這裡；行為不變。
export const ADMIN_TOKEN_KEY = "inrecord_admin_token";

export const adminToken = () => (typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : "");

export function adminFetch(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}`, ...(opts.headers || {}) } });
}

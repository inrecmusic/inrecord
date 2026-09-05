"use client";
import { supabase } from "@/lib/supabase";

export const F = `var(--type-body)`;

// 送出前取「當下最新」的 access_token（getSession 會在過期時自動刷新），避免用到頁面
// 載入時抓的過期 token 而 401。取不到就退回傳入的 fallback token。
export async function freshToken(fallback) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || fallback || "";
  } catch { return fallback || ""; }
}

export async function openMaterialById(token, id) {
  const w = typeof window !== "undefined" ? window.open("", "_blank", "noopener,noreferrer") : null;
  try {
    const tk = await freshToken(token);
    const r = await fetch(`/api/classroom/materials?id=${id}`, { headers: { Authorization: `Bearer ${tk}` } });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { if (w) w.location.href = d.url; else window.location.href = d.url; return true; }
  } catch {}
  if (w) w.close();
  return false;
}

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("inrec_device_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("inrec_device_id", id); }
  return id;
}

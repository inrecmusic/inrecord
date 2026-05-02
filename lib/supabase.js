// lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 前端用 (anon key) — env 未設定時為 null，走 localStorage fallback
export const supabase = url && anon ? createClient(url, anon) : null;

// 後端 API 用 (service role key，只在 server side 使用)
export function getSupabaseAdmin() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return null;
  return createClient(url, svcKey);
}

// api/admin/leads.js
// Placeholder：目前前後台以 localStorage 打通資料流。
// 正式上線請改接資料庫，例如 Supabase / Neon / Vercel KV。

export default async function handler(req, res) {
  return res.status(200).json({ ok: true, message: "Use database in production. Local preview uses localStorage." });
}

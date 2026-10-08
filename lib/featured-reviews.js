// lib/featured-reviews.js — 首頁課程評價跑馬燈的資料層（純函式＋一個查詢）。
// 只用真實評價：ratings.featured=true 且 hidden=false，排除管理員自評；不輸出 email。
export const REVIEW_TEXT_MAX = 120;   // 卡片文字上限（字），超過截斷加「…」
export const MARQUEE_MIN_CARDS = 3;   // 精選未滿此數整個區塊不顯示
export const LOOP_MIN = 8;            // 跑馬燈一圈至少幾張，不足整輪重複

const twDate = (iso) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/-/g, "/");
};

export function toReviewCards(rows = []) {
  return (rows || []).map((r) => {
    const raw = String(r.content ?? "").trim();
    const chars = [...raw]; // 以 code point 計字，CJK／emoji 不會被切半
    const text = !raw ? null : chars.length > REVIEW_TEXT_MAX ? chars.slice(0, REVIEW_TEXT_MAX).join("") + "…" : raw;
    const name = String(r.user_name ?? "").trim() || "學員";
    const score = Number(r.score);
    return { id: String(r.id), score: Number.isFinite(score) ? score : 0, text, name, date: twDate(r.created_at) };
  });
}

export function shouldShowMarquee(cards = []) {
  return (cards?.length || 0) >= MARQUEE_MIN_CARDS;
}

// 不足 min 張就整輪重複（不切半），循環接縫才不會露出同一張卡緊接著自己。
export function fillLoop(cards = [], min = LOOP_MIN) {
  if (!cards?.length) return [];
  const out = [];
  while (out.length < min) out.push(...cards);
  return out;
}

export async function getFeaturedReviews(db, { adminEmail = process.env.ADMIN_EMAIL, limit = 12 } = {}) {
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("ratings")
      .select("id, score, content, user_name, user_email, created_at")
      .eq("featured", true)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return []; // 欄位未建（SQL 沒跑）等錯誤：首頁照常、只是不顯示跑馬燈
    const admin = String(adminEmail || "").trim().toLowerCase();
    const rows = (data || []).filter((r) => !admin || String(r.user_email || "").trim().toLowerCase() !== admin);
    return toReviewCards(rows);
  } catch {
    return [];
  }
}

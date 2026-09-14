// 首頁社會證明數字（已購人數／平均星等）。
// 首頁（Server Component，revalidate 60s）與 /api/stats 共用同一份查詢：
// 首頁伺服端先算好塞進 HTML，避免每位訪客都打一次 API、也避免數字晚到造成 hero 版位跳動。
// 回傳形狀與 /api/stats 回應相同（{ ok, purchases, rating, ratingCount }）；查詢失敗回 null 讓呼叫端自行決定退路。
export async function getSiteStats(db) {
  const [{ count: purchases, error: e1 }, { data: ratingRows, error: e2 }] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid").or("source.is.null,source.neq.manual"), // 手動開通單不算購買人數；舊單 source 為 NULL 照算
    db.from("ratings").select("score,user_email").eq("hidden", false), // 後台隱藏的惡意評價不列入首頁平均
  ]);
  if (e1 || e2) return null;

  // 排除自家／管理員帳號自評（大小寫不敏感）；user_email 為空的評價照算
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const scores = (ratingRows || [])
    .filter((r) => !adminEmail || String(r.user_email || "").trim().toLowerCase() !== adminEmail)
    .map((r) => Number(r.score))
    .filter(Number.isFinite);

  const ratingCount = scores.length;
  const rating = ratingCount > 0 ? scores.reduce((sum, s) => sum + s, 0) / ratingCount : null;

  // ratingCount 交給前端判斷樣本數夠不夠（少於 3 筆不顯示星等，避免不實廣告）
  return { ok: true, purchases: purchases ?? 0, rating, ratingCount };
}

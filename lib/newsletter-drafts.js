// lib/newsletter-drafts.js — 電子報草稿的 id 規則與清單整理（純函式，好測）。
// 背景：newsletter 表原本被 CHECK (id = 'default') 鎖成單列。2026-09-13 移除該約束後改成多份草稿，
// 每份一列、以 id 當鍵、subject 當顯示名稱（不另加欄位，所以不需要再動 schema）。

export const DEFAULT_DRAFT_ID = "default";
export const MAX_DRAFTS = 10; // 手滑防護：草稿是人工維護的，不該長到失控

// id 只收小寫英數與 - _，最長 40：會進 SQL 等值查詢與稽核紀錄，收窄字元集比事後跳脫安全。
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function isValidDraftId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

// 前端傳來的 id 正規化；不合法一律退回 default（讀取路徑寧可給預設，也不要丟例外）
export function normalizeDraftId(id) {
  const v = String(id ?? "").trim().toLowerCase();
  return isValidDraftId(v) ? v : DEFAULT_DRAFT_ID;
}

// 草稿清單：default 永遠排第一，其餘依最後更新時間新到舊。
export function sortDrafts(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.sort((a, b) => {
    if (a.id === DEFAULT_DRAFT_ID) return -1;
    if (b.id === DEFAULT_DRAFT_ID) return 1;
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
}

// 清單用的精簡欄位（不回內文，草稿列表不需要，也少傳一份全文）
export function toDraftSummary(row) {
  return {
    id: row.id,
    subject: row.subject || "",
    hasBody: Boolean((row.body_md || "").trim()),
    updatedAt: row.updated_at || null,
    lastSentAt: row.last_sent_at || null,
    lastSentCount: row.last_sent_count || 0,
  };
}

// 還沒跑「移除 singleton 約束」那行 SQL 時，Postgres 會回 23514（check_violation）。
// 這種情況要給看得懂的指示，不能丟原始錯誤給使用者。
export function isSingletonConstraintError(error) {
  const code = error?.code || "";
  const msg = `${error?.message || ""}${error?.details || ""}`;
  return code === "23514" || /newsletter_singleton/i.test(msg);
}

export const SINGLETON_HINT =
  "資料庫仍限制電子報只能有一份草稿。請在 Supabase SQL Editor 執行：ALTER TABLE newsletter DROP CONSTRAINT IF EXISTS newsletter_singleton;";

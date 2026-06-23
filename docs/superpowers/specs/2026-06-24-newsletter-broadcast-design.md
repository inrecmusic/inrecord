# 後台電子報群發（Newsletter Broadcast）— 設計 spec

日期：2026-06-24　分支：feat/point2-carousel

## Context（為什麼做）

使用者要在 InRecord 後台「手動編輯電子報文字 → 一鍵群發給學員」。目前系統只有交易信
（購買成功、開課通知，單收件人），沒有群發機制；也沒有對外的訂閱表單。釐清後決定：
**收件對象是 InRecord 自己的學員資料**（非 Brevo 名單、非訂閱表單），由後台每次發信前二選一：

- **購課學員**：`enrollments` 表的 email（已開通課程者）
- **註冊官網帳號**：Supabase Auth 使用者 email

寄送採 **A 方案：逐封 Brevo 交易信**（重用現有 `lib/brevo-email.js` 模式）。Brevo 免費方案每日上限
300 封，碰到上限就停止並回報（之後量大再升級為 Brevo Campaign＝B 方案，不在本次範圍）。

## 設計

### ① 後台分頁「電子報」（app/admin/page.jsx）
- 加進 `NAV_GROUPS`「設定」群組（隱私權/條款旁），新 `NewsletterPage` 元件。
- UI：**標題**輸入框、**內文** Markdown textarea（＋預覽，重用 `renderMd`）、**收件對象** radio（購課學員 / 註冊官網帳號）、按鈕：**儲存草稿**、**寄測試給我自己**、**正式群發**（二次確認 `window.confirm`）。
- 顯示上次寄送：`last_sent_at` / `last_sent_count`，與最近一次回報（成功/失敗/是否觸頂）。

### ② 純函式（TDD）— `lib/newsletter.js`
- `mdToHtml(md)`：受限 Markdown→HTML（`#`/`##`/`###` 標題、`**粗**`、`*斜*`、`-` 清單、`---` 分隔線、段落/換行），**文字一律 HTML 跳脫**防注入。
- `renderNewsletterHtml({ subject, bodyMd, siteUrl })`：把 `mdToHtml` 結果包進品牌化 email 外框（沿用 `brevo-email.js` 風格），標題置頂，**信末退訂句**「不想再收到請直接回信告知」。
- `dedupeEmails(emails)`：trim + 轉小寫 + 去重 + 濾掉空/格式不符。

### ③ 寄送與名單（TDD，依賴注入）— `lib/newsletter-send.js`
- `gatherAudienceEmails(supabase, audience)`：`'buyers'`→ `enrollments.select('email')`；`'registered'`→ `supabase.auth.admin.listUsers()`（分頁）。回去重後 email 陣列。
- `sendNewsletterBatch({ emails, send, dailyLimit })`：逐封呼叫注入的 `send(email)`（回 `{success, limitHit, error}`）；遇 `limitHit` 立即停止。回 `{ total, sent, failed, limitHit, errors }`。

### ④ Brevo 寄送封裝 — `lib/brevo-email.js` 增 `sendNewsletterEmail({ to, subject, html })`
- POST `https://api.brevo.com/v3/smtp/email`，回 `{ success, limitHit, error }`。`limitHit` 依 Brevo 每日上限錯誤判定（實作時以 Context7 查 Brevo 確切錯誤碼/訊息）。

### ⑤ API（管理員 JWT）
- `GET/PATCH /api/admin/newsletter`：讀/存草稿（`subject`, `body_md`），單列 upsert（沿用 `sale_settings` 模式）。
- `POST /api/admin/newsletter/send` `{ audience, test }`：`test=true` 只寄 `ADMIN_EMAIL`；否則 `gatherAudienceEmails`→`renderNewsletterHtml`→`sendNewsletterBatch`（`send` 用 `sendNewsletterEmail`，`dailyLimit` 預設 300）。寄完更新 `last_sent_at`/`last_sent_count`，回報 summary。

### ⑥ DB 遷移（supabase-deploy.sql，idempotent）
```sql
CREATE TABLE IF NOT EXISTS newsletter (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  subject         TEXT NOT NULL DEFAULT '',
  body_md         TEXT NOT NULL DEFAULT '',
  last_sent_at    TIMESTAMPTZ,
  last_sent_count INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT newsletter_singleton CHECK (id = 'default')
);
INSERT INTO newsletter (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_newsletter" ON newsletter;
CREATE POLICY "service_role_newsletter" ON newsletter
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

## 重用
`DocEditorPage`/`renderMd`（編輯/預覽）、`brevo-email.js`（寄信）、`lib/adminAuth.js`（驗證）、`sale_settings` 式 API、`getSupabaseAdmin`。

## 風險 / 安全
- 「正式群發」寄真信、收不回 → 二次確認 + 強烈建議先寄測試。
- 內文一律 HTML 跳脫防注入。
- 每日 300 上限 → 觸頂即停並明確回報「已寄 X、剩 Y 未寄」。
- 退訂：MVP 用「回信告知」，量大升級 B 方案時改正規退訂連結。

## 驗證
- 單元：`lib/newsletter.js`（mdToHtml 各語法/跳脫、退訂句、dedupe）、`lib/newsletter-send.js`（buyers/registered 取名單、batch 觸頂即停/成功失敗計數）— 皆依賴注入、不打真信。
- 整合：preview 部署後，後台「寄測試給我自己」實際收到一封 → 再小範圍驗證群發回報數字。
- 全套件 `vitest run` 綠。

## 不在範圍
B 方案（Brevo Campaign/正規退訂連結）、排程寄送、開信率分析、對外訂閱表單。

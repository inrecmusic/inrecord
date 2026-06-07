# InRecord — 零基礎流行鋼琴入門課

Next.js 14 App Router 線上課程平台。買斷制（無訂閱），PAYUNi 金流、Amego 電子發票、Supabase 資料庫、Brevo Email、Bunny/Vimeo 影片。

> 架構決策、資料表、API 與環境變數的權威說明見 **`CLAUDE.md`**。本檔僅作快速上手。

## 技術架構

| 層次 | 技術 |
|------|------|
| 前端框架 | Next.js 14 App Router |
| 資料庫 | Supabase（PostgreSQL） |
| 金流 | PAYUNi 統一金流（整合支付頁 upp） |
| 電子發票 | 光貿 Amego |
| Email | Brevo（名單 + 交易信） |
| 影片 | Bunny Stream / Vimeo |
| 部署 | Vercel |

## 方案（買斷制，永久有效）

| plan key | 方案 | 售價 |
|----------|------|------|
| `course` | 課程單賣 | NT$3,800 |
| `bundle` | 課程包 AI（首頁主打） | NT$3,999 |
| `game`   | AI 遊戲單買 | NT$1,200 |

價格權威來源為後端 `lib/plans.js` 的 `PLAN_CATALOG`，checkout 不信任前端傳入的價格。

## 快速開始

### 1. 安裝依賴
```bash
npm install
```

### 2. 設定環境變數
```bash
cp .env.local.example .env.local
# 依檔內註解填入各服務金鑰；完整清單見 CLAUDE.md
```

### 3. 設定資料庫（Supabase）
SQL Editor 依序執行：
`supabase-schema.sql` → `supabase-schema-classroom.sql` / `supabase-schema-music.sql` → `supabase-deploy.sql`（彙整發票欄位 / coupons / courses，idempotent）。

### 4. 啟動開發伺服器
```bash
npm run dev
# 前台：http://localhost:3000
# 後台：http://localhost:3000/admin
```

## 購買開通流程（PAYUNi）

```
BuyModal（需先登入）
  ↓ POST /api/payuni/checkout  { plan, email, couponCode? }
  └── 後端決定價格 → 寫 pending orders → 回傳 PAYUNi 整合支付頁欄位

付款成功
  ├── 前景導回 ReturnURL /api/payuni/return → 303 轉址 /success
  └── 背景通知 NotifyURL /api/payuni/notify（開通的權威來源）
        ├── course / bundle → upsert enrollments（課程永久）
        ├── game / bundle   → insert subscriptions（expires_at=2999-12-31）
        ├── 寄送開課確認信（Brevo）
        ├── 開立電子發票（Amego）
        └── 優惠券使用次數 +1
```

## 部署到 Vercel
```bash
npx vercel --prod
# 並在 Vercel Dashboard 設定所有正式環境變數
```

## 後台登入
- URL：`/admin`
- 帳密由 `.env.local` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 設定（正式上線請改強密碼）。

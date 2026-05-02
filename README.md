# InRecord 流行鋼琴零基礎入門課 v3 — Next.js + Supabase

## 技術架構

| 層次 | 技術 |
|------|------|
| 前端框架 | Next.js 14 App Router |
| 樣式 | CSS Modules |
| 資料庫 | Supabase（PostgreSQL） |
| Email 名單 | Brevo（原 Sendinblue） |
| 金流 | Stripe Checkout |
| 部署 | Vercel |

## 檔案結構

```
inrecord/
├── app/
│   ├── layout.jsx          # Root Layout
│   ├── page.jsx            # 前台首頁
│   ├── page.module.css
│   ├── globals.css
│   ├── admin/
│   │   ├── page.jsx        # 後台（儀表板 + 名單 + 整合設定）
│   │   └── admin.module.css
│   ├── success/
│   │   └── page.jsx        # Stripe 付款成功頁
│   └── api/
│       ├── brevo/subscribe/route.js   # Brevo 訂閱 + Supabase 寫入
│       ├── stripe/checkout/route.js   # Stripe Checkout Session
│       └── admin/leads/route.js       # 後台試看名單 CRUD
├── components/
│   ├── Logo.jsx / Logo.module.css
│   ├── PreviewModal.jsx / .module.css
│   └── BuyModal.jsx / .module.css
├── lib/
│   └── supabase.js         # Supabase 客戶端
├── supabase-schema.sql     # 資料庫 Schema
├── .env.local.example      # 環境變數範本
├── next.config.js
└── package.json
```

## 快速開始

### 1. 安裝依賴
```bash
npm install
```

### 2. 設定環境變數
```bash
cp .env.local.example .env.local
# 用編輯器填入所有值
```

### 3. 設定 Supabase
1. 前往 [supabase.com](https://supabase.com) 建立新專案
2. SQL Editor → 貼上 `supabase-schema.sql` → Run
3. Settings → API → 複製 URL 和 keys 填入 `.env.local`

### 4. 設定 Brevo
1. [app.brevo.com](https://app.brevo.com) → Settings → API Keys → 建立 Key
2. Contacts → Lists → 建立名單，記下 List ID
3. Settings → Senders → 新增並驗證寄件人 Email

### 5. 設定 Stripe
1. [dashboard.stripe.com](https://dashboard.stripe.com) → 測試模式
2. Developers → API Keys → 複製 `sk_test_xxx`
3. Products → Add product → 新增 6 個 One-time Price（幣別 TWD）
4. 複製每個 `price_xxx` 填入 `.env.local`

### 6. 啟動開發伺服器
```bash
npm run dev
# 前台：http://localhost:3000
# 後台：http://localhost:3000/admin
```

### 7. 部署到 Vercel
```bash
npx vercel --prod
# 記得在 Vercel Dashboard 設定所有環境變數
```

## 後台登入
- URL：`/admin`
- 預設密碼：`ChangeMe123!`（請在 `.env.local` 的 `ADMIN_PASSWORD` 修改）

## 資料流

```
前台 Modal 填寫 Gmail
  ↓
POST /api/brevo/subscribe
  ├── Brevo：加入名單 + 寄送試看 Email
  └── Supabase：寫入 course_preview_leads 表

前台選擇方案 → 點購買
  ↓
POST /api/stripe/checkout
  └── Stripe：建立 Checkout Session → 跳轉結帳

付款成功
  └── 跳轉 /success?session_id=xxx
```

-- ⚠️ 只在 preview 專案跑！內容是假的（測試課程、測試訂單、測試公告），絕對不要貼到正式站。
-- 目的：讓 preview 環境一開就有東西可看：教室開放、一門課兩個單元、一個已開通的測試學員、一則公告。

-- 教室強制開放、牌價與正式站一致、無波段
INSERT INTO sale_settings (id, open_at, list_price, list_anchor, waves, lock_override)
VALUES ('default', NOW() - INTERVAL '1 day', '{"course":3800,"bundle":3999}', '{"course":3800,"bundle":3999}', '[]', 'open')
ON CONFLICT (id) DO UPDATE SET lock_override = 'open', list_price = EXCLUDED.list_price;

-- 課程清單 metadata
INSERT INTO courses (title, description, price, status)
VALUES ('從零開始學鋼琴（preview）', 'preview 測試用課程，資料是假的', 3999, 'published');

-- 一章兩單元（沒掛 Bunny 影片 → 播放頁會顯示「尚未上架」的樣子；要測影片就到後台把 bunny_video_id 填上）
WITH ch AS (
  INSERT INTO chapters (title, sort_order) VALUES ('Ch1 先坐上琴椅（preview）', 1) RETURNING id
)
INSERT INTO videos (chapter_id, title, sort_order, published)
SELECT id, '1-1 課程介紹（preview）', 1, TRUE FROM ch
UNION ALL
SELECT id, '1-2 認識鍵盤與手型（preview）', 2, TRUE FROM ch;

-- 測試學員：一筆手動開通單＋課程開通（早鳥覆寫）＋遊戲存取
INSERT INTO orders (email, plan, plan_label, amount, status, source, mer_trade_no)
VALUES ('changaa68332@gmail.com', 'bundle', '課程包（課程＋AI遊戲）', 0, 'paid', 'manual', 'MANUAL-preview-seed');
INSERT INTO enrollments (email, course_id, early_override)
VALUES ('changaa68332@gmail.com', 'piano-101', 'early')
ON CONFLICT (email, course_id) DO UPDATE SET early_override = 'early';
INSERT INTO subscriptions (email, plan_type, status, expires_at, source)
VALUES ('changaa68332@gmail.com', 'bundle', 'active', '2999-12-31', 'manual');

-- 一則公告（置頂、已發布）
INSERT INTO announcements (title, body, pinned, published)
VALUES ('這是 preview 環境', '這裡的資料都是假的，隨便測、隨便刪。\n\n- 公告支援 **粗體** 與條列\n- 網址會自動變連結 https://inrecordmusic.com', TRUE, TRUE);

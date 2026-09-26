-- supabase-scores.sql — 互動樂譜（一份 ABC 文字譜，學生端可切換五線譜／簡譜）
-- idempotent，可重複執行。與 materials.kind='score'（上傳的 PDF 樂譜）並存、互不影響。

CREATE TABLE IF NOT EXISTS public.scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID REFERENCES public.videos(id) ON DELETE CASCADE, -- 掛在哪個單元；NULL＝尚未掛（後台可先建好）
  title       TEXT NOT NULL,
  subtitle    TEXT,                       -- 例：右手旋律
  abc         TEXT NOT NULL,              -- 單一來源：ABC 文字譜（五線譜、簡譜、跟奏都從這裡來）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scores_video_idx ON public.scores (video_id, sort_order);
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

-- 只給 service_role：學生端一律經 /api/classroom/scores（驗 JWT ＋ enrollment）取用，
-- 與 games/videos 一致，避免光憑 anon key 就能把付費教材整包撈走。
DROP POLICY IF EXISTS service_role_all_scores ON public.scores;
CREATE POLICY service_role_all_scores ON public.scores
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── 範例資料：小蜜蜂（右手旋律，C 大調 2/4）────────────────────────────────
-- 預設掛在「1-2 【跟練】 Do 之歌」後面；要換單元就改下面 WHERE 的標題。
INSERT INTO public.scores (video_id, title, subtitle, abc, sort_order, published)
SELECT v.id, '小蜜蜂', '右手旋律', $abc$X:1
T:小蜜蜂
C:右手旋律
M:2/4
L:1/8
Q:1/4=96
K:C
"C" G2 E E | "G7" F2 D D | "C" C D E F | "C" G2 G2 |
"C" G2 E E | "G7" F2 D D | "C" C E G G | "C" E4 |
"G7" D D D D | "G7" D2 E F | "C" E E E E | "C" E2 F G |
"C" G2 E E | "G7" F2 D D | "C" C E G G | "C" C4 |$abc$, 0, TRUE
FROM public.videos v
WHERE v.title LIKE '1-2%Do 之歌%'
  AND NOT EXISTS (SELECT 1 FROM public.scores s WHERE s.title = '小蜜蜂' AND s.video_id = v.id)
LIMIT 1;

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
-- ⚠️ 同一拍的八分音符要寫在一起不加空格（EE、CD EF），abcjs 才會畫連桿；
--    寫成 E E 會變成一個個獨立符尾，五線譜很難讀。解析器兩種寫法結果相同，
--    簡譜的底線分組也不受影響（groupByBeat 自己依拍點算）。
-- 掛在第一支 1-2 單元，且優先挑「已經有影片」的那支。
-- ⚠️ 為什麼要挑有影片的：播放頁的 handleUnitClick 對沒影片的單元不做任何事（點不進去），
--    掛在沒影片的單元上，樂譜分頁永遠打不開。同編號可能有兩支（正課與【跟練】），
--    所以用 ORDER BY 把有影片的排前面，而不是寫死標題。
INSERT INTO public.scores (video_id, title, subtitle, abc, sort_order, published)
SELECT v.id, '小蜜蜂', '右手旋律', $abc$X:1
T:小蜜蜂
C:右手旋律
M:2/4
L:1/8
Q:1/4=96
K:C
"C" G2 EE | "G7" F2 DD | "C" CD EF | "C" G2 G2 |
"C" G2 EE | "G7" F2 DD | "C" CE GG | "C" E4 |
"G7" DD DD | "G7" D2 EF | "C" EE EE | "C" E2 FG |
"C" G2 EE | "G7" F2 DD | "C" CE GG | "C" C4 |$abc$, 0, TRUE
FROM public.videos v
WHERE v.title LIKE '1-2%'
  AND NOT EXISTS (SELECT 1 FROM public.scores s WHERE s.title = '小蜜蜂')
ORDER BY (COALESCE(v.bunny_video_id, v.vimeo_id) IS NULL), v.title
LIMIT 1;

-- 互動樂譜 v2 第一批（2026-10-29）：雙手 MusicXML 曲目＋曲目↔單元多對多
--
-- 前置：supabase-scores.sql（scores 表與 ABC 小蜜蜂）。
-- 只做加法、可重複執行：preview 與正式站共用同一個資料庫，舊 ABC 那筆小蜜蜂（format 預設 'abc'）照常可用。
--
-- scores 新欄位：
--   format      'abc'（舊版 ABC 文字譜）｜'musicxml'（v2 雙手譜）
--   musicxml    原始 MusicXML 文字（.mxl 由後台在瀏覽器端解壓後存文字）
--   difficulty  1 入門／2 初級／3 中級（可空）
--   meta        匯入時解析出的摘要：{ title, tempo, key, time, measureCount, hasChords, warnings }
--   version     每次換新版 MusicXML 加 1（第二批練習紀錄對應版本用）
--   file_name   上傳時的檔名
--   subtitle    沿用為「作者／出處」
-- score_units：一首曲可掛多個單元、一個單元可掛多首（v2 曲目用；舊 ABC 那筆仍用 scores.video_id）。

ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS format     TEXT    NOT NULL DEFAULT 'abc';
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS musicxml   TEXT;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS difficulty SMALLINT;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS meta       JSONB;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS file_name  TEXT;
ALTER TABLE public.scores ALTER COLUMN abc DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scores_format_check') THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_format_check CHECK (format IN ('abc', 'musicxml'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scores_content_check') THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_content_check CHECK (
      (format = 'abc' AND abc IS NOT NULL) OR (format = 'musicxml' AND musicxml IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scores_difficulty_check') THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_difficulty_check CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.score_units (
  score_id   UUID NOT NULL REFERENCES public.scores(id) ON DELETE CASCADE,
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (score_id, video_id)
);
CREATE INDEX IF NOT EXISTS score_units_video_idx ON public.score_units (video_id, sort_order);

ALTER TABLE public.score_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_score_units ON public.score_units;
CREATE POLICY service_role_all_score_units ON public.score_units
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

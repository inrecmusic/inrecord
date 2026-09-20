-- 2026-09-20 健檢・決定 3：完成判定的分母不可被前端調低
--
-- 背景：完成判定用「這次呼叫送來的 total_seconds」算 70%，連送兩次 total_seconds=1
-- 就能把任一單元刷成完成、進而取得結業證書。
--
-- 路由層（app/api/classroom/progress/route.js）已改成以後台 videos.duration 當權威分母，
-- 有填 duration 的單元在這段 SQL 執行前就已經受保護。
-- 這段是「後台沒填 duration」的單元的保底：門檻分母取 GREATEST(已存長度, 本次長度)，
-- 只能往上、不會被後來送進來的小 total 調低。
--
-- 安全性：CREATE OR REPLACE，可重複執行；不改資料表、不改既有資料。
-- 執行位置：Supabase 正式專案 → SQL Editor → 貼上整段 → Run。

CREATE OR REPLACE FUNCTION public.upsert_progress(
  p_user_id UUID, p_video_id UUID, p_watched INTEGER, p_total INTEGER, p_completed BOOLEAN,
  p_viewed_delta INTEGER DEFAULT 0
) RETURNS public.progress
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.progress (user_id, video_id, watched_seconds, total_seconds, viewed_seconds, completed, watched_at)
  VALUES (p_user_id, p_video_id, GREATEST(p_watched, 0), GREATEST(p_total, 0), GREATEST(p_viewed_delta, 0), p_completed, NOW())
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    watched_seconds = GREATEST(progress.watched_seconds, EXCLUDED.watched_seconds),
    total_seconds   = GREATEST(progress.total_seconds, EXCLUDED.total_seconds),
    viewed_seconds  = progress.viewed_seconds + GREATEST(p_viewed_delta, 0),
    completed       = progress.completed OR EXCLUDED.completed
                      OR (GREATEST(progress.total_seconds, GREATEST(p_total,0)) > 0
                          AND progress.viewed_seconds + GREATEST(p_viewed_delta,0)
                              >= FLOOR(GREATEST(progress.total_seconds, GREATEST(p_total,0)) * 0.7)),
    watched_at      = NOW()
  RETURNING *;
$$;

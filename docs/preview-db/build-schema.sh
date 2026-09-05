#!/usr/bin/env bash
# 依 CLAUDE.md 的部署順序把所有 supabase-*.sql 合併成一份，貼到全新 Supabase 專案的 SQL Editor 一次跑完。
# 用法：cd ~/code/inrecord && bash docs/preview-db/build-schema.sh  → 產出 /tmp/inrecord-preview-schema.sql
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=/tmp/inrecord-preview-schema.sql
ORDER=(
  supabase-schema.sql
  supabase-schema-core.sql
  supabase-schema-classroom.sql
  supabase-schema-music.sql
  supabase-deploy.sql
  supabase-classroom-features.sql
  supabase-tracking.sql
  supabase-recovery.sql
  supabase-ad-insights.sql
  supabase-capi.sql
  supabase-student-profiles.sql
  supabase-game-security.sql
  supabase-newsletter-unsubscribe.sql
  supabase-announcements-important.sql
  supabase-hardening.sql
)
{
  echo "-- InRecord 全新資料庫建置：依 CLAUDE.md 部署順序合併（$(date +%F)）。全部 idempotent。"
  for f in "${ORDER[@]}"; do
    [ -f "$f" ] || { echo "缺檔：$f" >&2; exit 1; }
    printf '\n-- ═══════════════ %s ═══════════════\n' "$f"
    cat "$f"; echo
  done
} > "$OUT"
echo "已產出 ${OUT}（$(wc -l < "${OUT}" | tr -d ' ') 行）"

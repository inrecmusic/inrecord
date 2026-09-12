#!/usr/bin/env bash
# 依 CLAUDE.md 的部署順序把所有 supabase-*.sql 合併成一份，貼到全新 Supabase 專案的 SQL Editor 一次跑完。
# 用法：cd ~/code/inrecord && bash docs/preview-db/build-schema.sh  → 產出 /tmp/inrecord-preview-schema.sql
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=/tmp/inrecord-preview-schema.sql
# 順序修正（2026-09）：
#   ① music 要排第一——chapters／videos 是地基，schema.sql 的 games 與 classroom 的表都參照它們。
#   ② classroom 要排在 music 之後——它 DROP 掉 music 的舊版 ratings／submissions／unit_comments，
#      重建成程式實際在用的版本（ratings.score／user_id）。順序顛倒＝評價功能整組壞。
ORDER=(
  supabase-schema-music.sql
  supabase-schema.sql
  supabase-schema-core.sql
  supabase-schema-classroom.sql
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
  supabase-terms-consent.sql
  supabase-ops-reports.sql
  supabase-payment-events.sql
  supabase-hardening.sql
)
{
  echo "-- InRecord 全新資料庫建置：依 CLAUDE.md 部署順序合併（$(date +%F)）。只給全新空資料庫跑一次。"
  echo "-- ⚠️ 不可對有資料的資料庫重跑：supabase-schema-classroom.sql 會 DROP 掉 留言／評價／作業繳交。"
  for f in "${ORDER[@]}"; do
    [ -f "$f" ] || { echo "缺檔：$f" >&2; exit 1; }
    printf '\n-- ═══════════════ %s ═══════════════\n' "$f"
    cat "$f"; echo
  done
} > "$OUT"
echo "已產出 ${OUT}（$(wc -l < "${OUT}" | tr -d ' ') 行）"

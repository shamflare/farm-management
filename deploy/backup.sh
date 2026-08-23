#!/bin/sh
# نسخة احتياطية من كل شيء — القاعدة تحوي حتى الصور والفواتير، فهذه هي المزرعة
# كلها في ملف واحد. تحتفظ بآخر ٣٠ نسخة وتحذف ما قبلها.
#
#   sh deploy/backup.sh
#   وللتشغيل اليومي:  crontab -e  ثم:
#   0 3 * * * cd /opt/zadfarm && sh deploy/backup.sh >> /var/log/zadfarm-backup.log 2>&1
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y-%m-%d-%H%M)"
mkdir -p "$OUT"

cd "$ROOT"
. deploy/.env

docker compose -f deploy/docker-compose.yml exec -T db \
    pg_dump -U "${POSTGRES_USER:-farm}" -d "${POSTGRES_DB:-farm}" \
    | gzip > "$OUT/zadfarm-$STAMP.sql.gz"

echo "حُفظت: $OUT/zadfarm-$STAMP.sql.gz ($(du -h "$OUT/zadfarm-$STAMP.sql.gz" | cut -f1))"

# القديم يُحذف بعد ٣٠ نسخة، وإلا امتلأ القرص بصمت.
ls -1t "$OUT"/zadfarm-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --

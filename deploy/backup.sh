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

# يُقرأ ما يلزم من ملف الإعدادات سطرًا سطرًا، ولا يُنفَّذ الملف.
# تنفيذه بـ `.` كان يعني أن اسم المزرعة العربي — وفيه مسافة — يُقرأ كأمر
# فيُقال "زاد: not found" وتفشل النسخة كل ليلة بلا أن يلاحظ أحد.
read_env() {
    value=$(sed -n "s/^$1=//p" deploy/.env | head -1 | tr -d '"'"'"'' | tr -d '\r')
    if [ -n "$value" ]; then printf '%s' "$value"; else printf '%s' "$2"; fi
}

DB_USER="$(read_env POSTGRES_USER farm)"
DB_NAME="$(read_env POSTGRES_DB farm)"

docker compose -f deploy/docker-compose.yml exec -T db \
    pg_dump -U "$DB_USER" -d "$DB_NAME" \
    | gzip > "$OUT/zadfarm-$STAMP.sql.gz"

SIZE=$(du -h "$OUT/zadfarm-$STAMP.sql.gz" | cut -f1)
echo "$(date '+%Y-%m-%d %H:%M') حُفظت: $OUT/zadfarm-$STAMP.sql.gz ($SIZE)"

# ملف فارغ يعني فشلًا صامتًا: أسوأ من غياب النسخة أن تظنها موجودة.
if [ ! -s "$OUT/zadfarm-$STAMP.sql.gz" ]; then
    echo "تحذير: النسخة فارغة — راجع أن القاعدة تعمل" >&2
    exit 1
fi

# القديم يُحذف بعد ٣٠ نسخة، وإلا امتلأ القرص بصمت.
ls -1t "$OUT"/zadfarm-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --

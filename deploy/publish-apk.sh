#!/bin/sh
# ينشر نسخة جديدة من التطبيق على zadfarm.net/app
#
#   sh deploy/publish-apk.sh <رابط الـ APK من EAS> [رقم الإصدار]
#
# يُنزّل الملف، يضعه في مجلد البوّاب، ويكتب بيانات النسخة التي تقرأها صفحة
# التنزيل. لا إعادة تشغيل ولا بناء: البوّاب يخدم المجلد مباشرة.
set -e

URL="$1"
VERSION="${2:-}"

if [ -z "$URL" ]; then
    echo "الاستعمال: sh deploy/publish-apk.sh <رابط الـ APK> [الإصدار]" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/deploy/public/app"
mkdir -p "$DIR"

# يُنزَّل إلى ملف مؤقت أولًا: تنزيل يفشل في منتصفه يجب ألا يستبدل نسخة تعمل.
TMP="$DIR/.zadfarm.apk.part"
curl -fL --progress-bar -o "$TMP" "$URL"

# فحص بسيط يمنع نشر صفحة خطأ باسم تطبيق: كل APK ملف ZIP يبدأ بـ PK.
if [ "$(head -c 2 "$TMP")" != "PK" ]; then
    rm -f "$TMP"
    echo "الملف المنزَّل ليس APK — رُفض قبل النشر." >&2
    exit 1
fi

mv "$TMP" "$DIR/zadfarm.apk"

SIZE=$(du -h "$DIR/zadfarm.apk" | cut -f1)
DATE=$(date +%Y-%m-%d)

cat > "$DIR/version.json" <<EOF
{
  "version": "${VERSION:-1.0.0}",
  "size": "$SIZE",
  "date": "$DATE"
}
EOF

echo "نُشر: $DIR/zadfarm.apk ($SIZE)"
echo "الرابط: https://${DOMAIN:-zadfarm.net}/app"

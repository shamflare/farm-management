#!/bin/sh
# ما يجري عند كل إقلاع للخادم، بالترتيب:
#   1. ترحيل القاعدة — آمن ومتكرر، لا يفعل شيئًا إن كانت محدّثة.
#   2. تجهيز المزرعة وحساب المالك إن كانت القاعدة جديدة — لا يلمس الموجود.
#   3. تشغيل gunicorn.
# أي فشل في خطوة يوقف الإقلاع بدل أن يخدم نسخة نصف جاهزة.
set -e

python manage.py migrate --noinput
python manage.py init_farm

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 60 \
    --access-logfile - \
    --error-logfile -

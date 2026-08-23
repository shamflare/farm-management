#!/usr/bin/env bash
# يشغّل الخادم ولوحة الإدارة معًا — نسخة لينكس وماك من dev.ps1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
PYTHON="$ROOT/.venv/bin/python"

if [ ! -x "$PYTHON" ]; then
  echo "  البيئة الافتراضية غير موجودة. أنشئها مرة واحدة:"
  echo "      python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

if [ ! -d "$ROOT/admin-web/node_modules" ]; then
  echo "  حزم لوحة الإدارة غير مثبَّتة:  cd admin-web && npm install"
  exit 1
fi

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo
  echo "  أُغلقت العمليات."
}
trap cleanup EXIT INT TERM

echo
echo "  نظام إدارة المزرعة — بيئة التطوير"
echo "  ----------------------------------"

( cd "$ROOT/backend" && "$PYTHON" manage.py runserver "0.0.0.0:$BACKEND_PORT" ) &
pids+=($!)

( cd "$ROOT/admin-web" && npm run dev -- -p "$FRONTEND_PORT" ) &
pids+=($!)

sleep 3
echo
echo "  لوحة الإدارة   http://localhost:$FRONTEND_PORT"
echo "  الـ API        http://127.0.0.1:$BACKEND_PORT/api/v1/"
echo "  توثيق الـ API  http://127.0.0.1:$BACKEND_PORT/api/docs/"
echo
echo "  الدخول: owner / farm1234    ·    للإيقاف: Ctrl+C"
echo

wait -n

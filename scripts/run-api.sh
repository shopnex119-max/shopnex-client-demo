#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/services/api"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # The .env file is owned and maintained by the local operator.
  source "$ROOT/.env"
  set +a
fi
if [[ -z "${APP_SECRET:-}" || "$APP_SECRET" == replace-with-* || "$APP_SECRET" == development-only* ]]; then
  SECRET_FILE="$API/.secret-key"
  if [[ ! -s "$SECRET_FILE" ]]; then
    umask 077
    python3 -c 'import secrets; print(secrets.token_hex(32))' > "$SECRET_FILE"
  fi
  export APP_SECRET="$(cat "$SECRET_FILE")"
fi
if [[ ! -x "$API/.venv/bin/python" ]]; then
  python3 -m venv "$API/.venv"
  "$API/.venv/bin/python" -m pip install -r "$API/requirements.txt"
fi
cd "$API"
.venv/bin/alembic upgrade head
if [[ "${SHOPNEX_MIGRATE_ONLY:-0}" == "1" ]]; then
  echo "SHOPNEX database migration completed."
  exit 0
fi
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

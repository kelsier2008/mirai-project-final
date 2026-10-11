#!/usr/bin/env bash
set -Eeuo pipefail

echo "[start] applying database migrations"
python -m scripts.bootstrap_demo
if [[ "${SEED_DEMO:-1}" == "1" ]]; then
  echo "[start] ensuring demo accounts exist (SEED_DEMO=1)"
  python -m scripts.seed
fi
echo "[start] launching API on port ${PORT:-10000}"
# Migrations already ran above; skip the duplicate check inside the API.
export AUTO_MIGRATE="${AUTO_MIGRATE:-0}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" --proxy-headers

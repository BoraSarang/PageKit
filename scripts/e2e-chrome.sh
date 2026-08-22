#!/usr/bin/env bash
# scripts/e2e-chrome.sh — PageKit 확장 E2E 스모크 (시스템 Chrome, 브라우저 다운로드 없음)
# usage: ./scripts/e2e-chrome.sh          # 헤드리스 실행
#        E2E_HEADLESS=0 ./scripts/e2e-chrome.sh   # 창 띄워 디버그
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/playwright-core ]; then
  echo "[E2E] playwright-core 설치 중..."
  npm i -D playwright-core --no-fund --no-audit --loglevel=error
fi

exec node e2e/run-smoke.cjs

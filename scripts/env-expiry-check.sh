#!/bin/bash
# scripts/env-expiry-check.sh — 시크릿 만료 체크 (AGENTS.md 8.12장 v0.1 chrome)
# .env.example 내 "# expires: YYYY-MM-DD owner: @borasarang" 파싱
# 만료 30일 전 WARN, 만료 시 ERROR (빌드 실패 유도)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TODAY=$(date +%s)
FOUND=0
FAIL=0

check_env_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  echo "[env-expiry] $f"
  while IFS= read -r line; do
    case "$line" in
      *"# expires:"*)
        local exp owner
        exp=$(echo "$line" | sed -n 's/.*# expires: \([0-9-]*\).*/\1/p')
        owner=$(echo "$line" | sed -n 's/.*owner: \([^ ]*\).*/\1/p')
        if [ -n "$exp" ]; then
          FOUND=$((FOUND+1))
          local exp_s=$(( $(date -j -f %Y-%m-%d "$exp" +%s 2>/dev/null || echo 0) ))
          if [ "$exp_s" -eq 0 ]; then
            echo "  ERROR: 날짜 파싱 실패 ($exp)"
            FAIL=1
          else
            local remain=$(( (exp_s - TODAY) / 86400 ))
            if [ "$remain" -lt 0 ]; then
              echo "  ERROR: 만료됨 ($exp, owner: ${owner:-?}) — 시크릿을 교체하세요"
              FAIL=1
            elif [ "$remain" -le 30 ]; then
              echo "  WARN: ${remain}일 후 만료 ($exp, owner: ${owner:-?})"
            else
              echo "  OK: ${remain}일 남음 ($exp)"
            fi
          fi
        fi
        ;;
    esac
  done < "$f"
}

check_env_file "$ROOT/extension/.env.example"

if [ "$FOUND" -eq 0 ]; then
  echo "[env-expiry] 시크릿 항목 없음 (OK)"
fi
[ "$FAIL" -eq 0 ] || { echo "[env-expiry] 만료 시크릿 존재 — 교체 후 재시도"; exit 1; }
echo "[env-expiry] OK"
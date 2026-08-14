#!/bin/bash
# build_and_run.sh — WPageTools 빌드 디스패처 (AGENTS.md 18장 표준, v0.1 chrome 전용)
# usage:
#   ./build_and_run.sh debug chrome   # 문법 검증 + 환경 체크 + Chrome 프로필 실행
#   ./build_and_run.sh debug all      # chrome 동일 (현재 chrome 단일 플랫폼)
#   ./build_and_run.sh e2e chrome     # E2E 시나리오 체크
#   ./build_and_run.sh help
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT="$ROOT/extension"
MODE="${1:-help}"
PLATFORM="${2:-chrome}"

log()  { printf '\033[1;36m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[build]\033[0m WARN %s\n' "$*"; }
die()  { printf '\033[1;31m[build]\033[0m ERROR %s\n' "$*" >&2; exit 1; }

check_platform() {
  case "$PLATFORM" in
    chrome|all) ;;
    *) die "미지원 플랫폼: $PLATFORM (현재 chrome|all만 지원)" ;;
  esac
}

run_env_expiry() {
  if [ -x "$ROOT/scripts/env-expiry-check.sh" ]; then
    log "env-expiry-check 실행"
    bash "$ROOT/scripts/env-expiry-check.sh" || warn "env-expiry-check 경고/실패 (비차단)"
  fi
}

syntax_check() {
  log "JS 문법 검증 (node --check)"
  local fail=0
  while IFS= read -r f; do
    node --check "$f" >/dev/null 2>&1 || { echo "FAIL $f"; fail=1; }
  done < <(find "$EXT" -name '*.js' -not -path '*/node_modules/*')
  [ "$fail" -eq 0 ] || die "JS 문법 검증 실패"
  log "JS 문법 검증 통과"
}

validate_manifest() {
  log "manifest.json 검증"
  python3 - "$EXT/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
assert m["manifest_version"] == 3, "MV3 필수"
assert m["background"]["service_worker"], "background.service_worker 필수"
assert m["commands"].get("pagekit-open-panel"), "pagekit-open-panel 커맨드 필수"
assert m["commands"].get("pagekit-toggle-debug"), "pagekit-toggle-debug 커맨드 필수"
for k in ("sidePanel","storage","downloads","contextMenus","commands","scripting","activeTab","declarativeNetRequest"):
    assert k in m["permissions"], f"permission 누락: {k}"
print("manifest.json 검증 통과")
PY
}

run_chrome() {
  local profile="$ROOT/.chrome-profile"
  log "Chrome 실행 (확장 로드, 프로필: $profile)"
  mkdir -p "$profile"
  # 테스트 브라우저는 Chrome (2026-08-15 사용자 확정 — Whale은 실사용 중이므로 금지)
  # Chrome 137+는 --load-extension 단독 사용을 무시 → --disable-extensions-except 병행으로 우회
  local chrome_bin="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ ! -x "$chrome_bin" ]; then
    warn "Chrome 미설치 — 수동으로 chrome://extensions → '압축해제된 확장 프로그램 로드' ($EXT)"
    return 0
  fi
  "$chrome_bin" \
    --user-data-dir="$profile" \
    --disable-extensions-except="$EXT" \
    --load-extension="$EXT" \
    --no-first-run --no-default-browser-check >/dev/null 2>&1 &
  log "Chrome 시작됨 (PID $!). 종료: 해당 창 닫기"
  sleep 1
}

do_debug() {
  check_platform
  run_env_expiry
  validate_manifest
  syntax_check
  run_chrome
}

do_e2e() {
  check_platform
  run_env_expiry
  validate_manifest
  syntax_check
  log "E2E: docs/e2e/PLAN.md 시나리오 수동 실행 준비 (Chrome 열림)"
  run_chrome
}

case "$MODE" in
  debug) do_debug ;;
  e2e)   do_e2e ;;
  help|*) cat <<'HELP'
usage: ./build_and_run.sh <mode> <platform>
  debug chrome — 문법 검증 + manifest 검증 + Chrome 확장 로드 실행
  e2e   chrome — 위와 동일 + E2E 시나리오 준비
HELP
  ;;
esac
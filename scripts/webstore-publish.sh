#!/bin/bash
# scripts/webstore-publish.sh — Chrome Web Store 심사 업로드 (AGENTS.md 8.14장, v0.1 dry-run만)
# usage: ./scripts/webstore-publish.sh chrome [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${1:-chrome}"
DRY="${2:---dry-run}"
EXT="$ROOT/extension"

if [ "$PLATFORM" != "chrome" ]; then
  echo "미지원: $PLATFORM (현재 chrome만)"
  exit 1
fi

# 1) 문법 검증 — node --check는 import/export 파일을 가짜 통과시키므로 vm 엄격 파서 사용
echo "[webstore] JS 엄격 파싱 검증 (script+module)"
STRICT_OUT="$(node --experimental-vm-modules "$ROOT/scripts/strict-check.cjs" "$EXT" 2>&1)" || {
  echo "$STRICT_OUT" | grep -A2 '❌'
  echo "FAIL: 구문 검증 실패"
  exit 1
}
echo "  [OK] $(echo "$STRICT_OUT" | grep -c '✅')개 파일"

# 2) 심사 체크리스트 (21.1장)
echo "[webstore] 심사 체크리스트"
python3 - "$EXT/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
checks = []
csp = m.get("content_security_policy", {})
checks.append(("unsafe-eval 없음", "unsafe-eval" not in str(csp)))
checks.append(("web_accessible_resources 최소화", len(m.get("web_accessible_resources", [])) <= 2))
hp = m.get("host_permissions") or []
# <all_urls>는 PERMISSIONS.md에 사용자 승인 기록됨(2026-08-14) — 요청 시 주입 목적 명시 전제로 허용
checks.append(("host_permissions 검토(<all_urls>=승인됨)", (len(hp) == 0) or hp == ["<all_urls>"]))
ok = all(v for _, v in checks)
for name, v in checks:
    print(("  [OK] " if v else "  [FAIL] ") + name)
sys.exit(0 if ok else 1)
PY

# 3) ZIP 패키징 (실제 업로드 없이)
PKG="$ROOT/docs/screenshots/chrome/pagekit_$(grep '"version"' "$EXT/manifest.json" | sed 's/[^0-9.]//g').zip"
echo "[webstore] 패키징: $PKG"
mkdir -p "$ROOT/.pkg"
rm -rf "$ROOT/.pkg/pagekit" && cp -R "$EXT" "$ROOT/.pkg/pagekit"
rm -rf "$ROOT/.pkg/pagekit/node_modules" "$ROOT/.pkg/pagekit/.env"
cd "$ROOT/.pkg" && zip -qr "$PKG" pagekit -x "*.DS_Store"
echo "[webstore] 완료: $PKG ($(du -h "$PKG" | cut -f1))"

if [ "$DRY" == "--dry-run" ]; then
  echo "[webstore] DRY-RUN — 업로드 생략. 실 업로드는 chrome-webstore-api(CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN .env) 필요"
else
  echo "[webstore] 실제 업로드는 v0.1 출시 시점에 적용 (8.14장)"
fi
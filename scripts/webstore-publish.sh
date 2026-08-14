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

# 1) 문법 검증
echo "[webstore] JS 문법 검증"
while IFS= read -r f; do node --check "$f" >/dev/null 2>&1 || { echo "FAIL $f"; exit 1; }; done \
  < <(find "$EXT" -name '*.js' -not -path '*/node_modules/*')

# 2) 심사 체크리스트 (21.1장)
echo "[webstore] 심사 체크리스트"
python3 - "$EXT/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
checks = []
csp = m.get("content_security_policy", {})
checks.append(("unsafe-eval 없음", "unsafe-eval" not in str(csp)))
checks.append(("web_accessible_resources 최소화", len(m.get("web_accessible_resources", [])) <= 2))
checks.append(("host_permissions 없음(배포용)", not m.get("host_permissions") or set(m.get("host_permissions")) <= {"http://127.0.0.1/*", "http://localhost/*"}))
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
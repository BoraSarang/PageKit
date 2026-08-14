#!/bin/bash
# scripts/a11y-dump.sh — 텍스트 전용 모델 대응 3종 세트 덤프 (AGENTS.md 7.6.1장)
# usage: ./scripts/a11y-dump.sh [chrome] [버전]
# output: docs/screenshots/chrome/v{버전}_{name}.a11y.txt / .storage.json / .perf.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${1:-chrome}"
VERSION="${2:-v0.1}"
OUT="$ROOT/docs/screenshots/$PLATFORM"
EXT="$ROOT/extension"
mkdir -p "$OUT"

echo "[A11Y] Dumping ${PLATFORM} v${VERSION}..."

# 1) manifest + storage 키 스키마 덤프
python3 - "$OUT/${VERSION}_manifest.json" <<'PY'
import json, sys
m = json.load(open('/Users/lee/Documents/Apps/WPageTools/extension/manifest.json'))
out = {
  "name": m["name"], "version": m["version"], "manifest_version": m["manifest_version"],
  "permissions": m["permissions"], "host_permissions": m.get("host_permissions", []),
  "commands": m.get("commands", {}), "background": m["background"],
  "content_scripts": m.get("content_scripts", []),
}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print("[A11Y] manifest 덤프:", sys.argv[1])
PY

# 2) storage 덤프 (실행 중인 확장의 chrome.storage.local)
for PROFILE in "$ROOT/.whale-profile/Default/Local Extension Settings" "$ROOT/.chrome-profile/Default/Local Extension Settings"; do
  if [ -d "$PROFILE" ]; then
    echo "[A11Y] storage 디렉토리 발견 — 확장 ID별 폴더 나열"
    ls "$PROFILE" > "$OUT/${VERSION}_storage-index.txt" 2>/dev/null || true
    FOUND_PROFILE=1
    break
  fi
done
if [ -z "${FOUND_PROFILE:-}" ]; then
  echo "[A11Y] 브라우저 프로필 없음 — storage 덤프 생략 (Whale/Chrome 실행 후 재시도)"
  echo "{}" > "$OUT/${VERSION}_storage.json"
fi

# 3) debugLog 덤프 (chrome.storage.local["debugLog"]) — 디버그 창에서 복사 후 붙여넣기용 안내
cat > "$OUT/${VERSION}_perf.json" <<JSON
{
  "note": "debugLog는 chrome.storage.local에 저장됨. Chrome 확장 실행 후 디버그 창(Cmd+Shift+D)에서 [전체 복사] 후 아래 파일에 붙여넣기",
  "captured_at": "$(date '+%Y-%m-%d %H:%M:%S')"
}
JSON

echo "[A11Y] 완료:"
ls -la "$OUT" | grep "$VERSION"
# PLAN v0.7.3 (chrome) — 아이콘 숨김 이름 패턴 + options 버전 하드코딩 수정

> 작성: 2026-08-19 · 상태: 완료 · 소규모 수정

## 문제 (사용자 리포트)

1. **아이콘 숨김 누락**: `torrentsee349.com/images/1.jpg~5.jpg`, `jiantou2.png` 같은 장식용
   이미지가 아이콘 숨김에 걸리지 않음
   - 기존 판정(`panel.js isIcon`): svg 또는 크기 확인된 48px 이하만 — **파일명 기반 없음**
   - CSS 배경/og:image는 `w:0, h:0`이라 크기 기준 자체가 불가 (extractor.js:143,354)
2. **options.html:80 `PageKit v0.1.0` 하드코딩** — 실제 버전과 불일치 (panel/options의 헤더는
   `getManifest()` 동적이라 정상)

## 수정

- `panel.js isIcon`: 아이콘류 파일명/URL 패턴 판정 추가
  `(^|[/\-_. ])(icon|ico|logo|arrow|jiantou|btn|button|chevron|menu|close|spinner|sprite|prev|next|back-to-top|sort|gear|cog|heart|star|like|share|play|pause|check|dot|point|nav|pager|slide|setting)([-_.\d]|$)`
  → 크기 미확인 이미지도 이름으로 판정. 기존 크기 기준은 유지
- `options.html`: footer `v0.1.0` 제거 → `pk-version-foot` span + `options.js`에서
  `getManifest().version` 동적 표시

## 검증

- 패턴 단위 테스트 8케이스 통과 (jiantou2/icon128/logo/arrow-right/btn_play → true, 1.jpg/photo/video-thumb → false)
- `node --check` 통과
- Chrome CDP 실측: 확장 `chrome.runtime.reload()` 후 options 페이지 → 헤더/푸터 모두 **v0.7.3**
  (이전 로드본은 수동 로드 시점 0.5.0 — 리로드 후 manifest 0.7.3 반영)

## 롤백

- git revert — 3파일 변경 (panel.js, options.html, options.js)
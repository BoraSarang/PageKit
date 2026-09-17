# PLAN v1.0.12 (safari) — Safari macOS 확장 추가

> 작성: 2026-09-17 · 상태: 진행중 · 대상 버전: v1.0.12 · Epic: WPageTools-zs6

## 배경

Chrome 확장(PageKit v1.0.11)을 Safari macOS용으로 이식한다.
Safari Web Extensions는 Chrome MV3와 manifest·JS 상당 부분을 공유하지만,
`sidePanel` API가 없고 `downloads`·`declarativeNetRequest` 세션 규칙은
packager 감사로 실측이 필요하다.

## 제약 (사용자 확정 ×4, 2026-09-17)

1. **지원 범위 = macOS만** — iOS의 `windows.create`·`contextMenus`·`webRequest` 제약을 회피.
2. **사이드패널 대체 = 팝업 윈도우** — `windows.create({type:'popup', width:420, height:720})`에 동일 `panel.html`·`quality-tab.html?auto=1` 재사용.
3. **기능 범위 = 전체 이식** — 미디어/스트림/품질진단 전부. 감사에서 불가 판정 시 degraded 안내로 강등 (삭제 아님).
4. **배포 = 로컬 개발용만** — 무서명 + Safari 개발자모드 실행. App Store/TestFlight는 별도 스코프.
5. **번들ID = `com.borasarang.PageKit-for-Safari`** (앱 이름 "PageKit for Safari"에서 packager 자동 생성 — appex prefix 규칙상 부모 ID와 일치 필요, 2026-09-17 확정), Xcode 프로젝트 위치 = `safari/`.
6. **버전 v1.0.12** — 패치만 증가, README/PERMISSIONS/CHANGELOG 동기화.

## 요구

### T-SAF-01 문서
- 본 PLAN + `docs/TODO.md` T-SAF-01~06 등록 + `docs/DESIGN.md` 11장(사파리 패널 호스트) + `docs/safari/PERMISSIONS.md`·`MESSAGING.md` 신규.

### T-SAF-02 호환성 감사
- `xcrun safari-web-extension-packager extension --project-location /tmp/pk-safari-audit --macos-only --no-open --no-prompt` 실행, `downloads`·`offline_enabled` 경고 수집.
- `scripts/strict-check.cjs`에 사파리 분기 (sidePanel 직접 호출 잔존 검사).
- 판정 매트릭스: `downloads` / DNR 세션 규칙 / `scripting.insertCSS(allFrames)` / `commands` 단축키.

### T-SAF-03 추상화
- `extension/shared/browser-shim.js` 신규 (`browser ?? chrome`, Promise 통일).
- `extension/shared/panel-host.js` 신규 — `kind` 1회 판정(`sidePanel`→`window`), `openFromGesture()`·`panelAvailability()` 제공.
- `background/sidepanel-controller.js` — `chrome.sidePanel` 존재 검사 후 없으면 panel-host 위임. 기존 탭 폴백(`tabs.create`) 유지. 제스처 보존: `setOptions` fire-and-forget 원칙을 사파리 경로에도 적용.
- `popup/popup.js`, `sidepanel/panel.js`·`quality-tab.js` — shim 경유 전환.
- 진입점마다 `[INFO] [FEATURE] Safari ...` 1개 이상, 실패 경로 `[ERROR] E-SAF-...` + `error_message_ko.json` 매핑.

### T-SAF-04 Xcode 프로젝트
- `xcrun safari-web-extension-packager extension --project-location safari/ --macos-only --app-name "PageKit for Safari" --bundle-identifier com.borasarang.PageKit-for-Safari --no-open --no-prompt`
- 빌드 산출물은 `/Users/lee/Applications/PageKit for Safari.app`에 복사 (기존 있으면 교체).
- 원본 참조 방식 (copy-resources 미사용) — Chrome 수정이 사파리에 즉시 반영.

### T-SAF-05 빌드·버전
- `build_and_run.sh`에 `debug safari`·`e2e safari` 추가: `node --check` + manifest 검증(사파리 분기) + `xcodebuild -project safari/PageKit/PageKit.xcodeproj -scheme PageKit -configuration Debug build`.
- `manifest.json` 1.0.11→1.0.12 + README 배지 + `docs/chrome/PERMISSIONS.md` 버전 필드 + CHANGELOG.

### T-SAF-06 검증
- `node --check`, `strict-check`, `node e2e/run-smoke.cjs` (Chrome 회귀).
- Safari 수동: 팝업 렌더 → 팝업 윈도우 패널 → 분석 1건 → 다운로드 1건. DebugPanel 로그 첨부.

## 에러코드 (신규, `E-SAF-*`)

| 코드 | 상황 | 사용자 메시지 키 |
|---|---|---|
| `E-SAF-UI-1001` | 팝업 윈도우 패널 열기 실패 | `safariPanelOpenFailed` |
| `E-SAF-DL-1001` | `downloads` 미지원/실패 (앵커 폴백 실패 포함) | `safariDownloadFailed` |
| `E-SAF-NET-1001` | DNR 세션 규칙 미지원 (스트림 감지 degraded) | `safariStreamDegraded` |

## T-SAF-07 후속 (2026-09-17, 툴바 진입 분석 실패)

- 증상: 우클릭 진입은 분석 성공, 툴바 클릭은 패널만 뜨고 분석 실패.
- 원인: Safari 팝업 윈도우는 별도 창이라 `currentWindow` 조회가 확장 페이지 자신을 반환 → http 탭을 못 찾아 `analyze()`가 조용히 리턴. 우클릭은 `contextTarget`에 탭ID를 직접 들고 있어 정상.
- 수정: `shared/browser-shim.js`에 `queryActivePageTab()` 추가 (lastFocusedWindow 우선 + 모든 창 활성 탭 폴백 + currentWindow 스캔). 적용: `panel.js`(분석·자동재분석) · `popup.js`(윈도우ID 조회) · `quality-tab.js`(깨진 링크 강조 대상 탭).
- Chrome은 `supportsSidePanel()===true`라 기존 `currentWindow` 경로 그대로 (회귀: smoke 통과).

## T-SAF-08 후속 (2026-09-17, Safari 유튜브 해상도 목록 미표시)

- 증상: 스트림 탭에 유튜브 영상은 나오나 형식(해상도) 목록이 비어 있음.
- 원인 추정: 해상도 목록은 innertube player API(ANDROID_SDKLESS) 응답에서 오는데, Safari 콘텐츠 스크립트의 fetch가 차단되어 0건. 캡처(webRequest) 경로는 살아 있어 영상 항목만 표시됨.
- 수정: `MSG.YOUTUBE_PLAYER_FETCH` 신규 → SW가 확장 오리진에서 player API 직접 호출(`<all_urls>`라 CORS 무관, ANDROID 클라이언트는 쿠키 불필요) → extractor는 직접 호출 0건일 때만 BG 폴백으로 재시도. 기존 병합 로직은 `pushYoutubeFormats()`로 분리해 양쪽이 공유. Chrome 정상 경로는 그대로 (회귀: smoke 통과).

## 롤백 계획

- shim·panel-host는 기존 Chrome 경로를 분기로 보존 → 문제 시 사파리 분기만 우회.
- Xcode 프로젝트는 재생성 가능 (`--force` 재생성). `safari/` 전체 삭제 후 재생성.
- manifest 버전만 변경이므로 Chrome 스토어 심사에 영향 없음.

## 검증 표준

- `node --check` (신규 shared 2종 포함)
- `node --experimental-vm-modules scripts/strict-check.cjs extension`
- `node e2e/run-smoke.cjs` (Chrome 회귀)
- `xcodebuild -project "safari/PageKit for Safari/PageKit for Safari.xcodeproj" -scheme "PageKit for Safari" -configuration Debug build`
- Safari 수동 체크리스트 (T-SAF-06)

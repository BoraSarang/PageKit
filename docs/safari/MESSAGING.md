# MESSAGING.md — Safari 메시지 규약

**버전**: v1.0.12 / **플랫폼**: safari (macOS만)

---

## 1. 개요

- Chrome과 동일하게 `runtime.sendMessage` 경유, 타입 상수는 `shared/messages.js` 공유.
- Safari도 `chrome.*`·`browser.*` 네임스페이스를 지원하므로 `shared/browser-shim.js`로 통일.
- BG 단일 라우터 (`service-worker.js`의 `onMessage`) 유지.

## 2. 사파리 특이점

- 사이드패널 열기(`OPEN_SIDE_PANEL`)는 Safari에서 팝업 윈도우 생성으로 매핑 (`shared/panel-host.js`).
- `scripting.insert/removeCSS`의 `allFrames/frameIds` 미지원 → 하이라이트 CSS 주입은 탭 전체 주입으로 폴백.
- `storage.session` 16.4+ — 현 환경(macOS 26) 정상. `contextTarget` 1회용 패턴 유지.
- 실패 경로는 `E-SAF-*` 코드 + `error_message_ko.json` 한국어 메시지.

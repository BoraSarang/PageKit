# MESSAGING.md — Chrome 메시지 규약

**버전**: v0.1.0 / **플랫폼**: chrome

---

## 1. 개요

- 모든 메시지는 `chrome.runtime.sendMessage` 경유
- 타입 상수는 `shared/messages.js`에서 공유 (문자열 하드코딩 금지)
- BG가 단일 라우터 (`service-worker.js`의 `onMessage`)

## 2. 메시지 타입 정의

```js
// shared/messages.js
const MSG = {
  ANALYZE_PAGE: 'pk.analyze.page',
  ANALYZE_PAGE_RESULT: 'pk.analyze.result',
  OPEN_SIDE_PANEL: 'pk.ui.openPanel',
  DOWNLOAD_START: 'pk.dl.start',
  DOWNLOAD_PROGRESS: 'pk.dl.progress',
  DOWNLOAD_STATE: 'pk.dl.state',
  HIGHLIGHT_TOGGLE: 'pk.ui.highlight',
  FLOAT_BUTTON_READY: 'pk.content.floatReady',
  SETTINGS_GET: 'pk.settings.get',
  SETTINGS_SET: 'pk.settings.set',
  UNLOCK_TOGGLE: 'pk.unlock.toggle',
  ENSURE_INJECTED: 'pk.inject.ensure'
};
```

## 3. 메시지 흐름

### 3.1 분석 실행 (팝업/사이드 패널 → BG → content → BG → UI)

```
UI ──ANALYZE_PAGE──▶ BG ──ANALYZE_PAGE──▶ content(extractor)
UI ◀──ANALYZE_PAGE_RESULT── BG ◀──ANALYZE_PAGE_RESULT── content
```

### 3.1-1 콘텐츠 스크립트 주입 보장 (ENSURE_INJECTED)

```
UI ──ENSURE_INJECTED {tabId}──▶ BG ──executeScript(RUN_SCRIPTS)──▶ tab
```

- **중요**: 팝업/사이드 패널(확장 페이지)에서 보낸 메시지에는 `sender.tab`이 없음
  → 반드시 `payload.tabId`로 대상 탭을 명시 (2026-08-14 수정)
- BG는 `message.tabId ?? sender.tab?.id` 우선순위로 판정
- 주입 여부는 `chrome.storage.session["injected:{tabId}"]`로 캐시 (중복 주입 방지)
- 콘텐츠 스크립트 부재 시 `tabs.sendMessage(ANALYZE_PAGE)`는
  "Receiving end does not exist"로 실패하므로 분석 전 반드시 호출
- host_permissions `<all_urls>` (2026-08-14 사용자 확정): 패널/단축키 진입점은
  activeTab이 부여되지 않아 임의 사이트 주입에 필요

### 3.2 사이드 패널 열기 (진입점 5종)

```
popup/context/shortcut/float ──OPEN_SIDE_PANEL {source}──▶ BG
                                                          └─▶ chrome.sidePanel.open() + 로그
```

### 3.3 다운로드

```
UI ──DOWNLOAD_START {items,folder}──▶ BG
BG ──DOWNLOAD_PROGRESS (broadcast)──▶ UI (진행 뷰 갱신)
UI ──DOWNLOAD_STATE {jobId}──▶ BG ──JobState──▶ UI
```

## 4. 응답 형식

```js
// 성공
{ ok: true, data: <payload> }
// 실패 (에러코드 필수)
{ ok: false, error: { code: 'E-CHR-NET-1001', message: '...' } }
```

- 에러코드 → 사용자 메시지는 `error_message_ko.json` 매핑

## 5. 브로드캐스트 (다운로드 진행)

- `chrome.runtime.sendMessage`는 브로드캐스트가 아니므로
  UI 수신은 `onMessage` 리스너 + BG가 `chrome.storage.session`에 상태 기록
- UI 재열람 시 `DOWNLOAD_STATE`로 복원 (오프라인/재시작 대응)

## 6. 보안

- content 스크립트에서 받은 payload는 크기 제한 (≤1MB, 초과 시 E-CHR-NET-1001)
- 스크립트 주입 요청은 반드시 사용자 제스처 경유 (진입점 ⑤)
- `chrome.runtime.getURL` 외 절대 경로 삽입 금지
## 4. DEBUG_LOG (디버그 로그 위임 — DebugPanel)

```
content → BG: { type: 'DEBUG_LOG', entry: { ts, level, scope:'content', text } }
BG 응답: 없음 (비동기 저장, fire-and-forget)
```

- BG는 `sender.tab.id`/`sender.tab.url`을 entry에 태깅 후 `chrome.storage.local["debugLog"]`에 누적 (MAX 2000 FIFO, 300ms 디바운스)
- `chrome.storage.local["debugEnabled"]` 꺼짐이면 기록하지 않음
- BG 자신의 로그는 BGLogger → DebugLogger가 직접 저장 (위임 불필요)

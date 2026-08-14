# DESIGN.md — 기술 설계 (chrome 섹션)

**버전**: v0.1.0 (초안) / **플랫폼**: chrome

---

## 1. 전체 구조

```
[콘텐츠 스크립트]           [백그라운드 SW]            [UI]
  content-root.js     ↔    service-worker.js    ↔   popup / sidepanel / options
  ─ extractor.js            ─ logger.js (BGLogger)    ─ 분류 탭 뷰
  ─ unlock.js               ─ sidepanel-controller    ─ 다운로드 진행 뷰
  ─ highlight.js            ─ analyzer                ─ 옵션
  ─ float-button.js         ─ downloader
                            ─ stream-detector (dNR)
                            ─ storage
```

## 2. 메시지 프로토콜 (BG ↔ content ↔ UI)

모든 통신은 `shared/messages.js`의 타입 상수 경유, `chrome.runtime.sendMessage` 사용.

| Type | 방향 | payload | 응답 |
|------|------|---------|------|
| `ANALYZE_PAGE` | UI/BG → content | — | `AnalysisResult` |
| `ANALYZE_PAGE_RESULT` | content → BG/UI | `AnalysisResult` | — |
| `OPEN_SIDE_PANEL` | popup/context/float → BG | `{ source }` | `{ ok }` |
| `DOWNLOAD_START` | UI → BG | `{ items, folder }` | `{ jobId }` |
| `DOWNLOAD_PROGRESS` | BG → UI (broadcast) | `{ jobId, done, total, current }` | — |
| `DOWNLOAD_STATE` | UI → BG | `{ jobId }` | `JobState` |
| `HIGHLIGHT_TOGGLE` | UI → content | `{ on, mode }` | `{ ok }` |
| `SETTINGS_GET/SET` | UI → BG | key/value | value |

### AnalysisResult 스키마
```jsonc
{
  "url": "https://...",
  "title": "기사 제목",
  "analyzedAt": 1723600000000,
  "article": {
    "found": true,
    "articleNodeHash": "sha256-of-node-path", // 본문 판정 기준
    "bodyTextLen": 12345,
    "title": "기사 제목",
    "byline": "작성자",
    "excerpt": "요약"
  },
  "media": {
    "images": [ { "id": "i1", "url": "...", "type": "jpg", "w": 1920, "h": 1080, "size": 123456, "inArticle": true, "alt": "..." } ],
    "videos": [ { "id": "v1", "url": "...", "type": "mp4|m3u8|mpd", "inArticle": true, "label": "..." } ],
    "audios": [ { "id": "a1", "url": "...", "type": "mp3", "inArticle": false } ],
    "streams": [ { "id": "s1", "url": "...", "protocol": "hls|dash", "qualities": ["1080p","720p"] } ]
  },
  "links": [ { "id": "l1", "url": "...", "text": "앵커", "type": "pdf|zip|html|...", "inArticle": true } ],
  "stats": { "totalImages": 245, "totalVideos": 12, "totalLinks": 78 }
}
```

## 3. 본문 타겟팅 (F2)

- `@mozilla/readability`를 **clone 문서**에 적용 (`doc.cloneNode(true)` — 원본 DOM 비파괴)
- DOMPurify로 script/iframe/form/이벤트 속성 제거
- 본문 판정: readability의 `content` 노드가 포함한 자손 노드 집합을 수집,
  미디어 수집 시 이 집합에 속하는지 `inArticle` 판정
- 사이트별 preRemove 규칙: `chrome.storage.local`의 `siteRules` (도메인 → { selectors, preRemove })
- 하이라이트 오버레이: 본문 노드에 `outline` 스타일 부여, 드래그 영역 보정은
  `onMouseUp` 시점의 `elementFromPoint` 기반 노드 선택

## 4. 미디어 수집 (F3)

| 소스 | 처리 |
|------|------|
| `<img>` | `currentSrc`/`src`/`srcset`(가장 큰 후보)/`data-src`(lazy) 병합, 원본 추적 |
| `background-image` | `getComputedStyle` 스캔 (본문 노드 한정, 성능 보호) |
| `<video>` | `src`/`<source>`/`poster`(이미지로 분류) |
| HLS/DASH | dNR 규칙으로 `.m3u8`/`.mpd` URL 감지 (옵션 ON 시) |
| Live 스트림 | dNR 감지 + 세그먼트 URL 수집, 품질 목록 파싱 (EXT-X-STREAM-INF) |

- 이미지 원본 추적: URL 재작성(치수 접미사 제거)은 v0.1에서 제한 (whitelist 도메인만)

## 5. 다운로드 (F3)

- BG `downloader.js`가 `chrome.downloads.download()` 순차/병렬 실행 (동시 3건)
- `chrome.downloads.onChanged` → `JobState`를 `chrome.storage.session`에 저장 → UI broadcast
- ZIP: JSZip 사용, 다운로드 완료 파일을 재조합 → `chrome.downloads.download({ url: blobURL })`
  (v0.1: 개별 파일 다운로드 우선, ZIP은 v0.2 후보 — JSZip 의존성 추가 검토)
- 폴더: `~/Downloads/PageKit/{domain}/{category}/`
- 실패: 재시도 2회 후 `E-CHR-DL-1002` 알림 + UI에 실패 목록 표시

## 6. 사이드 패널 진입점 (T-09~T-14)

`openSidePanel(source)` 공통 헬퍼:
```js
async function openSidePanel(source) {
  // source: 'icon'|'context'|'shortcut'|'popup'|'float'
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.sidePanel.open({ windowId: tab.windowId });
  BGLogger.info(`[FEATURE] 사이드 패널 열림 source=${source}`);
}
```

| 진입점 | 등록 위치 | 비고 |
|--------|-----------|------|
| ① 아이콘 | `action.default_popup` → 팝업 [패널 열기] | 팝업 유지 |
| ② 컨텍스트 메뉴 | `chrome.contextMenus.create` | `onClicked` → openSidePanel('context') |
| ③ 단축키 | `commands` (기본 `Cmd+Shift+K`) | `onCommand` → openSidePanel('shortcut') |
| ④ 팝업 버튼 | 팝업 html | onClick → openSidePanel('popup') |
| ⑤ 플로팅 버튼 | `scripting.executeScript` 주입 (요청 시) | 버튼 클릭 → 메시지 → BG openSidePanel('float') |

## 7. 우클릭 해제 (F1)

- content `unlock.js`: `contextmenu`/`copy`/`selectstart` 캡처 단계에서 `stopPropagation` + `preventDefault` 제거
- CSS 주입: `* { user-select: text !important; }` 등
- 화이트리스트: `chrome.storage.local`의 `unlockSites` (도메인 배열), 옵션에서 관리
- 기본: **꺼짐**, 사용자가 켠 사이트만 활성 (심사 안전)

## 8. 상태 저장 (storage)

| 키 | 범위 | 내용 |
|----|------|------|
| `settings` | local | 기본 설정 (필터 기본값, 동시 다운로드 수) |
| `unlockSites` | local | 우클릭 해제 화이트리스트 |
| `siteRules` | local | 사이트별 preRemove 규칙 (사용자 커스텀) |
| `linkPresets` | local | 정규식 프리셋 |
| `lastAnalysis` | session | 마지막 분석 결과 (팝업 복원용) |
| `downloadJobs` | session | 진행 중 다운로드 JobState |
| `debugLog` | local | 디버그 로그 누적 (최대 2000건 FIFO) — DebugPanel 전용 |
| `debugEnabled` | local | 디버그 로그 기록 활성화 여부 (기본 꺼짐) |

## 8.1 DebugPanel (AGENTS.md 19장 표준)

- **debug.js**: 전역 `DebugLogger` (content/UI 공용, BG SW는 debug-module.js로 re-export)
  - 레벨: `DEBUG/INFO/WARN/ERROR` + `PERF/CACHE/FEATURE`
  - content 스크립트 → `DEBUG_LOG` 메시지로 BG 위임 → BG가 tabId/url 태깅 후 기록
  - BG는 300ms 디바운스 배치로 `chrome.storage.local["debugLog"]` 저장, MAX 2000 FIFO
- **debug-view.html/js/css**: 전용 디버그 창 (`chrome.windows.create`, 단일 인스턴스 `_debugWinId`)
  - 2초 폴링, 필터(레벨/탭/검색), 일시정지/전체 복사/지우기
  - 단축키 Ctrl/Cmd+Shift+D (`pagekit-toggle-debug` 커맨드), 컨텍스트 메뉴 [PageKit 디버그 창 열기]
- **BGLogger** (`background/logger.js`): DebugLogger 래핑 — 모든 배경 로그가 통합 기록
- 모든 기능(분석/하이라이트/언락/플로팅/다운로드/설정)은 진입·완료·실패 시 `[FEATURE]`/`[ERROR]` 로그 필수 (19.1장)

## 9. 성능/메모리 가드

- 콘텐츠 스크립트: 이미지 2000개, 링크 5000개 초과 시 샘플링 + WARN 로그
- `[PERF]` 로그: 분석 소요시간, 수집 아이템 수
- 사이드 패널 렌더: 500개 이상은 가상 스크롤 (v0.1: 기본 리스트 + "더 보기")

## 10. v0.2 후보

- ZIP 패키징 (JSZip), 스트림 세그먼트 브라우저 내 병합, Firefox/Safari 포팅, 외부 다운로드 관리자 연동
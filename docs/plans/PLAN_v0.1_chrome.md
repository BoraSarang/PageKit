# PLAN_v0.1_chrome — PageKit v0.1 구현 계획

**버전**: v0.1.0
**플랫폼**: chrome
**작성일**: 2026-08-14
**상태**: 진행 중

---

## 1. 개요

PageKit 크롬 익스텐션 v0.1 MVP. 5대 기능(우클릭 해제, 스마트 본문 타겟팅, 미디어 리스트업/다운로드, 특수 링크 조사, 사이드 패널 진입점 5종)을
문서 우선 원칙으로 구현한다.

## 2. 결정 사항

1. **사이드 패널 중심 UI** — 페이지를 보면서 목록을 조작해야 하므로 메인 작업 공간은 사이드 패널. 팝업은 분석 실행/요약 보조.
2. **팝업 유지 구조** — 아이콘 클릭 시 팝업 → [사이드 패널 열기] 버튼. `openPanelOnActionClick`은 팝업과 공존 불가하므로 미사용.
3. **본문 내부/외부 분류가 차별점** — readability 분석 결과(본문 노드 집합)와 미디어 수집 결과를 교집합 연산.
4. **네트워크 감시는 declarativeNetRequest** — MV3에서 webRequest 차단 불가. 단, v0.1은 DOM 기반 수집 우선, dNR은 스트림 감지에만 사용.
5. **스트림 다운로드는 URL 노출/명령 생성까지** — 실제 세그먼트 병합은 외부 도구(ffmpeg) 명령 생성으로 지원 (브라우저 내 병합은 v0.2).
6. **플로팅 버튼은 요청 시 주입** — `<all_urls>` 호스트 권한 대신 팝업/컨텍스트 메뉴 진입 시점에 scripting.executeScript.

## 3. 아키텍처

```
extension/
├── manifest.json              # MV3
├── icons/                     # 16/32/48/128 PNG
├── background/
│   ├── service-worker.js      # 진입점 등록, 메시지 라우팅
│   ├── logger.js              # BGLogger (DebugLogger 래핑)
│   ├── sidepanel-controller.js# openSidePanel(source) — 진입점 5종
│   ├── analyzer.js            # 분석 실행 (content로 메시지 → 결과 집계)
│   ├── downloader.js          # chrome.downloads 배치 + 상태 추적 + ZIP
│   ├── stream-detector.js     # dNR 기반 m3u8/mpd 감지 (v0.1: URL 수집)
│   └── storage.js             # chrome.storage 래퍼 (설정/히스토리)
├── content/
│   ├── content-root.js        # 진입 스크립트 (IIFE)
│   ├── unlock.js              # 우클릭/복사/선택 해제 (F1)
│   ├── extractor.js           # 본문 분석 + 미디어/링크 수집 (F2/F3/F4)
│   ├── highlight.js           # 본문 영역 하이라이트 + 드래그 보정
│   └── float-button.js        # 플로팅 버튼 (진입점 ⑤)
├── popup/
│   ├── popup.html / popup.js / popup.css
├── sidepanel/
│   ├── panel.html / panel.js / panel.css   # 분류 탭 + 진행 뷰
├── options/
│   ├── options.html / options.js / options.css
└── shared/
    └── messages.js            # 메시지 타입/상수 (BG↔content↔UI)
```

## 4. 구현 단계 (T-번호)

| T | 작업 | 상태 |
|---|------|------|
| T-01 | docs/PRD.md | ✅ |
| T-02 | docs/plans/PLAN_v0.1_chrome.md | ✅ |
| T-03 | docs/TODO.md + docs/DESIGN.md | ⏳ |
| T-04 | docs/chrome/PERMISSIONS.md + MESSAGING.md | ⏳ |
| T-05 | error_message_ko.json + AI_MODELS.json | ⏳ |
| T-06 | manifest.json (MV3) | ⬜ |
| T-07 | 폴더 구조 + 공통 로거 | ⬜ |
| T-08 | DebugLogger/BGLogger | ⬜ |
| T-09~T-14 | 사이드 패널 진입점 5종 | ⬜ |
| T-15~T-17 | 스마트 본문 타겟팅 | ⬜ |
| T-18~T-24 | 미디어 리스트업 & 다운로드 | ⬜ |
| T-25~T-27 | 특수 링크 조사 | ⬜ |
| T-28~T-29 | 우클릭 제한 풀기 | ⬜ |
| T-30~T-33 | UI 완성 | ⬜ |
| T-34 | build_and_run.sh debug chrome + env-expiry-check + gitleaks | ⬜ | 18장 디스패처 |
| T-35 | 진입점 5종 실측 + a11y-dump 3종 세트 | ⬜ | 7.6.1장 |
| T-36 | docs/e2e/PLAN.md E2E 시나리오 | ⬜ | 7.7장 |
| T-37 | 심사 체크리스트 + webstore-publish --dry-run | ⬜ | 21.1장 |
| T-38 | CHANGELOG + 세션 로그 + bd | ⬜ | 20.4장 |
| T-39~T-41 | DebugPanel (DebugLogger + debug-view 창 + 전 기능 로그) | ✅ | 19장, 19.1장 |

## 5. 테스트 계획 (TC)

| TC | 시나리오 | 수준 |
|----|----------|------|
| TC-01 | 진입점 5종 각각 사이드 패널 열림 확인 | 진입점 |
| TC-02 | readability 본문 추출 정확도 (뉴스/블로그/쇼핑몰 3종) | 본문 |
| TC-03 | 본문 내/외부 분류: 광고 배너는 외부, 기사 이미지는 내부 | 본문 |
| TC-04 | 이미지 필터 (800px↓ 제외, webp 포함) | 미디어 |
| TC-05 | HLS(m3u8) URL 감지 | 미디어 |
| TC-06 | 배치 다운로드 + 실패 재시도 + 배지 | 다운로드 |
| TC-07 | 정규식 필터 .pdf/.zip + CSV 내보내기 | 링크 |
| TC-08 | 우클릭 제한 사이트에서 해제 확인 + 화이트리스트 | 우클릭 |
| TC-09 | 다운로드 히스토리 복원 (팝업 재열람) | 다운로드 |

## 6. 롤백 계획

- git revert + `rm -rf extension/dist` + 확장 재로드 (chrome://extensions → Reload)
- chrome.storage: `chrome.storage.local.clear()` (개발용)
- dNR 규칙은 세션 종료 시 자동 제거되도록 설계

## 7. 성능 예산

| 항목 | 예산 |
|------|------|
| SW wake | ≤500ms |
| 팝업 표시 | ≤300ms |
| 사이드 패널 렌더 (500개 아이템) | ≤500ms |
| 본문 분석 | ≤200ms (clone + readability) |
| 콘텐츠 스크립트 메모리 | ≤30MB |

## 8. 에러 코드

| 코드 | 메시지 |
|------|--------|
| E-CHR-NET-1001 | 페이지 분석에 실패했습니다. 다시 시도해 주세요. |
| E-CHR-GLIST-1001 | 본문 영역을 찾지 못했습니다. 페이지가 아직 로드 중일 수 있습니다. |
| E-CHR-DL-1001 | 다운로드를 시작하지 못했습니다. |
| E-CHR-DL-1002 | 일부 파일 다운로드에 실패했습니다. 다시 시도해 주세요. |
| E-CHR-STREAM-1001 | 스트림 URL을 감지하지 못했습니다. |
| E-CHR-UI-1001 | 사이드 패널을 열 수 없습니다. 다시 시도해 주세요. |
| E-CHR-PERM-1001 | 필요한 권한이 없습니다. 확장 설정에서 확인해 주세요. |

## 9. 권한 목록

`sidePanel`, `storage`, `downloads`, `contextMenus`, `commands`, `scripting`, `activeTab`, `declarativeNetRequest`
→ docs/chrome/PERMISSIONS.md 참조
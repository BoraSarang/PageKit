# TODO — 작업 추적

> 진행 규칙: 진행중(⏳) → 완료(✅) → 검증(🔍). 세션 단절 시 이 파일과 session 로그로 복구.

## v0.1 (chrome) — PageKit MVP

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-01 | docs/PRD.md 작성 | ✅ | 2026-08-14 |
| T-02 | docs/plans/PLAN_v0.1_chrome.md 작성 | ✅ | 2026-08-14 |
| T-03 | docs/TODO.md + docs/DESIGN.md | ⏳ | 진행중 |
| T-04 | docs/chrome/PERMISSIONS.md + MESSAGING.md | ✅ | |
| T-05 | error_message_ko.json + AI_MODELS.json | ✅ | |
| T-06 | manifest.json (MV3) + 아이콘 | ✅ | 아이콘 생성 후 manifest 반영 |
| T-07 | 폴더 구조 + 공통 로거 | ✅ | |
| T-08 | DebugLogger/BGLogger | ✅ | |
| T-09 | openSidePanel(source) 헬퍼 | ✅ | |
| T-10 | ① 아이콘 → 팝업 → 패널 열기 | ✅ | |
| T-11 | ② 컨텍스트 메뉴 | ✅ | |
| T-12 | ③ 키보드 단축키 | ✅ | Cmd+Shift+K |
| T-13 | ④ 팝업 [전체 보기 →] | ✅ | T-10과 통합 |
| T-14 | ⑤ 플로팅 버튼 (요청 시 주입) | ✅ | |
| T-15 | readability 본문 추출 | ✅ | @mozilla/readability |
| T-16 | 사이트별 preRemove 규칙 | ✅ | |
| T-17 | 본문 하이라이트 + 드래그 보정 | ✅ | |
| T-18 | 이미지 수집 | ✅ | srcset/lazy/background |
| T-19 | 비디오 수집 + HLS 감지 | ✅ | |
| T-20 | 실시간 스트림 감지 + 품질 목록 | ✅ | dNR |
| T-21 | 본문 내/외부 분류 필터 | ✅ | 차별점 |
| T-22 | 이미지 필터 | ✅ | |
| T-23 | 배치 다운로드 + ZIP + 폴더 정리 | ✅ | |
| T-24 | 다운로드 상태 추적 + 배지 | ✅ | |
| T-25 | 링크 추출 + 중복 제거 | ✅ | |
| T-26 | 정규식 필터 + 프리셋 | ✅ | |
| T-27 | 검색 + 내보내기 | ✅ | |
| T-28 | 우클릭 해제 | ✅ | |
| T-29 | 화이트리스트 | ✅ | |
| T-30 | 사이드 패널 메인 뷰 | ✅ | |
| T-31 | 그리드/리스트 뷰 | ✅ | |
| T-32 | 진행 뷰 + 미니 요약 + 배지 | ✅ | |
| T-33 | 옵션 페이지 | ✅ | |
| T-34 | build_and_run.sh debug chrome | ✅ | Whale 기반(정식 Chrome 플래그 무시) |
| T-35 | 진입점 5종 테스트 + a11y-dump | 🔍 | 팝업/단축키/플로팅 검증, 컨텍스트메뉴·패널 진입점은 T-36에 잔여 |
| T-36 | E2E 시나리오 | 🔍 | Whale CDP 수동 검증 완료, Playwright 자동화는 잔여 |
| T-37 | 심사 체크리스트 + webstore --dry-run | ✅ | unsafe-eval 없음, WAR 0, host_permissions 배포용 OK |
| T-38 | CHANGELOG + 세션 로그 + bd | 🔍 | CHANGELOG 작성됨, 세션 로그·bd는 이번 작업 종료 시 |
| T-39 | DebugPanel: debug.js DebugLogger (storage 누적, content 위임) | ✅ | Shop WiseBar 참고 |
| T-40 | DebugPanel: debug-view 창 (필터/복사/지우기/2초 폴링) + toggle-debug 단축키 | ✅ | Cmd+Shift+D |
| T-41 | 모든 기능 디버그 메시지 통합 (extractor/unlock/highlight/float/popup/panel/options) | ✅ | 19.1장 FEATURE 로그 |

## v0.4 (chrome) — 우클릭/복사 제한 해제 전역 체크박스

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-42 | 우클릭/복사 제한 해제를 전역 체크박스(`settings.unlockEnabled`)로 전환 (화이트리스트 제거) | ✅ | bd WPageTools-ik7 (close는 사용자 확인 후) |
| T-42-1 | storage.js — getSettings() 마이그레이션 + unlockSites 함수 제거 | ✅ | |
| T-42-2 | unlock.js — settings.unlockEnabled 기반 활성/비활성 | ✅ | |
| T-42-3 | options.html — 화이트리스트 카드 → 체크박스 카드 | ✅ | |
| T-42-4 | options.js — 체크박스 토글(즉시 저장) + 화이트리스트 코드 제거 | ✅ | |
| T-42-5 | messages.js — UNLOCK_TOGGLE 제거 (미사용 확인) | ✅ | |
| T-42-6 | docs — DESIGN.md(7장) / CHANGELOG.md / e2e PLAN 갱신 | ✅ | |
| T-42-7 | 검증 — node --check + Whale 실측 (토글 즉시 반영) | ✅ | CDP 실측 4종 통과 |
| T-43 | unlock.js 페이지 로드 시 자동 주입 (tabs.onUpdated — unlockEnabled ON일 때만) | ✅ | 근본 원인: 요청 시 주입 구조라 페이지에 unlock.js 부재 → 자동 주입으로 해결, CDP 실측 통과 |
| T-44 | 다운로더 폴더명 정리 (downloader2 → downloader) — 웨일 경로 캐시 우회 불필요 (Chrome 테스트 전환) | ✅ | service-worker.js + downloader.html 참조 갱신, Chrome CDP 실측 통과 |

## v0.5 (chrome) — HTTP 미디어 + UMP 연구 + DASH 병합 + ZIP/CSV

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-50 | PLAN_v0.5_chrome.md 작성 + TODO/DESIGN 갱신 | ✅ | 본 행 |
| T-51 | P1-1 HTTP 미디어(mp4) 제공 사이트 탐색 + 실저장 검증 | ⬜ | bd WPageTools-38p |
| T-52 | P1-2 UMP/SABR 프로토콜 연구 (문서화) | ✅ | extractor mergeYoutubePlayerFormats(innertube ANDROID_SDKLESS) — 웨일 실측 통과 |
| T-53 | P2-1 DASH(mpd) 파싱/병합 — m3u8.js 확장 + downloader 분기 | ✅ | SegmentTemplate+SegmentList+SegmentBase 지원, ISO8601 Y/M 파싱 수정 — Bitmovin 웨일 실측 통과 (segs=53) |
| T-54 | P2-2 ZIP 패키징 (BG blob 재조합) | ✅ | SW createObjectURL 버그 수정 → data URL 저장 — Chrome CDP + 웨일 실측 통과 |
| T-55 | P2-2 링크 CSV 내보내기 (패널 검색 결과) | ✅ | 링크 탭 [CSV] 버튼, BOM 포함 — Chrome CDP 실측 통과 |
| T-56 | 통합 검증 (Chrome CDP) | ✅ | ZIP/DASH/CSV CDP 실측 + 웨일 사용자 확인 |

## 진행 이력

- 2026-08-14: 세션 시작. 신규 프로젝트 초기화. T-01, T-02 완료.
- 2026-08-14: 확장 스캐폴드 + 배경/콘텐츠/UI 전 모듈 구현 완료 (T-03~T-33). JS 17개 node --check 통과.
- 2026-08-14: DebugPanel 도입 — debug.js(DebugLogger: storage.local debugLog 최대 2000건, content→BG 위임, 300ms 디바운스), debug-view.html/css/js(레벨/탭/검색 필터, 일시정지/복사/지우기, 2초 폴링), toggle-debug 커맨드(Ctrl/Cmd+Shift+D), BGLogger를 DebugLogger 래핑으로 개편, 전 기능 디버그 메시지 추가.
- 2026-08-14: 빌드/검증 스크립트 4종(build_and_run.sh, env-expiry-check.sh, a11y-dump.sh, webstore-publish.sh) + .env.example + docs/e2e/PLAN.md 작성 (T-34).
- 2026-08-14: Whale CDP E2E — 정식 Chrome 137+가 --load-extension 무시하여 Whale 전환. 분석 분류(이미지/비디오/오디오/링크/inArticle) 검증 완료.
- 2026-08-14: 다운로드 E2E에서 버그 4건 발견/수정: ENSURE_INJECTED 누락, filename 무시, 이중 확장자, pk.dl.state 누락. Whale "다운로드 전 저장 위치 확인" 프롬프트 해제로 전체 흐름 통과.
- 2026-08-14: debugEnabled 캐시 미갱신 버그 수정(storage.onChanged 구독). 디버그 창 폴링/필터/지우기 검증. a11y-dump + webstore --dry-run 통과. CHANGELOG.md 작성.
- 2026-08-14: 사용자 실사용 테스트 리포트로 버그 6건 수정 — ① ENSURE_INJECTED sender.tab 없음(tabId 명시 전달), ② 디버그 로그 기본 꺼짐(기본 켬 + 토글 + 상태 배너), ③ 사이드바 분석 실패(ensureInjected 누락), ④ YouTube blob 비디오 0(og:video 폴백), ⑤ 패널 URL CSS.escape 백슬래시(esc 교체), ⑥ host_permissions <all_urls> 추가(사용자 확정).
- 2026-08-14: **Whale SW ScriptCache 문제 발견** — 확장 SW 스크립트가 프로필 Service Worker/ScriptCache에 캐시되어 수정 코드가 반영 안 됨. 캐시 삭제 후 정상 확인.
- 2026-08-15: **T-42 (v0.4)** — 우클릭/복사 제한 해제를 전역 체크박스로 전환. 화이트리스트(unlockSites) 제거 → `settings.unlockEnabled` 1개 체크박스, onChanged 즉시 반영, 레거시 데이터 1회 승계 마이그레이션. Whale CDP 실측 4종 통과 (체크박스 렌더/ON 활성/OFF 원복/마이그레이션).
- 2026-08-15: **T-52/T-53/T-54/T-55 (v0.5)** — ① T-52 유튜브 innertube player API(ANDROID_SDKLESS) 직접 호출로 m3u8 포맷 확보 — 웨일 실측 통과. ② T-53 DASH(mpd) 병합 — parseMPD에 SegmentBase(on-demand) 추가 + ISO8601 Y/M 파싱 버그 수정, Bitmovin art-of-motion 웨일 실측 통과. ③ T-54 ZIP 패키징 — SW URL.createObjectURL 불가 버그를 base64 data URL 저장으로 수정 (viaPage 경로 포함), Chrome CDP + 웨일 실측 통과. ④ T-55 링크 CSV 내보내기 — 링크 탭 [CSV] 버튼 (필터 적용 결과, BOM), Chrome CDP 실측 통과.
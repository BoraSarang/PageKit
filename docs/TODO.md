# TODO — 작업 추적

> 진행 규칙: 진행중(⏳) → 완료(✅) → 검증(🔍). 세션 단절 시 이 파일과 session 로그로 복구.

## v0.1 (chrome) — PageKit MVP

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-01 | docs/PRD.md 작성 | ✅ | 2026-08-14 |
| T-02 | docs/plans/PLAN_v0.1_chrome.md 작성 | ✅ | 2026-08-14 |
| T-03 | docs/TODO.md + docs/DESIGN.md | ✅ | v0.1~v0.5 갱신 완료 (2026-08-15) |
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
| T-38 | CHANGELOG + 세션 로그 + bd | ✅ | CHANGELOG v0.5.0 + 세션 로그 + bd close 전부 완료 (2026-08-15) |
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
| T-51 | P1-1 HTTP 미디어(mp4) 제공 사이트 탐색 + 실저장 검증 | ✅ | w3schools mp4 실저장(mov_bbb.mp4 788KB, ffprobe 정상) + DASH 병합 mp4 저장으로 갱신 — bd WPageTools-38p CLOSED |
| T-52 | P1-2 UMP/SABR 프로토콜 연구 (문서화) | ✅ | extractor mergeYoutubePlayerFormats(innertube ANDROID_SDKLESS) — 웨일 실측 통과 |
| T-53 | P2-1 DASH(mpd) 파싱/병합 — m3u8.js 확장 + downloader 분기 | ✅ | SegmentTemplate+SegmentList+SegmentBase 지원, ISO8601 Y/M 파싱 수정 — Bitmovin 웨일 실측 통과 (segs=53) |
| T-54 | P2-2 ZIP 패키징 (BG blob 재조합) | ✅ | SW createObjectURL 버그 수정 → data URL 저장 — Chrome CDP + 웨일 실측 통과 |
| T-55 | P2-2 링크 CSV 내보내기 (패널 검색 결과) | ✅ | 링크 탭 [CSV] 버튼, BOM 포함 — Chrome CDP 실측 통과 |
| T-56 | 통합 검증 (Chrome CDP) | ✅ | ZIP/DASH/CSV CDP 실측 + 웨일 사용자 확인 |

## v0.6 (landing) — PageKit 홍보 랜딩 페이지

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-60 | PLAN_v0.6_landing.md 작성 + TODO 등록 | ✅ | 본 행 |
| T-61 | landing/index.html 구현 (Flat Design, 이미지 없음) | ✅ | Tailwind CDN + Plus Jakarta Sans, CSS 브라우저 모형, 푸터 제작자/문의 |
| T-62 | Chrome CDP 검증 (렌더/다크모드/반응형) + Lighthouse | ✅ | TC-01~04 통과 — Lighthouse a11y/Best Practices/SEO/Agentic 100점 (대비 7건 수정 후) |
| T-63 | 커밋 + push | ⏳ | feat(landing): ... |

## v0.7 (chrome) — 스트림 병렬 다운로드 (독립 창)

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-70 | PLAN_v0.7_chrome.md 작성 + TODO 등록 | ✅ | 본 행 |
| T-71 | service-worker.js — 스트림 대기열 제거 + 항상 새 창 병렬 | ✅ | streamQueue/streamBusy/streamWinId 제거, 잔여 참조 0건 |
| T-72 | node --check + Chrome CDP 병렬 실측 (스트림 2건 → 창 2개) | ✅ | 독립 창 2개 동시 진행 (tears-of-steel 2/184 · bbunny 1/64) |
| T-73 | CHANGELOG + TODO 진행 이력 + 세션 로그 | ✅ | manifest 0.5.0 → 0.7.0 |

## v0.7.1 (chrome) — ENDLIST VOD 세그먼트 수 가드 오판 수정

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-80 | downloader.js 세그먼트 가드에 ENDLIST 조건 추가 + 실측 검증 | ✅ | 242개 VOD 정상 다운로드 (5/242) — PLAN_v0.7.1 |
| T-81 | extension-yt (옛 복사본, git 미추적) 삭제 | ✅ | 2026-08-19 사용자 지시 |

## v0.7.2 (chrome) — 패널 스트림 탭을 영상 옆 버튼으로

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-82 | 🖼🎬📡 버튼 3개 + 드롭다운[전체/오디오/링크] | ✅ | 사용자 결정 — PLAN_v0.7.2 |

## v0.7.3 (chrome) — 아이콘 숨김 이름 패턴 + options 버전 하드코딩 수정

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-83 | isIcon에 파일명/URL 아이콘 패턴 추가 | ✅ | jiantou2.png 등 크기 미확인 장식 이미지 숨김 |
| T-84 | options.html footer 버전 하드코딩(v0.1.0) → getManifest 동적 | ✅ | 실측 v0.7.3 표시 |

## v0.7.4 (chrome) — 설치 온보딩 페이지

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-85 | 온보딩 페이지 3카드(툴바 고정/우클릭 해제/다운로드) + 설치 시 자동 오픈 | ✅ | PLAN_v0.7.4 |

## v0.7.5 (chrome) — 컨텍스트 메뉴 수리 + 분석 오버레이 + URL 표시 + 플로팅 제거

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-86 | 컨텍스트 메뉴 "PageKit으로 분석" 탭 오류 수정 (onClicked 제스처 소멸 → 첫 웹 탭 분석/새 탭 폴백) | ✅ | 동기 sidePanel.open + storage.session contextTarget 경로 — PLAN_v0.7.5 |
| T-87 | 분석 중 로딩 오버레이 (panel) | ✅ | ⟳ 실측: 표시 → 완료 후 숨김 |
| T-88 | URL 표시 양끝으로 (shortenUrl "앞부분…파일명끝") | ✅ | 4케이스 단위 검증 |
| T-89 | 플로팅 버튼 제거 (content script 경유 sidePanel.open 제스처 불가 — 사용자 결정) | ✅ | extractor/float-button.js/css/popup 토글/service-worker 전부 제거 + 실측 |

## v0.7.6 (chrome) — 팝업 빈 공간 제거 + 아이콘 숨김 기본 체크/위치 + 빈 결과 안내

| T | 작업 | 상태 | 비고 |
|---|------|------|------|
| T-90 | 팝업 "전체 보기" 아래 빈 섹션 제거 (플로팅 토글 제거 잔재) | ✅ | popup.html 빈 `<section>` 제거 |
| T-91 | 아이콘 숨김 기본 체크 + 본문만 옆으로 이동 (본문만 · 아이콘 숨김 · 드롭메뉴 순서) | ✅ | panel.html — 기본 checked + 위치 변경 |
| T-92 | 검색/필터 결과 0건 시 "검색된 데이터가 없습니다" 안내 | ✅ | CDP 실측: 검색 0건 메시지 ↔ 목록 90건 복귀 |

## 진행 이력

- 2026-08-19: **v0.7 시작** — 스트림 다운로드 중 두 번째 요청이 대기열에 쌓여 창이 안 열리는 문제 확인 (SW 생존 시 streamBusy=true → 대기열 추가, SW 재시작 후에는 새 창 병렬로 동작이 달라짐). 사용자 확정: 항상 독립 새 창 병렬. PLAN/TODO 등록.
- 2026-08-19: **T-71/T-72 완료** — service-worker.js 대기열 로직 전체 제거(streamQueue/streamBusy/streamWinId), 항상 새 창 생성. Chrome CDP 실측: 스트림 2건 연속 요청 → 독립 팝업 창 2개 동시 다운로드 확인 (tears-of-steel 2/184 · Big Buck Bunny 1/64 세그먼트), 취소 후 정리. manifest 0.7.0.
- 2026-08-19: **T-80 (v0.7.1)** — 실사용 로그로 E-CHR-DL-1003 오판 발견 (ENDLIST 있는 242개 VOD가 LIVE로 차단). `downloader.js:285`에 `!m.endlist &&` 조건 추가. 매니페스트 직접 확인 + 단위 검증 + Chrome CDP 실측 (5/242 진행 확인 후 취소). manifest 0.7.1.
- 2026-08-19: **T-81** — extension-yt (manifest 0.1.0 옛 복사본, git 미추적, 미사용) 삭제 + 커밋/push 완료.
- 2026-08-19: **T-82 (v0.7.2)** — "스트림도 영상 옆에" 요청 → 사용자 결정(버튼 3개 + 드롭다운). 패널 상단에 📡 스트림 버튼 추가 (🖼🎬📡 + 드롭다운[전체/오디오/링크]). Chrome CDP 실측: 버튼 3개 렌더 + 클릭 active 전환 + 셀렉트 초기화 확인. manifest 0.7.2.
- 2026-08-19: **T-83/T-84 (v0.7.3)** — 사용자 리포트: ① torrentsee 장식 이미지(1.jpg~5.jpg, jiantou2.png)가 아이콘 숨김에 안 걸림 — isIcon에 파일명/URL 패턴 판정 추가(구분자 `/` 포함 8케이스 단위 테스트). ② options.html footer에 `v0.1.0` 하드코딩 발견 → `pk-version-foot` 동적 표시로 교체. 확장 리로드 후 CDP 실측: 헤더/푸터 모두 v0.7.3. manifest 0.7.3.
- 2026-08-19: **T-85 (v0.7.4)** — 설치 온보딩 페이지 신규 (툴바 고정 유도/우클릭 해제/다운로드 방법 3카드, 10스텝). onInstalled reason='install' 시 자동 오픈. CDP 실측: 렌더링 + 닫기 동작 + 버전 v0.7.4. manifest 0.7.4.
- 2026-08-19: **T-86~T-89 (v0.7.5)** — 사용자 리포트 4건: ① 분석 중 로딩 오버레이 추가(panel, ⟳ 실측: 표시→완료 숨김) ② URL 표시 양끝(shortenUrl "앞부분…파일명끝", 4케이스 단위 검증) ③ 컨텍스트 메뉴가 첫 웹 탭 분석+새 탭 폴백하는 문제 — onClicked에서 await ensureInjected로 제스처 소멸이 원인, 동기 openSidePanel + storage.session contextTarget(1회용) + storage.onChanged 재분석으로 수리, 활성 탭 google에서 torrentsee 분석 성공 실측 ④ 플로팅 버튼 — content script 경유 MV3 제스처 불가라 사이드 패널로 못 열림(fallback 탭만 동작), 사용자 결정에 따라 전체 제거(extractor/float-button.js/css/popup 토글/서비스워커/메시지 상수). manifest 0.7.5.
- 2026-08-19: **T-90~T-92 (v0.7.6)** — ① 사용자 문의: 팝업 "전체 보기" 아래 빈 공간 = 플로팅 토글 제거 잔재 빈 section 제거 ② 아이콘 숨김 기본 체크 + 본문만 옆(본문만·아이콘 숨김·드롭메뉴 순서) ③ 리스트 0건 시 "검색된 데이터가 없습니다" 안내(검색어·필터 해제 안내 포함) — CDP 실측: 검색 0건 메시지 ↔ 해제 후 90건 복귀. manifest 0.7.6.

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
- 2026-08-15: **T-51 완료 확정 + v0.5 마무리** — w3schools mp4 실저장 + DASH 병합으로 HTTP 미디어 저장 검증 확정(bd 38p CLOSED), bd 8gk/jz6/hq0 CLOSED, origin push 완료. 웨일 진입점 검증: 플로팅/컨텍스트 메뉴는 sidePanel gesture 제약으로 새 탭 폴백 동작(정상), 후속 WPageTools-ee8(P3) 등록.
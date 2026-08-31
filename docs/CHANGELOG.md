# CHANGELOG — PageKit (Chrome Extension v0.1.0)

## v1.0.3 (2026-08-23) — 스트림 작업 창 세로 자동 리사이즈

### 주요 변경 [chrome]
- 다운로드 작업 창(popup) 세로를 **콘텐츠 높이에 맞춰 자동 조정** (상한 900px, 최소 420px)
  - MutationObserver로 화질 선택·예상 용량 계산·진행/완료 전환의 비동기 변화를 감지해 자동 재조정
- 기본 창 크기 520×400 → 560×480 (실측 보정 전 초기 여유)

## v1.0.2 (2026-08-23) — 스트림 다운로드 개선 + 유튜브 진단 카드

### 주요 변경 [chrome]
- **스트림 안정화(settle)** — 분석 시 m3u8/mpd 매니페스트가 뒤늦게 로드돼도 최대 3초 재수집(스트림 소스 있을 때만) → "화질 N개 통합"을 한 번의 분석으로
- **다운로드 명시적 시작** — 작업 창이 자동 시작하지 않고 해상도/예상 용량 검토 후 [다운로드 시작] 클릭으로 진행
- **해상도·예상 용량 표시** — 마스터 화질 셀렉트(1개여도) + "단일 해상도" + "약 N MB"(재생길이×대역폭)
- **스트림 용량 상한 옵션화** — `streamMaxMB`(제한 없음/100/200/300MB, 기본 무제한) — 기존 300MB 하드코딩 제거
- **유튜브 진단 카드** — 유튜브 스트림을 다운로드 불가로 전환, 흩어진 itag를 단일 카드의 형식 셀렉트로 묶고 페이지 URL 복사만 제공 (다운로드 지원 종료)

### 수정 [chrome]
- DASH 예상 용량 계산용 bandwidth 필드 추가(shared/m3u8.js parseMPD)
- parseM3U8에 #EXTINF 재생길이 누적(totalDuration) 추가

## v1.0.0 (2026-08-23) — 첫 안정판: 전면 리팩토링 + 품질 진단 완성

### 주요 변경 [chrome]
- **prettier 도입** — 전체 JS 포맷 통일(구 ` ;` 관행 소멸), format/format:check 스크립트
- **HTML 리포트 생성기 단일화** — shared/quality-rules.js 위임(3벤더 중복 제거)
- **pkDom 공용 유틸** — escapeHtml/$ 3중복 제거(classic+ESM 듀얼 로드)
- **SW 구조 정리** — 품질 핸들러 분리(background/quality-handler.js), 응답 보장 catch 필수화
- **옵션 설정 100% 실반영** — enabled 게이트, CWV/a11y/SEO 임계값, autoRun 실시간 반영
- **동작 추적 로그 보강** — 클릭·실행·완료(소요ms·이슈수)·내보내기 전 과정
- **E2E 자동화** — Whale 격리 프로필 스모크 12개(SW 라우팅 왕복 포함) + 파이프라인 진단기(diag-media)

### 수정 [chrome]
- 중복 주입 크래시 2종: debug.js 재선언, dom-utils 전역 `$` 오염 → 모든 페이지 콘솔 오류 차단
- 회귀 3종 수습: SW 핸들러 import 누락(전 메시지 사망), panel pkDom 누락(패널 사망), 최소점수 TDZ
- 디버그 창 경로 복구, 이슈 리스트 긴 URL 넘침, 다크모드 이슈 배경, 패널 무한대기 타임아웃 가드

## v0.7.13 → v0.7.29 (2026-08-22~23) — 페이지 품질 진단 안정화 시리즈

### 배경 [chrome]
- 신규 기능 "페이지 품질 진단"(SEO/성능/접근성/콘텐츠 종합 진단) 도입 과정에서
  구문오류 → 로드 실패 → 데이터 바인딩·타이밍·설정 미적용까지 연쇄 발생.
  본 시리즈에서 근본 원인을 전부 해소하고 단독 사이드패널 아키텍처로 확정.

### 버전별 요약 [chrome]
| 버전 | 커밋 | 핵심 |
|------|------|------|
| 0.7.13 | - | CSP `worker-src` 정리 + content_scripts module 타입 제거 |
| 0.7.14 | f4a9c34 | SW 템플릿 리터럴 닫힘 정리(버전 bump로 캐시 무효화) |
| 0.7.15 | 15d28f4 | 삼항연산자 거짓분기 누락 등 구문오류 5종 수정 + 엔티티 디코딩 손상 복구 + 중복선언 제거 |
| 0.7.16 | e87bc15 | `scoreClass` 누락 함수 추가 + **axe-core 4.8.4 로컬 내장**(CSP 차단 해소, 분석 탭에만 격리월드 주입) |
| 0.7.17 | ad548f8 | **품질진단 단독 사이드패널**(`setOptions` 경로 스위칭) + 팝업 3버튼/컨텍스트 메뉴 2원화 + 팝업 자동분석 제거 |
| 0.7.18 | 4fcbce0 | 품질패널 반응형 재설계(패널 폭 연동) + 중복 버튼 ID 정리 |
| 0.7.19 | 8b321c0 | 분석패널 품질탭 완전 제거(단독으로 이관) + 팝업 간소화·버전 표시 + 옵션 fieldset 스타일 복구 |
| 0.7.20 | 8b5e0fc/c9e6c47 | 리포트 `(undefined/100)` 수정(모듈 score/label 주입), 폭포수 한 줄화, 다크모드 이슈배경, 리포트 버전 푸터 |
| 0.7.21 | 368e572 | 이슈 리스트 긴 URL 가로 넘침 수정(`overflow-wrap:anywhere`) |
| 0.7.22 | 1ade8af | 내부·타확장 페이지 분석 시 크롬 원문 영어 오류 → 한국어 안내 + 자동재분석 무음화 |
| 0.7.23 | 4e7a871 | 프록시 이미지 포맷 오탐 제거 + quality-runner 데드코드 삭제 + autoRun 단독연동(기본 켬) |
| 0.7.24 | dc8e64d | 분석대상 표시줄(제목·URL·상태) + 옵션 라벨 명확화 |
| 0.7.25 | 1baab15 | autoRun 옵션 해제가 열린 패널에 즉시 반영(탭추적 동적 바인딩/해제) |
| 0.7.26 | c7fc235 | 서브점수/CWV 키 불일치 수정(`seo/performance/accessibility/content`) + 이슈 단일원천화(rebuildFlatIssues) + 컨텍스트메뉴 제스처 보존(setOptions 비await) |
| 0.7.27 | d2e4bfc | 실행 편차 축소 — 안정화 대기 게이트(waitForSettle) + CWV 스냅샷 복사 + 소요시간 표기 |
| 0.7.28 | 7fa7f77 | **미적용 설정 활성화** — enabled 토글 게이트 + 옵션 임계값(LCP/INP/CLS/a11y/SEO 최소점수) 실반영 |
| 0.7.29 | 433786c | **응답 누락 방어** — 콘텐츠 리스너 catch 보장('message channel closed' 원천 차단) + 대기/기준검사 비치명화 |

### 아키텍처 결정 [chrome]
- 품질진단 UI는 `quality-tab.html?auto=1`을 **단독 패널**로 사용하며,
  `sidepanel-controller.js PANEL_VIEW_PATHS`가 미디어↔품질 경로를 스위칭한다.
- `sidePanel.open()` 앞에 await를 두지 않는다(사용자 제스처 소멸 → 새탭 폴백 회귀 방지).
- `result.issues`는 모듈 순회로 재구성하는 단일 원천 — 패널 리스트와 리포트 '전체 이슈 목록'이 항상 동일.
- 점수 카테고리 키 정규화: `seo/performance/accessibility/content`(구 a11y/bestPractices 금지).
- 검증 도구: `node --check`는 import/export 파일을 가짜 통과시키므로 vm 기반 엄격 파서 필수.

## v0.7.12 (2026-08-19) — 일반 동영상도 독립 작업 창에서 다운로드

### 수정 [chrome]
- **T-100**: 패널 다운로드 핸들러에서 일반 동영상/오디오(`cat` videos/audios) 항목을
  `MSG.DOWNLOAD_STREAM`(독립 작업 창)으로 전송 — 스트림(m3u8/mpd/유튜브)과 동일하게
  진행 표시 + 브라우저 다운로더 폴백(0.7.10)을 받도록 변경. 이미지/링크/기타는 기존대로
  background 배치(창 없음) 유지, ZIP 모드면 기존대로 전부 ZIP으로 패키징(동영상 포함).

### 배경
- 기존엔 일반 mp4(틱톡 등)가 background 배치 경로(background/downloader.js)로 처리됐는데
  이 경로에는 브라우저 다운로더 폴백이 없어 403 시 페이지 폴백으로 느리게 완료됨.
  작업 창 경로는 v0.7.10에서 서명 CDN 403을 브라우저 다운로더로 해결한 상태라 더 빠르고 확실.

### 실측 [chrome]
- CDP 실측: `pk.stream.open` 호출 → 작업 창 열림 → 진행 표시(0.7MB·36%) →
  `tiktok-test/videos/TikTok.mp4` (2MB, ISO Media Base Media v1) 저장 성공.

### 검증
- `node --check` panel 통과. manifest 0.7.12.

## v0.7.11 (2026-08-19) — 틱톡 미디어 캐치 수정 (blob 재생 성능 entries 폴백)

### 수정 [chrome]
- **T-99**: extractor.js의 blob 재생 성능 entries 폴백을 확장자 매칭(`.mp4|.m3u8|.mpd`)에서
  **확장자 없는 서명 CDN(틱톡 v16-webapp-prime/v16-webapp/v19-webapp-prime 등)도 잡도록** 개선.
  3가지 원인 수정:
  1. 확장자 매칭만 → 미디어 호스트(`v\d+-webapp-?prime|v\d+-webapp|tiktokcdn|googlevideo|cdn-video`) + initiatorType(xhr/fetch/video/audio) + 비미디어 확장자 제외로 선별.
  2. `transferSize > 0` 조건 제거 — SW/캐시 경유 미디어 요청은 transferSize가 0으로 보고되어 미디어 URL이 전부 버려졌음.
  3. 호스트 정규식 `(^|\.)` → `\/(?:[^/]+\.)*` — `https://v16-...`의 슬래시 뒤 호스트 시작을 매칭하도록 수정 (기존엔 `(^|\.)`가 매칭 실패).

### 실측 [chrome]
- 사용자 리포트: 틱톡 foryou에서 동영상/스트림 0건 + "본문만" 체크박스 해제·비활성(= 분석 0건 증상, `article.found=false`가 체크박스를 비활성화하는 기존 설계).
- CDP 실측: foryou 재생 중 analyze → v16/v19-webapp 미디어 URL 4~5건 캐치 → 다운로더 폴백 체인으로
  **TikTokCapture.mp4 (6.4MB, ISO Media Base Media v1 검증) 저장 성공**.
- **주의**: 확장 리로드 후 기존에 열려있던 탭의 extractor가 무효화되어 분석 시 "Receiving end does not exist" — **탭 새로고침 필수**.

### 검증
- `node --check` extractor 통과. CDP 실측: 필터 단위 테스트(250개 성능 항목 중 미디어 8건만 선별, API 오탐 없음) + analyze videos 4~5건 + 실제 다운로드 성공.

## v0.7.10 (2026-08-19) — 서명 CDN 브라우저 다운로더 폴백

### 수정 [chrome]
- **T-98**: 다운로더 창 `downloadDirect`에서 페이지 fetch가 401/403을 반환할 때
  googlevideo.com(유튜브)은 기존 재생 안내(E-CHR-DL-1005)를 유지하고,
  **그 외 서명 CDN(틱톡 등)은 브라우저 다운로더(`downloadViaDownloads` — 쿠키/Referer/UA 완전)로
  마지막 시도** 후 실패 시에만 E-CHR-DL-1005로 전환. 기존엔 페이지 fetch 403이 즉시 실패로 끝나
  서명 URL이 확장 fetch에만 403을 주는 사이트(틱톡 v16-webapp-prime)에서 다운로드 불가였음.

### 실측 [chrome]
- 사용자가 403으로 실패한 틱톡 URL(`v16-webapp-prime.tiktok.com/video/tos/.../o0MdXg4MUCkKlvnWQezRJAQfIDeg8wcAAjIM1d`)
  로 다운로더 창 직접 실행 → **32,306,664B mp4 저장 성공** (ISO Media Base Media v1 검증). 브라우저 다운로더 폴백이
  서명 CDN 403을 해결함을 최초로 확정.
- **SW 메시지 "port closed" 근본 원인 규명**: 확장 파일을 반복 수정/리로드하면 낡은 컨텍스트(확장 페이지·콘텐츠 스크립트)가
  메시지 수신 시 경쟁 반응 또는 무응답을 일으켜 `The message port closed before a response was received`가 발생.
  SW와 대상 탭을 함께 리로드해 신선한 컨텍스트로 만들면 정상 동작 — 확장 재설치 불필요.

### 검증
- `node --check` downloader 통과. CDP 실측: SW+탭 리로드 후 콘텐츠→SW `pk.analyze.page` 응답 `ok:true` (port closed 해소),
  틱톡 URL 다운로더 폴백 체인(확장 fetch 403 → 페이지 fetch 403 → 브라우저 다운로더) 실저장.

## v0.7.9 (2026-08-19) — 403 재시도 로직 + 해상도별 펼침 목록 + 자동 주입

### 수정 [chrome]
- **T-95 403 재시도 로직**: extractor `pk.fetch.stream`에서 403/401 시 `performance.getEntriesByType('resource')`의
  googlevideo 실제 요청 URL로 자동 재시도 (같은 itag 우선 → 최신). 발급만 된 player API URL이 무효여도
  재생 중 실제 요청 URL이 있으면 다운로드 성공.
- **T-96 해상도별 펼침 목록**: 스트림 목록을 해상도 그룹(4K/1440p/1080p/720p/480p/360p/240p/144p/오디오 전용/기타)으로
  묶고 헤더 클릭으로 접기/펼치기 — 사용자 요청 "해상도로 펼침 목록" 반영.
- **T-97 content_scripts 자동 주입**: manifest에 `debug.js` + `content/extractor.js` 등록 — 수동 주입
  (`pk.ensure.injected`) 없이도 탭에서 PING/analyze 동작. (DebugLogger 미정의 크래시는 debug.js 선주입으로 해결)

### 실측 발견 [chrome]
- **유튜브 UMP(Unified Media Pipeline) 전면 전환**: 2026-08-19 실측 기준 테스트한 전 영상
  (BXekKYGl23A — 12:30엔 일반 방식 성공, 아스팔트 블랙박스, Me at the zoo, Rick Astley)이 UMP로만 재생.
  로그인/비로그인(Incognito) 무관. UMP의 videoplayback URL은 미디어 대신 `sabr.malformed_config`
  제어 메시지(31B protobuf)만 반환하며, 플레이어의 실제 POST+protobuf 요청을 재현해도 미디어 수신 실패.
  → **현재 구조(URL 캡처→fetch)로는 UMP 영상 다운로드 불가** — UMP 역분석은 별도 버전으로 계획 (보류).
- 403 원인 정리: 사용자 12:36/12:37 실패(itag 600/598/599, expire=1787132137)는 player API "발급만 된" URL이
  재생 세션과 무관해 무효인 것 — 페이지 fetch로도 403 재현. 12:30 성공(캡처=실제 요청 URL, 206)이
  일반 방식의 마지막 성공 사례.

### 검증
- `node --check` extractor/panel 통과, CDP 실측: content_scripts 주입 후 PING/analyze 응답 확인 (28개 스트림),
  UMP URL 응답 유형 분류(전부 제어 메시지), 일반 방식 403 재현. SW 메시지 "port closed" 잔존
  (Chrome 재시작/리로드로 미해결 — 확장 재설치 정리 후속 예정).

## v0.7.8 (2026-08-19) — 유튜브 스트림 리스트 정리 + 다운로드 성공 실측

### 사용자 문의 기반 개선 [chrome]
- **영상 전용/오디오 전용 표시 정확화**: 오디오 itag(139/140/141/249/250/251/256/258/599/600)를
  `audio-only`로 분류 (기존엔 `video-only`로 잘못 표시 — "오디오 128k (영상 전용)" 버그 수정).
  progressive(영상+오디오 하나의 파일, itag 18/22 등)는 `(영상+오디오)` 표시 추가.
- **유튜브 스트림 리스트 정리**: ① 같은 itag 중복 제거 (서명 URL이라 재분석마다 누적되던 중복 방지)
  ② 캡처 URL이 같은 itag의 player 포맷 항목 URL을 신선한 재생 세션 URL로 갱신 (다운로드 성공 보장)
  ③ 같은 itag의 캡처 중복은 교체 (분석 반복 누적 방지) ④ 이름에 코덱 표시 (H.264/AV1/VP9/AAC/Opus)
  → 36~40개 주룩 → 화질·코덱 구분 명확한 27개로 정리 (720p60 3개 = H.264/AV1/VP9 코덱 차이)

### 다운로드 동작 실측 [chrome]
- **3개 체크 → 다운로드 → 작업 창 3개 병렬** 확인 (windows 실측: popup 3개 생성, 각각 독립 진행)
- **유튜브 스트림 실제 저장 성공**: 신선한 캡처 URL + 확장 fetch로 206 수신 → 144p H.264 57.9초 mp4
  저장 완료 (ffprobe 검증) — v0.7.7 페이지 fetch 폴백 포함, 실패 시 재생→재분석 안내 메시지 개선
- 다운로더 로그 보강: 확장 fetch 403 → 페이지 폴백 전환, 페이지 fetch 성공/실패, 폴백 탭 없음 로그 추가

## v0.7.7 (2026-08-19) — 유튜브 googlevideo 403 대응 (페이지 컨텍스트 fetch 폴백)

### 원인 분석 [chrome]
- 사용자 로그: 유튜브(itag=599) 스트림 다운로드 실패 `E-CHR-DL-1002` (SERVER_FORBIDDEN)
- 확장 fetch(쿠키 없음) → 403, 브라우저 다운로더(열린 Range `bytes=0-`) → 403, 페이지 fetch(Range 없음) → 403
- 같은 IP·만료 전인데도 403 실측 — **googlevideo 서명 URL은 발급된 재생 세션에 묶여 재생 외 시점엔 무효**
  (webRequest로 캡처한 URL도 다운로드 시점에 403 가능)

### 수정 [chrome]
- **T-93 페이지 컨텍스트 fetch 폴백**:
  - `extractor.js`에 `pk.fetch.stream` 핸들러 — 유튜브 탭(MAIN world)에서 재생과 동일한
    쿠키/Referer/Origin 조건으로 한정 Range fetch → base64 청크 반환 (유튜브 페이지→googlevideo는 CORS 허용)
  - 다운로더 창 `downloadDirect` — 확장 fetch 401/403/실패 시 페이지 경유 한정 Range 청크 수신으로 전환,
    그것도 실패하면 브라우저 다운로더로 폴백 (기존 경로 유지)
  - `tabId` 전달 체인: 패널 → `DOWNLOAD_STREAM` payload → `streamWinUrl(tid)` → 다운로더 창 `JOB.tabId`
  - 실패 메시지 개선: "유튜브 스트림 주소는 재생 중일 때만 유효합니다 — 영상을 다시 재생한 뒤 ⟳ 버튼으로
    재분석하고 즉시 다운로드하세요"

### 검증
- 403 URL 실측: 확장 fetch/브라우저 다운로더/페이지 fetch(Range 포함) 전부 403 — URL 무효 확인 (수정 후에도 이 URL은 실패 — 재생 중 새 URL 필요)
- `pk.fetch.stream` 핸들러 응답 동작 확인 (403 → ok:false status 전달, CORS 미허용 CDN → fetch 실패 전달)
- 200 성공 경로는 유튜브 재생 중 새 캡처로 사용자 재시도 필요
- `node --check` 4파일 통과

## v0.7.6 (2026-08-19) — 팝업 정리 + 아이콘 숨김 기본 체크 + 빈 결과 안내

### 수정 [chrome]
- **T-90 팝업 빈 공간 제거**: "▶ 사이드 패널에서 전체 보기" 아래 빈 섹션이 보이던 문제 —
  v0.7.5 플로팅 토글 버튼 제거 시 남은 빈 `<section>` 잔재 제거
- **T-91 아이콘 숨김 기본 체크 + 배치 변경**: `pk-hide-icons` 기본 `checked`,
  "본문만 · 아이콘 숨김 · 드롭메뉴(형식/크기)" 순서로 이동
- **T-92 빈 결과 안내**: 검색/필터 결과 0건이면
  "검색된 데이터가 없습니다 — 검색어·필터를 해제하거나 다른 카테고리를 확인해 보세요." 표시
  (기존엔 빈 화면. 분석 자체가 없을 때의 "분석 결과가 없습니다"와 분리)

### 검증
- Chrome CDP 실측: 검색어 입력 → 0건 메시지 표시, 검색어 해제 → 목록 90건 복귀
- `node --check` 통과

## v0.7.5 (2026-08-19) — 컨텍스트 메뉴 수리 + 분석 오버레이 + URL 양끝 표시 + 플로팅 제거

### 수정 [chrome]
- **T-86 컨텍스트 메뉴 "PageKit으로 분석" 오류 수리**
  - 원인: `onClicked`에서 `await ensureInjected()`가 user gesture를 소멸시켜 `sidePanel.open()` 실패
    → fallback `tabs.create`(새 탭) + 패널이 **첫 번째 웹 탭**을 분석하는 이중 오류
  - 수정: `onClicked`에서 동기 `openSidePanel('context', tab.windowId)` + `storage.session.set({contextTarget})`
    + `ensureInjected` fire-and-forget. 패널 `analyze()`는 `contextTarget` 탭을 1회 분석(사용 후 제거),
    `storage.onChanged` 리스너로 이미 열린 패널 즉시 재분석
  - 검증: 활성 탭 google 상태에서 torrentsee 우클릭 분석 성공 (🖼98/링크221)
- **T-87 분석 중 로딩 오버레이**: 패널에 `#pk-overlay`("분석 중…" 스피너, 반투명 + backdrop blur)
  — `analyze()` 시작 시 표시, 성공/실패 모두 `finally`로 숨김. 탭/페이지 변경 자동 갱신 시에도 동작
  - 검증: ⟳ 클릭 0.6초 시점 표시 → 완료 후 숨김 실측
- **T-88 URL 표시 양끝**: `shortenUrl`을 파일명 중간 축약에서 "앞부분…파일명끝" 형태로 변경
  (`.../final-ver2.jpg`처럼 끝부분 유지). 4케이스 단위 검증

### 제거 [chrome]
- **T-89 플로팅 버튼 완전 제거** (사용자 결정 — "안 먹히면 아예 빼자")
  - 원인: content script 경유 클릭은 MV3에서 user gesture가 전달되지 않아 `sidePanel.open()` 항상 실패
    (fallback 탭 활성화만 동작 — 실측 확인)
  - 삭제: `content/float-button.js`·`float-button.css` 파일, extractor.js `ensureFloatButton`/`pk.ui.floatVisible`
    핸들러, service-worker.js `injectFloatButton`/`FLOAT_BUTTON_READY`/`RUN_SCRIPTS`, popup.js 토글 버튼,
    messages.js `FLOAT_BUTTON_READY`·`PANEL_SOURCES`의 'float'
  - 검증: 페이지 리로드 + 새 코드 주입 상태에서 `#pk-float-btn` 미존재 실측
- 에러코드 변경 없음 (E-CHR-NET-1001 등 기존 유지)

## v0.7.4 (2026-08-19) — 설치 온보딩 페이지

### 추가 [chrome]
- **T-85 온보딩 페이지** (`onboarding/onboarding.html`): 확장 **최초 설치 시 자동으로 열리는** 사용 설명 페이지
  - 0. 툴바에 고정 방법과 이점 (고정 유도 — 진행률 배지/원클릭 진입 강조)
  - 1. 우클릭/복사 제한 해제 방법 (옵션 체크박스, 새로고침 불필요)
  - 2. 이미지·스트림·동영상 다운로드 방법 (패널 자동 분석 → 탭별 다운로드/스트림 자동 캡처/CSV)
  - 버튼: 설정 열기(`openOptionsPage`) · 닫기(`tabs.remove`) · 버전 동적 표시
- `service-worker.js` `onInstalled`: `details.reason === 'install'`일 때만 온보딩 탭 생성 (업데이트 시 미표시)

### 검증
- Chrome CDP 실측: 카드 3개·스텝 10개 렌더링, 리로드 후 v0.7.4 표시, 닫기 버튼 탭 닫힘

## v0.7.3 (2026-08-19) — 아이콘 숨김 이름 패턴 + options 버전 하드코딩 수정

### 수정 [chrome]
- **T-83 아이콘 숨김 개선**: `isIcon`에 파일명/URL 패턴 판정 추가
  (`icon/logo/arrow/jiantou/btn/chevron/menu/close/spinner/sprite/prev/next/sort/gear/heart/star/like/share/play/pause/check/dot/point/nav/pager/slide/setting` 등)
  — CSS 배경·og:image처럼 크기 미확인(w:0,h:0) 이미지도 이름으로 판정 (기존: svg·48px 이하 크기 기준만)
  - 사용자 예시 `torrentsee349.com/images/jiantou2.png`(화살표) 등 장식 이미지 숨김 가능
- **T-84 options 버전 하드코딩 제거**: footer `PageKit v0.1.0` → `pk-version-foot` +
  `getManifest().version` 동적 표시 (panel/options 헤더와 동일 방식)

### 검증
- 패턴 단위 테스트 8케이스 통과 + `node --check`
- Chrome CDP 실측: 확장 리로드 후 options 헤더/푸터 **v0.7.3** 표시 확인
  (참고: 이전 로드본은 수동 로드 시점 0.5.0이었음 — 리로드 후 manifest 반영 확인)

## v0.7.2 (2026-08-19) — 패널 스트림 탭을 영상 옆 버튼으로

### 변경 [chrome]
- **T-82 패널 카테고리 UI**: 드롭다운에 숨어 있던 스트림 탭을 상단 버튼으로 노출 (사용자 결정 — 버튼 3개 + 드롭다운)
  - 상단: 🖼 이미지 / 🎬 영상 / 📡 스트림 버튼 3개 (각각 카운트 배지)
  - 드롭다운: [전체, 오디오, 링크]
  - `panel.html` + `panel.js` (render/setCategory/이벤트)

### 검증
- `node --check` 통과 + Chrome CDP 실측: 버튼 3개 렌더링, 📡 클릭 → active 전환 + 셀렉트 'all' 초기화

## v0.7.1 (2026-08-19) — ENDLIST VOD 세그먼트 수 가드 오판 수정

### 수정 [chrome]
- **T-80 ENDLIST VOD 오판**: `downloader.js` 세그먼트 수 가드(`segs.length > MAX_SEGMENTS(200)`)가 ENDLIST 유무를 확인하지 않아, **ENDLIST가 있는 정상 VOD(242개 세그먼트 ≈ 40분)도 LIVE로 오판해 E-CHR-DL-1003으로 차단**하던 문제 수정
  - 변경: `if (!m.endlist && m.segs.length > MAX_SEGMENTS)` — ENDLIST 있는 VOD는 세그먼트 수 무관 저장
  - LIVE 판단은 기존 로직(ENDLIST 부재 + 0.5초 후 재요청 세그먼트 증가 비교)이 담당
- 실사용 로그 기반 수정: `t27.cdn2020.com/video/m3u8/.../index.m3u8` (매니페스트 직접 확인 — ENDLIST 있음, 242개)

### 검증
- 단위: `parseM3U8` 242개 + ENDLIST → 통과 (수정 전: 차단)
- Chrome CDP 실측: 같은 스트림으로 다운로더 창 열림 → **"세그먼트 수신 중 5/242 · 2%"** 진행 확인 → 취소

## v0.7.0 (2026-08-19) — 스트림 병렬 다운로드 (독립 창)

### 변경 [chrome]
- **T-71 스트림 다운로드 병렬화**: 다운로드 진행 중(또는 창이 열려 있는 상태) 두 번째 스트림 다운로드 요청 시
  - 기존: SW가 살아있으면 `streamBusy=true` → **대기열에 조용히 추가**되어 창이 열리지 않음 (토스트만 "창을 엽니다" 표시), SW가 잠들었다 깨어나면 상태 초기화로 새 창이 열려 **동작이 상황에 따라 달랐음**
  - 변경: `streamQueue`/`streamBusy`/`streamWinId` 대기열 로직 **제거** — 요청마다 **항상 독립된 새 창**을 열어 병렬 다운로드
- `openStreamWindow()`: 기존 창 재사용(URL 덮어쓰기) 로직 제거 → 항상 `chrome.windows.create`
- `DOWNLOAD_STREAM` 핸들러: `streamBusy` 분기 제거, 무조건 새 창 시작
- `STREAM_DONE` 핸들러: 대기열 다음 작업 분기 제거 → 항상 완료 시스템 알림
- `windows.onRemoved`: 배지 정리만 수행 (병렬 진행 중인 다른 창은 `STREAM_PROGRESS`로 배지 재갱신)

### 검증
- `node --check` 통과, 잔여 참조(`streamQueue` 등) 0건
- Chrome CDP 실측 (확장 수동 로드, ID fpmeemda…): 스트림 2건 연속 요청 → **독립 팝업 창 2개가 동시에 열려 각자 다운로드 진행** (창1: tears-of-steel 2/184 세그먼트 · 창2: Big Buck Bunny 1/64 세그먼트) — 취소 후 정리

## v0.5.0 (2026-08-15) — DASH(mpd) 병합 + ZIP 패키징 + 유튜브 player API + CSV 내보내기

### 기능 [chrome]
- **T-53 DASH(mpd) 세그먼트 병합**: `parseMPD` 확장 — SegmentTemplate(기존) + **SegmentList + SegmentBase(on-demand) 지원**. on-demand는 단일 파일 전체를 그대로 저장 (병합 불필요). ISO8601 기간 파싱의 Y(년)/M(월) 누락 버그 수정 (`P0Y0M0DT0H3M30.000S` 등)
- **T-54 ZIP 패키징**: 다운로드 버튼 옆 [ZIP] 체크박스 — 선택 항목을 Store ZIP 하나로 저장 (100MB 가드, CORS 실패 시 페이지 컨텍스트 viaPage 폴백)
- **T-52 유튜브 player API**: `mergeYoutubePlayerFormats` — innertube `ANDROID_SDKLESS` 직접 호출로 m3u8 포맷 확보 (webRequest 캡처 실패 대응)
- **T-55 링크 CSV 내보내기**: 링크 탭 [CSV] 버튼 — 검색·필터가 적용된 현재 목록을 `PageKit/{host}/links/`에 저장 (BOM 포함, Excel 한글 깨짐 방지)

### 수정 [chrome]
- **SW `URL.createObjectURL` 미지원 버그**: ZIP 저장과 viaPage 개별 다운로드가 SW에서 `URL.createObjectURL` 호출로 실패 → `blob.arrayBuffer()` → base64 `data:` URL로 `chrome.downloads.download` (기존 "SW는 createObjectURL 불가 + Whale offscreen 미지원" 제약과 일치). `fetchViaPage`는 base64 직접 반환으로 단순화

### 검증
- Chrome CDP 실측: ZIP 3건(76KB) `unzip -t` 무결성 통과, CSV 5건 BOM/컬럼 정상, DASH 파서 단위 검증 (segs=53)
- Whale 실사용: Bitmovin DASH art-of-motion `segs=53 init=true 1920×1080` 병합 저장 성공, ZIP 패키징 성공, 유튜브 player API 정상 (사용자 확인)

## v0.4.2 (2026-08-15) — 다운로더 폴더명 정리 (downloader2 → downloader)

### 변경 [chrome]
- **`extension/downloader2/` → `extension/downloader/`**: 웨일 경로 기반 JS 캐시 우회용 폴더명이었으나, 테스트 브라우저가 Chrome으로 전환(2026-08-15 사용자 확정)되어 불필요해짐 — `?v=` 쿼리 캐시 버스터로 일원화
- 웨일 실사용 리로드 시에는 기존 절차(`.whale-profile/Default/Service Worker` 캐시 삭제 + 재시작)로 대응
- 참조 갱신: service-worker.js `streamWinUrl()`, downloader.html css/js 경로

### 검증
- Chrome CDP: `downloader/downloader.html` 200 응답 + 다운로더 창 정상 로드(UI 렌더 확인) ✅

## v0.4.1 (2026-08-15) — 우클릭 해제 페이지 로드 시 자동 주입 (실사용 리포트 대응)

### 수정 [chrome]
- **근본 원인 (실사용 리포트)**: 체크박스 ON + 사이트 접속 시 우클릭 해제 미동작 — PageKit은 manifest `content_scripts` 자동 주입이 없고 **요청 시(분석/패널 열기)에만 스크립트 주입**하므로, 그냥 페이지에 들어가면 `unlock.js`가 페이지에 존재하지 않았음 (화이트리스트 시절부터 동일한 구조적 문제)
- **해결**: BG `tabs.onUpdated`(status=complete)에서 `settings.unlockEnabled === true`면 해당 탭에 `debug.js`+`unlock.js` 자동 주입 (`__pkUnlockLoaded` 가드로 중복 안전). 옵션에서 ON 토글 시에도 현재 활성 탭에 즉시 주입 (새로고침 없이 바로 동작)
- 전역 자동 주입이 아닌 **설정 ON 시에만** 주입 — 심사 친화적

### 검증
- Whale CDP 실측 (2026-08-15): 옵션 체크 ON → 네이버 브랜드 스토어(products/13171351553) 열기 → `#pk-unlock-style` CSS 주입 + `user-select: text` 적용 확인 (ISOLATED world 주입 정상)

## v0.4.0 (2026-08-15) — 우클릭/복사 제한 해제 전역 체크박스 전환

### 변경 [chrome]
- **화이트리스트(도메인 배열) 방식 제거 → 전역 체크박스**: 옵션 "🔓 우클릭/복사 제한 해제"를 `settings.unlockEnabled` 1개 체크박스로 단순화 (모든 사이트 즉시 적용). 호스트 기반 미동작 이슈(WPageTools-ik7) 해소 — 입력 도메인 vs 실제 hostname 불일치/www 접두사 등으로 동작하지 않던 문제
- **즉시 반영**: 옵션 토글 → `chrome.storage.onChanged`(settings 키)로 콘텐츠 스크립트가 즉시 활성/비활성 (새로고침 불필요)
- **기존 데이터 마이그레이션**: `unlockSites` 보유 시 1회 `unlockEnabled=true`로 승계 후 정리 (기존 사용자 보호)
- **미사용 코드 정리**: `UNLOCK_TOGGLE` 메시지, `getUnlockSites`/`toggleUnlockSite`(storage.js), 옵션 화이트리스트 렌더/추가/공통 삭제 unlockSites 분기 제거

### 검증
- JS 5개 파일 `node --check` 통과
- Whale CDP 실측 (2026-08-15) — ① 옵션 체크박스 렌더(레거시 입력/리스트 제거 확인) ② ON 토글 → `settings.unlockEnabled=true` 저장 + 테스트 페이지(우클릭 차단 + user-select none)에 `#pk-unlock-style` 즉시 주입 + user-select text 적용 ③ OFF 토글 → CSS 제거 + user-select none 원복 (새로고침 없이 즉시) ④ 레거시 `unlockSites` 보유 → `unlockEnabled=true` 1회 승계 + 배열 정리 확인

## v0.3.0 (2026-08-14) — 유튜브 스트림 캡처 (webRequest) + UMP 감지

### 기능 [chrome]
- **유튜브 스트림 캡처 (webRequest)**: watch/shorts는 blob 재생이라 성능 엔트리로 실스트림 추출 불가 → `onBeforeRequest`로 googlevideo.com `videoplayback` media 요청 캡처 → itag 파싱(화질 라벨·progressive/video-only 판별) + range 필터(부분 요청 제외) + `storage.session` 최대 5개(itag별 dedup, capturedAt) → 패널 스트림 탭에 병합 ("동영상을 재생하면 자동 캡처됩니다" 안내)
- **UMP/SABR 감지 (E-CHR-DL-1006)**: 캡처된 googlevideo URL은 무로그인 재생이 전부 UMP 전환(2026-08-14 실측) — fetch 후 Content-Type에 `yt-ump|sabr`가 있으면 즉시 중단 + 안내 문구 (실측: 시작 후 15초 내 안내 표시)
- **다운로더 타임아웃/취소 재작성**: 웨일 확장 페이지는 AbortController로 in-flight fetch/read를 중단하지 못함(실측) → Promise.race 기반 (연결 25초, read idle 15초 — 0바이트 chunk는 타이머 리셋 안 함, 취소는 `globalThis.__dlCancelCurrent`)

### 수정 (실측 검증 중 발견) [chrome]
- **`downloadDirect` 내 `const tErr` 중복 선언 → module SyntaxError로 다운로더 JS 전체 미실행** — "웨일이 구버전 JS를 캐시한다"로 오인되던 근본 원인. 노드 `node --check`는 통과하므로 코드레벨 검수 필요
- **`runDownload`의 `return downloadDirect()` await 누락** → E-CHR-DL-1006 throw가 unhandled rejection으로 나가 **에러가 UI에 안 보이고 "수신 중"이 무한 유지** — `return await`로 수정
- **다운로더 디렉터리 `extension/downloader2/`로 이전**: 웨일은 확장 JS를 경로 기반으로 캐시(`?v=` 쿼리 무시, 파일명 변경만 우회) → 폴더명이 버전 역할 (script src에 `?v=1` 유지)

### 검증
- UMP 영상 실측: fetch 200 + `application/vnd.yt-ump` (sabr.malformed_config 31B) → E-CHR-DL-1006 "다운로드 실패" 안내 정상 표시 ✓ 다시 시도 버튼 ✓
- 캡처 → BG 경유 다운로더 창 → URL 파라미터(u/n/f/t/r) 전달 정상 ✓ Referer 규칙 등록 로그 ✓

### 남은 작업 (v0.3.0+)
- HTTP 미디어 제공 영상 탐색 (UMP 전면 전환 이전 샘플 필요 — 없으면 mp4 실저장 검증 불가)
- UMP/SABR 프로토콜 파싱으로 세션 재구성 연구 (확장 지점 5)
- options.js의 `?dl=` 디버그 훅·`__PKDL_VER` 마커 유지 (웨일 테스트 워크플로우 필수 — SW CDP attach 500 우회)

## v0.2.0 (2026-08-14) — 스트림(m3u8) 병합 다운로드 — 독립 작업 창

### 기능 [chrome]
- **스트림 다운로드 작업 창 (v2 구조)**: 패널/팝업의 스트림 다운로드는 BG가 작은 팝업 창(520×400)을 열어 수행 — 페이지 클릭/패널 닫힘과 무관하게 지속. 확장 페이지라 fetch+Blob+downloads 모두 가능 (MV3 SW의 createObjectURL 불가/Whale offscreen 미지원 우회)
- **매니페스트 해석**: `shared/m3u8.js` — 마스터(#EXT-X-STREAM-INF) 재귀 해석(깊이 2), 최고 화질 자동 선택, AES-128 암호화 불가 안내, LIVE 판정(ENDLIST/PLAYLIST-TYPE/2회 fetch 세그먼트 수 비교), 200세그먼트/300MB 가드, 15초 타임아웃
- **화질(해상도) 선택**: 마스터면 변형 드롭다운 표시 (해상도·fps·kbps — `856x480 · 60fps · 652kbps`), 기본=최고 화질로 자동 시작, 시작 전에만 변경. `parseM3U8`에 RESOLUTION/FRAME-RATE 파싱 추가
- **진행률 표시**: 세그먼트 i/N · MB · % + **평균 속도(MB/s, 최근 3개 세그먼트 이동 평균)** + 아이콘 배지 진행률 %
- **파일명 기본값 = 페이지 제목** (`t=` 파라미터 전달, 특수문자 필터 + 80자 제한), **진행 중에도 변경 가능**(저장 직전 최종값 반영), 확장자 생략 시 .ts 자동
- **완료 처리**: 완료 화면에 **저장 경로 표시 + "파일 위치 열기" 버튼**(chrome.downloads.show), 시스템 알림(클릭 시 파일 위치 열기), **10초 후 자동 닫기(창이 직접 닫음 — SW 타이머 유실 방지)**
- **순차 대기열**: 스트림 여러 개 선택 시 BG가 큐 보관 → 완료 후 다음 자동 시작, 마지막 완료 시에만 알림+자동 닫기, 창 닫힘=항목 포기로 다음 진행
- **화질 변형 통합**: 스트림 목록에서 마스터를 fetch해 판별(병렬+6초 타임아웃, 비동기로 즉시 렌더 후 갱신) → 변형 url과 일치하는 항목은 숨기고 마스터에 "화질 N개 통합" 표시 — 같은 영상의 화질들이 항목으로 중복 노출되던 문제 해소
- **순차 세그먼트 수신**: 1회 재시도 + 1.2초 간격 (웨일 네트워크 서비스 크래시 대응), 취소(AbortController), `PageKit/{도메인}/videos/{이름}.ts` 저장 (conflictAction uniquify)
- **스트림 항목 이름**: extractor가 url 기반 이름 부여(`streamName`), 패널 표시명 name 우선
- **"본문만" 필터 예외**: 스트림 카테고리는 본문 판정과 무관하게 항상 표시 (재생 중일 때만 잡히는 실용 항목)

### 수정 (E2E 검증 중 발견) [chrome]
- 토렌트씨 마스터 매니페스트(ENDLIST 없음)를 LIVE로 오판 → ENDLIST 부재 VOD는 2회 fetch 세그먼트 수 비교로 구분 (E-CHR-DL-1003)
- `t=`(페이지 제목) 파라미터가 작업 창에 전달 안 되던 문제 → **서비스 워커 캐시가 구버전 코드 실행** — `.whale-profile/Default/Service Worker` 캐시 삭제 후 재시작으로 해결 (확장 리로드만으로는 SW 코드 갱신이 안 되는 웨일 특성)
- 완료 후 10초 자동 닫기가 간헐 실패 → SW의 `setTimeout(windows.remove)`는 서비스 워커 수명과 함께 유실될 수 있어 **다운로더 창이 직접 window.close()** 하도록 변경
- 스트림 변형 통합 fetch가 순차 15초 타임아웃으로 렌더를 최대 60초 블로킹 → **병렬(6초 타임아웃) + 즉시 렌더 후 비동기 갱신**

### 검증
- 스마트스토어(완숙토마토 상품): 파일명=페이지 제목(완숙토마토 5kg…경북유통.ts) ✓ 속도 표시 ✓ 진행 중 파일명 변경 ✓ 완료+경로+열기 ✓ 10초 자동 닫기 ✓ ffprobe mpegts 17.08s(h264 270×480+aac) ✓
- 순차 큐: 스트림 2건 → 첫 완료 후 두 번째 자동 시작 → (1).ts 1.2MB + (2).ts 1.9MB → 자동 닫힘 ✓
- 토렌트씨 마스터: 화질 변형 3개 드롭다운(856×480·854×480·640×360) ✓ 최고 화질 자동 선택 ✓ 97세그먼트(962s, 80.1MB) 전체 병합 저장 ✓

## v0.1.0 (2026-08-14) — 최초 릴리스 후보

### 기능 [chrome]
- 본문 추출: Readability clone 기반 (타이틀/발췌/본문텍스트, 1MB 가드)
- 미디어 수집: 이미지(srcset/lazy/background/currentSrc) · 비디오/오디오(m3u8·mpd 감지) · 링크(pdf/zip 타입 분류)
- 본문 내/외부(inArticle) 분류 — 광고 배너 vs 기사 이미지 구분
- 배치 다운로드: `chrome.downloads`, 동시 N건(설정), 실패 재시도 2회, `PageKit/{도메인}/{카테고리}/{파일명}` 저장, filename 옵션 지원, 배지 표시, `pk.dl.state` 조회
- 진입점 5종: 아이콘 팝업 · 컨텍스트 메뉴 · 단축키(Cmd+Shift+K) · 팝업 버튼 · 플로팅 버튼(요청 시 주입)
- 사이드 패널: 분류 탭·배지, 본문만 필터, 형식/검색 필터, 선택·다운로드, 토스트
- 우클릭/복사 제한 해제 + 화이트리스트, 사이트별 preRemove 규칙, 정규식 프리셋
- 본문 하이라이트 + Shift 드래그 보정
- **DebugPanel** (AGENTS.md 19장): DebugLogger(storage.local debugLog 최대 2000건 FIFO, content→BG 위임, 300ms 디바운스, PERF/CACHE/FEATURE 레벨), 전용 디버그 창(Cmd+Shift+D, 2초 폴링, 레벨/탭/검색 필터, 복사/지우기), 전 기능 디버그 메시지 통합

### 수정 (E2E 검증 중 발견) [chrome]
- 팝업 분석 전 콘텐츠 스크립트 주입 누락 → `MSG.ENSURE_INJECTED` 추가
- 확장 페이지 메시지의 `sender.tab` 없음 문제 → `ENSURE_INJECTED`에 `payload.tabId` 명시 전달 (팝업/패널/단축키 분석 실패 해결)
- 다운로더가 `item.filename` 무시 → 우선 사용
- 이중 확장자(.png.png) → 확장자 중복 방지
- `pk.dl.state` 핸들러 누락 → 추가
- debugEnabled 캐시 미갱신(SW 장수명) → `chrome.storage.onChanged` 구독
- **디버그 로그 기본 꺼짐 문제** → 기본 활성화 + 옵션/디버그 창에서 ON/OFF 토글 + 디버그 창 상태 배너 (꺼짐 시 경고 표시)
- YouTube 등 blob 재생 페이지에서 동영상 0 → `og:video` 메타 폴백 추가
- 사이드 패널/단축키에서 임의 사이트 분석 불가 → host_permissions `<all_urls>` 추가 (사용자 확정)
- 패널 아이템 URL에 `CSS.escape` 사용으로 백슬래시 표시 → HTML 이스케이프(esc)로 교체
- 패널 "본문만" 필터 기본 ON
- 쿠팡 등 쇼핑몰에서 본문 이미지가 안 보이던 문제 → Readability 본문 미디어가 10개 미만이면 본문/상품 컨테이너(.product-image, .prod-atf, cafe24 .xans-* 등)에서 fallback URL 보강 (inArticle 판정 개선)
- 이미지 `type` 판정: 확장자 화이트리스트(14종) 미포함 시 `unknown` → 패널에 "알수없음" 표기 (파일명 뒷자리 노출 방지)
- 썸네일 표시 실패(CSS 변수 url() 토큰 파싱 문제) → 인라인 background-image + JS 팝오버(마우스 오버 260×260 대형 미리보기)로 전환
- 주소 줄임: CSS ellipsis와 중복 잘림 → 표시 폭(38자)에 맞춰 앞만 줄임 + 파일명 중간 축약(9+…+4), 툴팁에 전체 URL
- 이미지 크기 표시 누락 → naturalWidth/naturalHeight 우선 사용 (로드된 이미지는 원본 크기)
- 이미지 크기(픽셀) 필터 추가 (100/500/1000/2000px 이상, max(w,h) 기준) — 이미지 카테고리 전용
- **og:image 대표 이미지 우선 배치**: og:image 메타가 DOM에 없으면 추가, 있으면 맨 앞으로 이동 (쿼리 제거 비교로 중복 방지) — YouTube 대표 썸네일 보장
- **아이콘 숨김 토글**: svg 또는 48px 이하 이미지 숨김 (이미지 카테고리 전용, 필터 요약 표기)
- **blob: 재생 대응 (JW Player 등)**: `og:video`에 이어 ① jwplayer 플레이리스트 ② 인라인 설정 스크립트(`file:` 키의 mp4/m3u8/mpd) ③ performance resource entries 순으로 실제 파일 URL 폴백 (kind='player')
- **교차 오리진 iframe 플레이어**: iframe src(embed/player/stream/watch)를 동영상 후보로 표시 (kind='iframe', label='플레이어(iframe)', 본문 판정 밖이어도 "본문만" 필터에서 유지) — torrentsee349.com → rubyvidhub embed 대응
- **iframe 내부 미디어 직접 추출**: 분석 스크립트를 모든 프레임에 주입(allFrames) + 메인 프레임이 iframe에 postMessage 협업 요청 → iframe 내 jwplayer 등에서 실제 m3u8/mp4 URL 병합 (타임아웃 1.5초, videos/audios/streams만). `tabs.sendMessage`는 `{ frameId: 0 }` 명시(모든 프레임 전달/응답 경쟁 방지), iframe 컨텍스트는 직접 분석 메시지에 응답하지 않음

### 검증
- JS 18개 파일 `node --check` 통과
- E2E(Whale CDP): 분석 분류 정확도 · 배치 다운로드 저장 경로 · 디버그 창 폴링/필터/지우기 — docs/e2e/PLAN.md
- a11y-dump 3종 세트: docs/screenshots/chrome/v0.1_*
- webstore-publish --dry-run 통과 (unsafe-eval 없음, WAR 0, host_permissions 배포용 OK)

### 알려진 제약
- 정식 Chrome 137+는 `--load-extension` 무시 → 로컬 테스트는 Whale 사용
- Whale 다운로드 확인 프롬프트는 설정(다운로드 전 저장 위치 확인) 해제 필요
- **Whale/Chrome은 확장 SW 스크립트를 프로필 `Service Worker/ScriptCache`에 캐시** — 코드 수정 후에도 옛 코드가 실행될 수 있음. 재로드 후에도 반영 안 되면 `~/.whale-profile/Default/Service Worker` 삭제 후 브라우저 재시작

### 수정 (v0.1.1 후보 — 실사용 테스트 반영) [chrome]
- **HLS/플레이어 m3u8 다운로드 403(SERVER_FORBIDDEN) 해결**: ① 추출 시 시그니처 쿼리(토큰)를 보존 (성능 엔트리에서 `split('?')` 제거하던 문제) ② CDN Referer 체크 대응 — extractor가 출처 페이지(referer)를 기록, 다운로드 시 `declarativeNetRequest` 동적 규칙으로 Referer/Origin 헤더 주입 후 해제
- **패널 "링크 복사" 버튼 추가**: 선택 항목 URL을 줄 단위로 클립보드 복사 (Clipboard API 실패 시 execCommand 폴백, 토스트 안내)
- m3u8/mpd 파일명 이중 확장자(`master.m3u8.m3u8`) 방지
- **네이버 스마트스토어 상세 이미지 미수집 해결**: 상세 이미지가 `src="data:(1px placeholder)"` + `data-src="실제 URL"` 구조인데 `img.src`가 truthy라 `data-src`까지 도달 못 하던 문제 → http URL 우선 선택(`firstHttp`)으로 srcset/currentSrc/src/data-src 중 첫 http URL 사용 (이미지/본문 URL 판정 양쪽 적용) — 상세 본문 이미지 19개 표시 확인 (본문만 필터 기준)
- 본문 폴백 일반화: Readability 본문 미디어가 10개 미만일 때 해시 클래스 쇼핑몰(스마트스토어 등) 대응 — "이미지 10개 이상 + 텍스트 500자 이상인 최대 컨테이너"를 본문으로 보강 (기존 선택자 기반 폴백 후순위)
- 분석 결과에 디버그 필드 추가: `debug.articleMediaCount` / `debug.fallback` (분석 진단용)
- **iframe 협업 재요청/타임아웃 확장**: 페이지를 연 직후 분석하면 iframe이 아직 로드 전이라 협업 postMessage가 유실될 수 있음 → 미응답 iframe에 1초 후 1회 재전송, 타임아웃 1.5초→3초 (torrentsee 782322·782288에서 iframe 내부 m3u8 2개 + iframe 항목 캐치 확인)
- **사이드 패널이 이전 페이지 분석 결과를 재사용하던 문제**: `lastAnalysis`에 `url` 미저장 + `tabId`만 비교 → 같은 탭에서 다른 페이지로 이동 후 패널을 열어도 옛 결과 표시 → `lastAnalysis.url` 저장 + 재사용 조건을 `tabId + url` 모두 일치로 변경 (URL 변경 시 자동 재분석)
- **네이버 스마트스토어 대표 동영상(navertv VOD) 미추출 해결**: 영상 `src="blob:"`이라 http 필터에서 누락되고 재생 전에는 m3u8 요청이 없었음 → 플레이어가 자동 호출하는 `neonplayer/vodplay/v3/playback/{vid}` 성능 엔트리 URL을 fetch(credentials 포함)해 응답에서 HLS m3u8/DASH MPD URL 추출 (kind='player', referer=페이지 URL, inArticle=true, 품질별 최대 4건) — gyeongbuk/products/11771879987에서 동영상 4건 캐치 확인
- **패널 이미지 1×1 크기 표시 해결**: 스마트에디터 lazy 이미지가 placeholder(1×1)로 로드되어 naturalWidth=1이던 문제 → ① manifest CSP에 `img-src https: data: blob:` 추가 (확장 페이지에서 실제 이미지 로드 허용) ② 패널에서 1×1 항목(최대 60개)을 `Image()`로 로드해 실측 크기 갱신 — `allItems()`가 복사본을 만들어 원본 갱신이 소실되던 문제도 원본(`analysis.media.images`) 직접 갱신으로 수정 (780×1021 등 실측 표시 확인)
- **플로팅 버튼 "표시됨" 문구만 뜨고 버튼이 안 보이던 문제**: ① extractor.js만 주입된 페이지(주입 부분 실패 등)에서는 onMessage가 `pk.ui.floatVisible`을 흡수하고 응답이 없어도 `tabs.sendMessage`가 에러 없이 성공 → popup.js가 "성공"으로 오판해 주입 경로를 건너뜀 → popup.js가 `resp?.ok === true`일 때만 성공 처리, 응답 없으면 float-button.js(+debug.js) 주입 후 재전송 ② extractor.js에 `pk.ui.floatVisible` 핸들러 추가 — extractor만 있어도 직접 버튼 생성/표시(기존 float-button.js와 동일 DOM, 이중 주입 가드) ③ 팝업이 항상 `float-button.css`를 미리 주입(extractor 경로는 CSS를 안 주입하므로) ④ BG `MAIN_SCRIPTS`에 `debug.js` 추가 (float-button.js의 DebugLogger 의존성) — 3케이스(정상/extractor만/빈 페이지) 실측 통과
- **리로드 후 분석/플로팅 실패 근본 해결**: `ensureInjected`가 세션 키(`injected:{tabId}`)만 보고 주입을 스킵 → 리로드로 스크립트가 사라져도 키가 남아 "주입됨"으로 오판, 분석은 "Receiving end does not exist" 실패 · 플로팅은 extractor-only 상태 유발 → 세션 키 대신 `pk.ping` 실시간 검증으로 교체 (extractor.js에 ping 핸들러 추가, 메인 프레임만 응답)
- **사이드바 자동 갱신**: 패널이 열린 상태에서 탭 전환/같은 탭 URL 변경 시 자동 재분석 추가 (`tabs.onActivated`/`onUpdated` — changeInfo.url은 tabs 권한이 없으면 안 오므로 `status==='complete'`만 사용, URL 비교는 활성 탭 재조회). 표시 중인 분석과 같은 탭·같은 URL이면 재분석 생략, 실패 시 재시도 가능하도록 출처(analysisSource) 초기화
- **분석 시점 최적화**: ① extractor가 `pk.analyze.page` 수신 시 페이지 로드 완료까지 대기(최대 8초) — 로드 중 분석 시 lazy 이미지 미수집으로 빈약한 결과가 나오는 문제 ② navertv VOD: 플레이어 신호(`.webplayer-internal-video` 등)가 있으면 vodplay 메타 요청(로드 후 ~2초 자동 호출)을 최대 3초 대기 후 추출 — 페이지 연 직후 분석에서도 동영상 캐치
- **iframe 협업 강화**: 협업 postMessage 1차 재전송(1초)에도 미응답이면 iframe에 extractor가 없는 것(주입 이후 로드) → BG에 `pk.inject.frames` 요청으로 iframe 재주입 후 2차 재전송 (타임아웃 4.5초, extractor는 `__pkExtractorLoaded` 가드로 중복 주입 안전) — 페이지 연 직후 분석에서도 torrentsee iframe 내부 m3u8 캐치 확인
- **카운터 정합성 수정**: async 수집(navertv VOD/iframe 협업)이 `media.videos` 등에 push한 뒤 `stats`를 갱신하지 않아 동영상 4개가 0으로 표시되던 문제 — 분석 결과 반환 직전에 stats를 media 기준으로 최종 동기화 (collectFrameMedia는 iframe이 없으면 조기 종료되어 stats를 갱신하지 않음)
- **분석 시점 안정화**: readyState 완료 후에도 lazy 이미지 로드가 남아 있어 스마트스토어가 4개로 분석되던 문제 — 이미지 안정화 대기 추가 (DOM img 개수 고정 + 미로드 0이 3회 연속, 최대 12초)
- **빈 URL/특수 페이지 분석 가드**: 패널/팝업이 `onActivated` 직후 URL 미설정 탭(`url:""`)을 분석하려다 "주입 실패 respective host" 에러를 남기던 문제 — http/https가 아니면 분석·주입 시도 자체를 생략
- **WAF 403 대응 (다운로드)**: torrentsee 등이 확장 오리진 요청을 403(SERVER_FORBIDDEN)으로 차단하던 문제 — 실패 시 페이지 컨텍스트(MAIN world) fetch → Blob(objectURL) 다운로드 폴백 1회 자동 시도 (executeScript + world:MAIN)
- **썸네일 폴백**: 확장 오리진에서 403으로 안 보이던 썸네일 — 오프스크린 preload 실패분만 페이지 컨텍스트에서 120px dataURL로 축소 가져와 bg-image 교체 (`pk.thumb.fetch`, 배치 10개) — 캐시된 dataURL은 새 렌더에서 즉시 적용되도록 수정 (캐시 존재 시 교체 로직이 통째로 return하던 버그)
- **새로고침 버튼 = 강제 재분석**: `pk-reload`가 `analyze` 그대로라 같은 탭·같은 URL이면 skip(로그 없음)하던 문제 — 분석 출처 초기화 후 재분석하도록 수정
- **플로팅 버튼 → 사이드바 열기 폴백**: content script 클릭은 MV3에서 user gesture가 전달되지 않아 `sidePanel.open()`이 항상 실패(로그에만 남고 반응 없음) — 실패 시 기존 패널 탭이 있으면 활성화, 없으면 새 패널 탭 생성하도록 폴백 (`runtime.getContexts`로 패널 탭 정확 탐지 — `tabs.query({url})`는 chrome-extension:// 스킴을 매치 못 함)
- **썸네일 폴백 실패 사유 로깅**: `[THUMB] ... err={사유:개수}` 형식으로 실패 원인(HTTP 상태/CORS/타임아웃) 집계 + fetch 실패 시 0.5초 후 1회 재시도
- **썸네일 폴백 서버 차단 대응**: 사용자 로그에서 `TypeError: Failed to fetch` 확인 — 토렌트씨 WAF가 짧은 시간 내 연속 요청을 임시 차단(10개 배치 시 9/10 실패 → 시간 경과 후 회복) — 배치 10→5개, 배치 간 700ms 대기, 개별 재시도 1회(1초)로 분산
- **썸네일 중복 요청 방지**: 패널 리로드/재분석 시 `_thumbCache`가 비어 있어도 이미 dataURL로 교체된 썸네일은 재요청하지 않음 (bg-image data: 스킵)
- **썸네일 폴백 확장 오리진 2차 시도**: MAIN(페이지 컨텍스트) fetch 실패분(cross-origin CSP/CORS 차단 — 유튜브 i.ytimg.com 등)을 BG(확장 오리진) fetch로 재시도 — content script ISOLATED world fetch는 페이지 CSP를 받아 실패하므로 BG 직접 수행 (OffscreenCanvas 리사이즈 + FileReader dataURL)
- **extractor 이미지 추출 오류 수정**: ① img src가 자기 페이지 URL(유튜브 shorts: src=".../shorts/<id>")인 경우 이미지로 오추출하던 것 제외 규칙 추가 ② og:image 없고 클래스 CSS bg 썸네일만 있는 페이지(유튜브 shorts 피드 등) 대응 — 이미지 부족 시 썸네일/이미지 후보 요소(`ytd-thumbnail`, `[class*="thumb"]` 등)의 computed bg 스캔 추가
- **썸네일 fetch 실패 시 `<img>`+canvas 폴백**: WAF가 fetch(Accept: */*)는 차단하지만 `<img>` 로드(Accept: image/*)는 허용하는 사이트 대응 — MAIN world에서 fetch → img 로드(crossOrigin=anonymous) → canvas 120px dataURL 순서로 시도
- **썸네일 요청 재진입 가드**: 패널 로드/카테고리 전환/분석 표시가 겹치면 ensureThumbs가 3중 실행되어 동일 URL을 반복 요청 → WAF 연속 요청 차단 악화 — `_thumbsRunning` 락으로 중복 실행 방지 (사용자 로그에서 동일 URL 5회 반복 확인)
- **분석 안정화 확장**: `waitPageStable`이 img 개수뿐 아니라 iframe 개수 안정도 함께 확인 — iframe(동영상 협업)이 뒤늦게 추가되는 페이지에서 동영상 0건으로 분석되던 변동 방지

- **썸네일 실패 원인 확정 — 광고 차단기(ADGuard)**: 사용자 환경에서 `uploadfile/*.gif` 요청이 ADGuard에 의해 광고로 판단·차단되어 페이지 `<img>` 로드까지 실패 (fetch/`<img>`/BG 전 경로 차단) — 확장 결함이 아닌 브라우저 필터 문제로 확정, 사용자 측 광고차단 비활성화로 해결 (확장이 DNR 차단을 우회하는 것은 불가)
- **광고 차단 의심 안내 배너**: 폴백 전부 실패(`ok===0`) 시 세션당 1회 패널 상단 배너 표시 (실패 수치 포함, 문구는 광고차단/서버 거부 중립) + 부분/전체 성공 시 남아 있던 배너 자동 숨김 + 닫기(X) 버튼
- **`[hidden]` CSS 덮어쓰기 버그 수정**: `.pk-adblock-hint { display:flex }`가 `hidden` 속성보다 우선해 배너가 숨겨지지 않던 문제 — 전역 `[hidden] { display: none !important; }` 규칙 추가 (배너/팝/토스트 등 공통 안전)
- **manifest `webRequest` 권한 추가**: 유튜브 blob 재생 페이지의 실제 스트림(googlevideo.com videoplayback) 캡처 준비 (구현은 미완 — 남은 작업 참고)

- **og:video 폴백 동영상이 "본문만" 필터에서 숨겨지던 문제 해결**: blob 재생 페이지(유튜브 등)에서 og:video로 대체된 동영상(kind='og')이 inArticle=false로 분류되어 "본문만"(기본 ON)에서 제거됨 → kind='og'는 페이지 대표 동영상으로 판정해 inArticle=true 부여 (embed 플레이어와 동일하게 "본문" 태그로 표시)

- **다운로드 가능성 판정 도입 (`downloadable` 필드)**: 다운로드 기준을 명확화 — ① 실제 미디어/파일 URL만 저장 가능 (이미지 14종 · mp4/webm/mkv/mp3/m4a 등 · pdf/zip/doc 등 파일 링크) ② 매니페스트(m3u8/mpd)·embed 페이지(og:video)·iframe 플레이어·html 링크는 **저장 불가**로 판정 (저장해도 재생 불가한 파일만 받아지는 문제 해소) — extractor의 각 수집 지점에서 판정, iframe 협업 병합 항목은 옛 버전 결과 보정 포함
- **패널 UI**: 저장 불가 항목은 체크박스 비활성 + "저장 불가" 배지 표시 (선택/다운로드에서 자동 제외)
- **다운로더 방어**: `pk.dl.start` 수신 시 `downloadable === false` 항목 스킵 (패널 우회 방지)
- 실측: 토렌트씨 — 이미지 25개 전부 저장 가능 / iframe 플레이어·m3u8 3개 저장 불가 · 유튜브 og:video 저장 불가 확인

- **매니페스트 스트림 탭 통일**: m3u8/mpd는 발견 경로(성능 엔트리 playerUrls · iframe 협업 · DOM 선언)와 무관하게 **스트림 탭으로 통일** — 동영상 탭은 실제 재생 소스(mp4/embed/iframe/og)만 표시 ("스트림 vs 영상" 구분 명확화, 중복 URL 제거)
- **패널 툴바 잘림 수정**: 검색/필터가 좁은 패널에서 오른쪽으로 넘어가던 문제 — `.pk-toolbar`에 `flex-wrap: wrap` 추가 (280px 폭에서 3줄 감싸기 실측, 크기 드롭다운 표시 정상)

- **툴바 레이아웃 개선**: 검색 input만 유동 폭(`flex: 1 1 120px` + `order: 99`) — 나머지 필터(본문만/형식/크기/아이콘 숨김)는 고정 크기로 먼저 배치되고 검색이 남은 공간을 자동으로 채움 (858px에서 한 줄, 260px에서 필터 줄바꿈 시 잘림 없음 실측)

- **m3u8 스트림 세그먼트 병합 다운로드 (v0.2)**: 스트림 탭의 HLS 매니페스트를 실제 동영상(.ts)으로 저장 — 매니페스트 fetch → 세그먼트 순차 수신(1회 재시도 + 1.2초 간격 — 네트워크 서비스 크래시 대응) → Blob concat → `PageKit/{도메인}/videos/{이름}.ts` 저장
  - **저장 실행 위치**: MV3 서비스 워커는 `URL.createObjectURL` 불가 + Whale(Chrome/150 기반)은 `chrome.offscreen` 미지원 + content script은 `chrome.downloads` 불가 → **사이드 패널(확장 페이지)이 직접 fetch+조립+저장** (BG는 스트림 요청 시 "사이드 패널 사용" 안내)
  - v1 제약: AES-128 암호화(EXT-X-KEY)·LIVE(ENDLIST 없음)·DASH(mpd)는 미지원 → E-CHR-DL-1003 안내, 총 300MB 가드 → E-CHR-DL-1004
  - extractor: m3u8 `downloadable=true` (mpd는 false 유지) + **navertv VOD 버그 수정** — vodplay 응답의 m3u8이 `result.media.videos` 직접 push로 스트림 분리 로직을 우회 → `media.streams`로 이동 (네이버 스마트스토어 4건 스트림 탭 정상 표시)
  - 실측: 네이버 스마트스토어(gyeongbuk/products/11771879987) — 5세그먼트 17.08초 영상 저장 → ffprobe mpegts 확인. 토렌트씨 CDN(webmeetup.com)은 fetch/다운로드 전면 차단(미디어 재생만 허용 + 서명 만료) — 저장 불가 안내 확인
  - 오류코드 추가: E-CHR-DL-1003(암호화/LIVE/차단 사이트), E-CHR-DL-1004(수신 실패/용량 초과) — error_message_ko.json 반영

### 남은 작업 (v0.2.0+)
- T-35 진입점 5종 전수 검증 · T-36 Playwright 자동 E2E · TC-E2E-CHR-004~006, 008
- **DASH(mpd) 세그먼트 병합**: 초기화 세그먼트 + SegmentTemplate 파싱
- **유튜브 동영상 수집 (webRequest 스트림 캡처)**: blob 재생(watch/shorts) + og:video가 embed 페이지 URL뿐 → googlevideo.com videoplayback 캡처 + 패널 병합 구현 필요 (manifest webRequest 권한 추가됨). 틱톡은 currentSrc CDN URL로 수집 정상 확인됨
- 정규식 필터 CSV 내보내기, ZIP 패키징, Firefox/Safari 포팅
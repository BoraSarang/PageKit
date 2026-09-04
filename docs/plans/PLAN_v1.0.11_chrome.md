# PLAN v1.0.11 (chrome) — 깨진 링크 실측 + SERP 미리보기 (SEO Toolkit 참고)

> 작성: 2026-08-31 · 상태: 완료 · 대상 버전: v1.0.11

## 배경

두 번째 웨일 스토어 확장 **SEO Toolkit**(`aefjmobjljedkfcehobblafegffppdhc`, v3.0.4)를 분석. PageKit의 품질 진단(`quality-analyzer.js`)과 대조해 **PageKit에 부재한 2가지 기능**을 채택한다.

- **① 깨진 링크 실측**: SEO Toolkit은 content 스크립트가 모든 링크 수집 → background가 HEAD 요청으로 404 판정 → 깨진 링크만 페이지에 클래스 하이라이트. PageKit은 `quality-analyzer.js:551` 주석("백그라운드에서 HEAD 요청으로 수행 — 여기서는 생략")만 있고 실측 없음.
- **② SERP 미리보기**: SEO Toolkit은 Google 스타일 결과(URL→파란 제목→회색 설명)를 **desktop/mobile 전환**으로 그리며 title/description 길이 게이지(초과=빨강, 절반 미달=노랑, 정상=초록) 표시. PageKit은 텍스트 리포트만 존재.

## 제약 (사용자 확정 ×4)

1. **브로큰 링크 범위 = 내부 링크만** (사용자 선택)
   - background fetch로 외부 사이트 HEAD 요청 폭주·속도 저하 방지. 내부(동일 오리진)만 실측.
   - 동시성 5, 타임아웃 10s/링크. 실패·응답없음=broken으로 간주하지 않고 noindex·4xx/5xx만 broken.
2. **SERP 미리보기 위치 = 사이드패널 전용 위젯** (사용자 선택)
   - sidepanel 품질 탭에 SEO 카드 영역과 별도 SERP 미리보기 카드로 표시. desktop/mobile 전환 + 길이 게이지.
3. **추가 permission 없음**: 브로큰 링크 실측은 기존 `<all_urls>` host_permissions의 background `fetch` 사용. `webRequest`/DNR 불필요.
4. **버전 v1.0.11**: v1.0.10 커밋 완료(`44321e9`). 패치만 증가, 동시 갱신(README/PERMISSIONS/CHANGELOG).

## 요구

### ① 깨진 링크 실측 (내부 링크만, background HEAD)

- content(`analyzeLinkSEO`)에서 수집한 **내부 링크 목록**을 분석 결과에 포함 (이미 `links` 배열에 전체 보유 → 내부 필터).
- background가 각 내부 링크에 `fetch(url, { method: 'HEAD', redirect: 'follow' })` 수행.
  - HEAD 미지원/차단 시 GET 폴백 1회 (`redirect: 'follow'` 유지).
  - 상태 `>= 400` 또는 `!ok` → broken 판정. 네트워크 오류(요청 폭주·abort)는 broken에서 제외.
  - 동시성 셈러퍼 5(`shared` 유틸 또는 inline), 링크당 타임아웃 10s.
- 판정 결과는 `linkSEO` 모듈 결과에 `brokenLinks: [{ url, status, text }]` 추가.
- **하이라이트**: 분석 완료 후 사용자 요청이 있으면 해당 탭에 깨진 링크만 `pk-broken-link` 클래스 + outline 표시. 페이지 DOM 변경은 **요청 시점에만**(분석 자동 실행 시 자동 하이라이트하지 않음) — 페이지 침습 최소화 기존 원칙 유지.
- 이슈 생성: broken 링크는 `linkSEO` 모듈에 `SEVERITY.MAJOR` 이슈로 추가(개수 제한 — 최대 N건 리포트, 무한 이슈 방지).

> 페이지 컨텍스트 fetch는 CORS 제약으로 판정 불확실(불발) → **반드시 background fetch로 위임**. `<all_urls>` host permission으로 가능.

### ② SERP 미리보기 (사이드패널 위젯)

- sidepanel `quality-tab.js`에 SEO 카드 아래 **SERP 미리보기 카드** 추가.
- 데이터: `result.modules.seoMeta` 결과에서 title/description/url/(length) 재사용 — **백엔드 변경 불필요**, 렌더링만 추가.
- UI:
  - desktop/mobile 토글(접힘 60자/평균 110px URL 표시 등 Google 스타일).
  - 파란 제목(#1a0dab), 회색 URL(#4d5156), 설명(#4d5156) — Chrome 기본 구글 색.
  - title(30–60)/description(120–160) 길이 게이지 + 초과/절반미달/정상 색상.
- `quality-tab.css`에 클래스 추가. `DebugLogger.feature('QUALITY', 'SERP 미리보기 렌더')`.

## 구현 항목

| T | 작업 | 파일 | 상태 |
|---|------|------|------|
| T-207 | 브로큰 링크 실측 — content 내부 링크 수집 + background `pk.quality.checkLinks` HEAD 판정(동시성5/timeout10s) | `content/quality-analyzer.js`, `background/quality-handler.js` | |
| T-208 | broken 링크 이슈(SEVERITY.MAJOR·개수 제한) + 요청 시 페이지 하이라이트(`pk-broken-link`) | `content/quality-analyzer.js` | |
| T-209 | SERP 미리보기 사이드패널 위젯(desktop/mobile 토글 + 길이 게이지) + CSS | `sidepanel/quality-tab.js`, `sidepanel/quality-tab.css` | |
| T-210 | ①② 단위검증 + strict-check + E2E smoke + 문서 동기화(1.0.11) | — | |

## 롤백 계획

- 브로큰 링크: background fetch 실패 시 해당 링크만 스킵하고 분석 계속 — 판정 실패 × 크래시 없음. option off 시 완전 비활성(`brokenLinkCheck`).
- SERP 위젯: 순수 렌더링(백엔드 무변경) → 제거/수정 용이.

## 검증 표준

- `node --experimental-vm-modules scripts/strict-check.cjs extension`
- 단위: 내부/외부 링크 분류, HEAD→GET 폴백, broken 상태 판정, 이슈 개수 제한
- E2E smoke: `node e2e/run-smoke.cjs`
- 매니페스트/문서: v1.0.11 동기화 (README/PERMISSIONS/CHANGELOG)

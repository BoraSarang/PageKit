# PageKit — E2E 시나리오 정의서 (AGENTS.md 7.7장, v0.1 chrome)

## 개요

- 플랫폼: Chrome MV3 확장 (PageKit)
- 실행: `./build_and_run.sh e2e chrome` → Chrome에서 수동 시나리오 수행
- 자동화: v0.2에서 Playwright 도입 예정 (`--load-extension` 프로필)

## 시나리오

| TC | 시나리오 | 통과 기준 | 상태 |
|----|----------|-----------|------|
| TC-E2E-CHR-001 | 진입점 5종(아이콘 팝업/컨텍스트 메뉴/단축키 Ctrl+Shift+K/팝업 버튼/플로팅 버튼)으로 사이드 패널 열림 | 패널에 분석 결과 표시 | ⬜ (팝업/플로팅/단축키 부분 검증) |
| TC-E2E-CHR-002 | 분석 실행 → 이미지/비디오/링크/본문 분류 정확도 | stats와 아이템 수 일치 | ✅ |
| TC-E2E-CHR-003 | 이미지 선택 → 배치 다운로드 (성공/실패 재시도 포함) | downloads 폴더에 파일 + 배지 갱신 | ✅ |
| TC-E2E-CHR-004 | 정규식 필터(.pdf/.zip) + CSV 내보내기 | 필터 결과/파일 다운로드 확인 | ⬜ |
| TC-E2E-CHR-005 | 본문 하이라이트 ON/OFF + 드래그 보정 | 아웃라인 표시/해제 | ⬜ |
| TC-E2E-CHR-006 | 우클릭/복사 제한 사이트에서 해제 + 화이트리스트 추가 | 복사/우클릭 동작 | ⬜ |
| TC-E2E-CHR-007 | DebugPanel: Cmd+Shift+D → 디버그 창 → 로그 누적/필터/복사/지우기 | debugLog에 FEATURE/PERF 로그 확인 | ✅ |
| TC-E2E-CHR-008 | 옵션 저장 → 재로드 후 유지 | 설정 유지 확인 | ⬜ |

## 디버그 로그 검증

- 확장 popup/패널 사용 시 `debug-view` 창에 `[FEATURE]` 로그 표시 확인
- `[ERROR] E-CHR-*` 로그는 에러 재현 시 1건 이상 기록
- `[PERF]` 로그: 분석 소요시간 기록 (예산 200ms)

## 수동 실행 기록 (2026-08-14, Whale CDP 자동 검증)

- **분석(TC-E2E-CHR-002)**: e2e-test.html(로컬 HTTP 8899) 분석 — 본문 추출 성공(title/excerpt/bodyTextLen), 이미지 2건(본문1+광고1, inArticle 분류 정확), 비디오 1, 오디오 1, 링크 5(.pdf/.zip 타입 분류 확인)
- **다운로드(TC-E2E-CHR-003)**: `pk.dl.start` → `PageKit/{domain}/{category}/{filename}` 저장 확인 (filename 옵션/카테고리 폴더/이중 확장자 방지 수정 반영), `pk.dl.state` 응답 OK
- **DebugPanel(TC-E2E-CHR-007)**: debug-view 창 열기 → 2초 폴링으로 debugLog 표시(`[INFO] [DL] 완료`), 레벨 필터(WARN 0건), 지우기(카운트 0) 확인
- **발견/수정 버그**:
  1. 팝업 분석 전 콘텐츠 스크립트 미주입 → `MSG.ENSURE_INJECTED` 추가
  2. downloader filename 무시 → `item.filename` 우선 사용
  3. 이중 확장자(.png.png) → 확장자 중복 방지
  4. `pk.dl.state` 핸들러 누락 → 추가
  5. debugEnabled 캐시 미갱신 → `chrome.storage.onChanged` 리스너 추가
- **제약**: 정식 Chrome은 `--load-extension` 미지원 → Whale로 검증. Whale 다운로드 확인 프롬프트는 설정에서 해제 필요
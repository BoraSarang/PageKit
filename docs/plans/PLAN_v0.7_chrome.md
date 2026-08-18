# PLAN v0.7 (chrome) — 스트림 병렬 다운로드 (독립 창)

> 작성: 2026-08-19 · 상태: 진행 중 · 이전: PLAN_v0.6_landing.md

## 개요

- **문제**: 스트림(m3u8/mpd) 다운로드 중 두 번째 다운로드를 시작하면
  - SW가 살아있는 동안: `streamBusy=true` → **대기열에 조용히 추가**되어 창이 열리지 않음 (토스트만 "창을 엽니다" 표시 → 사용자 혼란)
  - SW가 잠들었다 깨어난 후: 상태 초기화 → 새 창이 열려 병렬 (동작이 상황에 따라 달라짐)
- **목표**: **항상 독립된 새 창**을 열어 병렬 다운로드 (대기열 제거)

## 결정 사항

1. `streamQueue` / `streamBusy` / `streamWinId` 대기열 로직 **전체 제거**
2. `openStreamWindow()` → 기존 창 URL 덮어쓰기 제거, **항상 `chrome.windows.create`**
3. `DOWNLOAD_STREAM` → 무조건 새 창 시작
4. `STREAM_DONE` → 대기열 다음 작업 분기 제거, **항상 완료 알림**
5. 각 창은 완료 후 10초 자동 닫힘(다운로더 측 `window.close()`) 유지 — 자연스러운 병렬
6. 배지: 마지막으로 진행률을 보낸 창 기준 표시 (기존 유지 — 창 내부에 각자 진행률 표시)

## 구현 단계

| T | 작업 | 상태 |
|---|------|------|
| T-70 | PLAN + TODO 등록 | ✅ |
| T-71 | service-worker.js — 대기열 제거 + 항상 새 창 | ✅ |
| T-72 | node --check + Chrome CDP 병렬 실측 (스트림 2건 → 창 2개) | ✅ |
| T-73 | CHANGELOG + TODO 진행 이력 + 세션 로그 | ⏳ |

## 검증 결과

- TC-01 ✅: 스트림 2건 연속 요청 → **독립 팝업 창 2개** 동시 다운로드 (tears-of-steel 2/184 · Big Buck Bunny 1/64 세그먼트, Chrome CDP 실측)
- TC-02 ✅: 각 창 취소 → 3초 후 자동 닫힘 (기존 다운로더 동작 유지)
- TC-03 ✅: `rg streamQueue` 잔여 참조 0건

## 수정 파일

- `extension/background/service-worker.js` (1개)

## 테스트 계획

- TC-01: 스트림 2건 연속 다운로드 → **독립 창 2개** 동시 진행 확인 (Chrome CDP)
- TC-02: 기존 창 다운로드 완료 → 10초 자동 닫힘 + 완료 알림 (기존 동작 회귀 확인)
- TC-03: 대기열 관련 코드 잔여 없음 (`rg streamQueue` 0건)

## 롤백 계획

- `git revert` — service-worker.js 단일 파일 변경이라 revert 1건

## 에러코드

- 변경 없음 (E-CHR-DL-1001~1006 기존 유지)
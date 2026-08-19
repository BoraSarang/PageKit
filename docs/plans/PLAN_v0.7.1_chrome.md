# PLAN v0.7.1 (chrome) — ENDLIST VOD 세그먼트 수 가드 오판 수정

> 작성: 2026-08-19 · 상태: 완료 · 소규모 버그픽스 (1줄)

## 문제

- 실사용 로그: `t27.cdn2020.com/video/m3u8/2026/08/18/7a64a8f2/index.m3u8` 다운로드 시
  `E-CHR-DL-1003: 세그먼트가 너무 많아 LIVE 스트림으로 판단됩니다.` 즉시 실패
- 원인: `downloader.js:285`의 `segs.length > MAX_SEGMENTS(200)` 가드가 **ENDLIST 유무를 확인하지 않아**
  ENDLIST가 있는 정상 VOD(242개 = 약 40분)도 LIVE로 오판 차단
- 매니페스트 직접 확인: HTTP 200, `#EXT-X-ENDLIST` 있음, 세그먼트 242개 — **VOD 확정**

## 수정

- `downloader.js:285` → `if (!m.endlist && m.segs.length > MAX_SEGMENTS) throw ...`
  - ENDLIST 있는 VOD는 세그먼트 수 무관 저장 (LIVE 가드는 286행의 ENDLIST 부재 + 재요청 증가 비교가 담당)

## 검증

- 단위: `parseM3U8` 242개 + ENDLIST → 통과 (수정 전: 차단)
- Chrome CDP 실측: 확장 페이지에서 `pk.stream.open` 호출 → 다운로더 창 열림 → **"세그먼트 수신 중 5/242 · 2%"** 진행 확인 → 취소

## 롤백

- `git revert` — 1줄 변경
# PLAN v1.0.10 (chrome) — 모바일 UA 폴백 적용 + 저장·파일명 견고화

> 작성: 2026-08-31 · 상태: 완료 · 대상 버전: v1.0.10

## 배경

타사 확장 Aura Media Downloader(웨일 스토어)를 분석해 참고 기능 4개를 채택. 1단계(① 병렬 Range + 체크포인트 재개, ② CDN Referer 재생)는 v1.0.9로 커밋 완료. 본 PLAN은 2단계인 **③ 모바일 UA 스푸핑**과 **④ 저장·파일명·스케줄러 견고성**을 다룬다.

## 제약 (사용자 확정 ×2)

1. **③ 적용 범위 = 페이지 컨텍스트 fetch 폴백에만 DNR 적용** (사용자 선택)
   - Chrome 확장의 background `fetch`는 `User-Agent` 헤더 override 불가(제한 헤더). DNR `modifyHeaders`는 웹 요청에서 UA set 가능.
   - PageKit 다운로드는 기본 경로가 확장 fetch이므로 UA 스푸핑은 **페이지 컨텍스트 fetch 폴백**(`pageFetchChunk`) 경로에서만 실질 적용.
   - 현재 페이지 컨텍스트 fetch를 쓰는 경로는 유튜브 googlevideo(`downloadDirect` viaPage) + 서명 CDN 폴백. 유튜브는 "지원 안 함" 정책이므로 실질 대상은 서명 CDN(틱톡 등) 폴백.
2. **버전 v1.0.10**: 1단계 v1.0.9 커밋 완료(`5b95135`). 마이너(1.1.0)는 사용자 명시 시에만.

## 요구

### ③ 모바일 UA 스푸핑 (페이지 컨텍스트 폴백 전용)

- 페이지 컨텍스트 fetch 폴백 경로에서, 해당 탭(`tid`)의 미디어/XHR 요청에 **모바일 UA**를 DNR `modifyHeaders`로 세트.
- 옵션(`options/options.js` + `storage.js`): "폴백 시 모바일 UA"
  - `off`(기본) / `mobile`(모바일 UA 값, 사전 정의 + 사용자 커스텀)
- 규칙: ruleId 고정 구간(예: 3_000_000_000~), `condition.tabIds=[tid]`, `resourceTypes: ['media','xmlhttprequest']`, priority 높게.
- 등록/해제 시점: 폴백 진입 시 등록, 다운로드 종료/창 닫힘 시 해제.

### ④ 저장·파일명·스케줄러 견고성

- **파일명 sanitize 강화** (Aura `sanitizeFilename` 기준 반영):
  - 현재 `defaultName()`/`saveBlob`은 `\\/:*?"<>|`만 치환 + 80자 제한.
  - 추가: Windows 예약어(`con|prn|aux|nul|com[1-9]|lpt[1-9]`), trailing `.`/공백 제거, control 문자(`\u0000-\u001f\u007f`), 예약어면 `_` 접두.
- **저장 견고성**: `saveBlob`의 파일명 정리 로직을 공용 sanitize 유틸로 통합(`extension/shared/filename-sanitize.js`). `conflictAction:'uniquify'` 유지.
- **스케줄러(동시성)**: 배치 다운로드의 기존 `concurrentDownloads` 셈러퍼는 유지. 이번 범위에서는 **일시정지(suspend) lease·큐 상태 로깅 견고성**만 (UI 일시정지 버튼은 별도 스코프로 분리).

> `Docs 계획 참고`: Aura `mobile-user-agent.js`(DNR UA 규칙 빌드/해제), `filename-template.js`(sanitizeFilename), `download-scheduler.js`(셈러퍼) 참조. PageKit은 직접 복사하지 않고 필요 로직만 반영.

## 구현 항목

| T | 작업 | 파일 | 상태 |
|---|------|------|------|
| T-201 | 공용 파일명 sanitize 유틸 신규 (`sanitizeFilename` — 예약어/트레일링/제어문자/길이) | `shared/filename-sanitize.js` (신규) | |
| T-202 | saveBlob/defaultName/downloadViaDownloads에 sanitize 적용 | `downloader/downloader.js` | |
| T-203 | 배치 다운로드 파일명에도 sanitize 적용 (폴더/파일명 경로 정리) | `background/downloader.js` | |
| T-204 | 모바일 UA 옵션 설정 + storage 키 | `storage.js`, `options.js/html` | |
| T-205 | 페이지 폴백 시 DNR 모바일 UA 규칙 등록/해제 | `background`(service-worker or downloader) | |
| T-206 | ③④ 단위검증 + E2E smoke + strict-check | — | |

## 롤백 계획

- sanitize: 기존 파일명과의 차이는 예약어/트레일링 처리뿐 → 문제 시 해당 부분만 되돌림.
- 모바일 UA DNR: 옵션 off 기본값 → 영향 없음. 등록 실패 시 로그만 남기고 다운로드 계속.

## 검증 표준

- `node --experimental-vm-modules scripts/strict-check.cjs extension`
- 단위: `shared/filename-sanitize.js` 경계 케이스(예약어·트레일링·control·길이·한글)
- E2E smoke: `node e2e/run-smoke.cjs`
- 매니페스트/문서: v1.0.10 동기화 (README/PERMISSIONS/CHANGELOG)

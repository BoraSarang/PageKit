# PLAN_v0.3_chrome — 유튜브 스트림 캡처 (webRequest) + mp4 직접 다운로드

## 개요
- 유튜브 watch/shorts는 `blob:` 재생이라 extractor 성능 엔트리(m3u8/mpd 확장자 매칭)로 실제 스트림 추출 불가 — og:video도 embed URL뿐
- `webRequest.onBeforeRequest`로 googlevideo.com `media` 요청을 캡처 → 패널 스트림 탭에 병합 → 기존 스트림 다운로더 창(동일 형식)으로 저장
- bd: WPageTools-9am

## 결정 사항 (사용자 확정 2026-08-14)
1. **캡처 대상 = googlevideo.com 전용 (유튜브)** — v1은 유튜브만. 일반 CDN 확장은 v1.1 후보 (docs/DESIGN.md + PLAN 확장 지점 기록)
2. **옵션 연계**: 기존 `streamDetect` 토글 ON일 때만 리스너 등록 (DNR m3u8 규칙과 동일 스위치)
3. **재생 유도 없음**: 캡처가 없으면 스트림 탭에 안내 문구 "동영상을 재생하면 자동 캡처됩니다" 표시 (shorts는 스크롤 시 자동 재생으로 자연 캡처)
4. **다운로드 = 기존 스트림 다운로더와 동일 창/형식**: 진행률·속도·파일명=페이지 제목·저장 경로·10초 자동 닫기 동일. 파이프라인만 mp4 단일 URL 분기 추가
5. **itag 파싱**: 캡처 URL에서 itag 추출 → 화질 라벨(해상도) + progressive(오디오 포함: 18/22/37) vs video-only(영상 전용: 133~303) 판별 — v1은 캡처된 화질 중에서만 선택 (부분 지원), 오디오 muxing은 v1.1 후보
6. **range 필터**: `range` 없음 또는 `range=0-`(시작~전체)인 URL만 캡처 — 부분 세그먼트(range=0-0 등)는 무시 (다운로드 불가)
7. **서명 만료**: 캡처 URL은 수시간 유효 — 다운로드 실패(403/만료) 시 E-CHR-DL-1005 안내
8. **storage.session 유지**: 최대 5개 (itag별 대표, 첫 요청 우선 보존, capturedAt 기록) — SW 재시작에도 유지, 브라우저 재시작 시 소실

## 아키텍처
```
googlevideo media 요청 → BG youtube-capture.js (onBeforeRequest)
  → {url, itag, capturedAt, range} storage.session 'ytCaptured' (max 5, itag별 dedup)
패널 분석 결과 수신 → panel.js가 MSG.GET_CAPTURED_STREAMS → BG 조회
  → streams에 push: name=페이지 제목, source='youtube-capture', format=progressive|video-only, itag
다운로더: m3u8이 아니면 → 단일 fetch(전체) → Blob → {제목}.mp4 저장 (기존 창 UI 재사용)
```

## 구현 단계
- [x] T-1: `extension/background/stream-detector.js` (youtube-capture 통합) — 리스너 등록/해제(streamDetect 연계), itag 파싱, range 필터, storage.session 관리. service-worker.js에 init 연결
- [x] T-2: messages.js `GET_CAPTURED_STREAMS` + BG 핸들러 + panel.js 병합(분석 결과 수신 후 조회 → 스트림 탭 렌더) + 안내 문구
- [x] T-3: downloader.js — m3u8 판정 실패 시 단일 fetch 분기 (진행률 = 수신 바이트, 기존 UI), E-CHR-DL-1005
- [x] T-4: itag 라벨 맵 (해상도/fps/오디오) — shared 상수
- [x] T-5: 확장 지점 문서 (DESIGN.md — v1.1 후보: 일반 CDN 확장·itag 전체 지원·오디오 muxing·DASH 세그먼트 조립)
- [x] T-6: Whale 실측 E2E — watch 로드(재생 없음) 안내 문구 / 재생 후 항목 / 다운로더 창 / UMP 케이스

## v0.3 최종 실측 결과 (2026-08-14)
- **유튜브는 무로그인 재생이 전부 UMP/SABR 전환**: 캡처된 googlevideo URL이 `application/vnd.yt-ump`(sabr.malformed_config, 31B 본문) — 실제 mp4 저장 불가로 확정
- **UMP 감지 구현**: fetch 후 Content-Type에 `yt-ump|sabr`가 있으면 즉시 중단 + E-CHR-DL-1006 안내 (fetch 200 + 31B가 몇 초 내 도달하므로 빠르게 안내됨 — 실측 15초 내)
- **다운로더 버그 수정 (이 세션에서 발견)**:
  1. `downloadDirect` 내 `const tErr` 중복 선언 → module SyntaxError → 다운로더 JS 전체 미실행 ("구버전 JS"로 오인된 근본 원인)
  2. `runDownload`의 `return downloadDirect()` await 누락 → E-CHR-DL-1006 throw가 unhandled rejection으로 나가 UI에 미표시 + "수신 중" 무한 유지 — `return await`로 수정
- **웨일 확장 페이지 JS 캐시는 경로 기반**: html 수정은 즉시 반영되나 js는 파일명 변경만 우회됨 (`?v=` 쿼리 무시) → 다운로더를 `extension/downloader2/`로 이전 (이름 자체가 버전 역할, script src에 `?v=1` 유지)
- **웨일 AbortController 제약**: 확장 페이지에서 in-flight fetch/read를 abort하지 못함 (실측 — 취소 클릭 무응답) → 타임아웃/취소를 Promise.race 기반으로 재작성 (연결 25초, read idle 15초 — 0바이트 chunk는 타이머 리셋 안 함, 취소는 `globalThis.__dlCancelCurrent`)

## 테스트 계획
- TC-1: watch 로드만 → 스트림 탭 "재생하면 캡처" 안내 (캡처 0건)
- TC-2: watch 재생(음소거) → 캡처 1건 이상 → 스트림 탭 표시 (이름=제목, 화질 라벨)
- TC-3: 다운로드 → {제목}.mp4 저장 (서명 유효 구간, ffprobe 확인)
- TC-4: shorts 자동 재생 → 캡처 확인
- TC-5: streamDetect OFF → 리스너 미등록 (캡처 0건)
- TC-6: itag dedup — 같은 itag 재요청 시 첫 URL 유지

## 에러코드
- E-CHR-DL-1005: 유튜브 서명 URL 만료/부분 범위 — "캡처된 주소가 만료되었거나 부분 요청입니다. 동영상을 다시 재생한 뒤 다운로드해 주세요." (error_message_ko.json)
- E-CHR-DL-1006: UMP/SABR 전용 스트림 — "이 영상은 유튜브의 새 스트리밍 방식(UMP/SABR)으로만 제공되어 저장할 수 없습니다. 저장 가능한 영상은 일반 HTTP 스트림을 제공하는 영상입니다." (error_message_ko.json)

## 확장 지점 (v1.1+ 후보 — 사용자 요청으로 문서 유지)
1. **일반 CDN 일반화**: host 목록화 (googlevideo.com 외 vimeo/네이버 CDN)
2. **itag 전체 지원**: 재생 전 모든 화질 캡처 (매니페스트 기반 목록화 — youtubei API 접근 불가 시 힘들 수 있음)
3. **오디오 muxing**: video-only + audio itag(140/141) 병합 → WebM/MKV 컨테이너 (mp4 muxer는 라이브러리 필요)
4. **DASH 세그먼트 조립**: m4s 세그먼트 단위 캡처/조립 (서명 만료 극복 — 실시간 수신)
5. **UMP/SABR 대응**: 유튜브가 무로그인 재생 전면 전환 (2026-08 실측) — UMP 프로토콜(sabr.malformed_config) 파싱으로 세션 재구성 가능성 연구 필요 — 최소한 감지(E-CHR-DL-1006)는 완료

## 롤백 계획
- git revert — GET_CAPTURED_STREAMS 분기 제거 시 기존 m3u8 경로로 복귀 (youtube-capture.js 삭제)

## 성능 예산
- 리스너 비용: media 요청마다 URL 문자열 검사 + session write (마이크로초급) — streamDetect OFF 시 미등록
- 캡처 용량: URL 최대 수KB × 5 = 10KB 미만 (storage.session 10MB 내)
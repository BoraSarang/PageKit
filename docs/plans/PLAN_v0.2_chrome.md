# PLAN_v0.2_chrome — m3u8 스트림 세그먼트 병합 다운로드 (작업 창 v2)

## 개요
- 스트림 탭의 HLS 매니페스트(m3u8)를 실제 동영상 파일(.ts)로 저장
- v2 구조: BG가 독립 팝업 창(downloader.html)을 열어 fetch+병합+저장 — 페이지 클릭/패널 닫힘과 무관하게 지속
- 목표: 토렌트씨(rubyvidhub embed), 네이버 스마트스토어 등 m3u8 스트리밍 영상 저장

## 결정 사항
1. **실행 위치 = 독립 작업 창(확장 페이지)**: MV3 SW는 `URL.createObjectURL` 불가 + Whale(Chrome/150) `chrome.offscreen` 미지원 + content script은 `chrome.downloads` 불가 → 확장 페이지만 fetch+Blob+downloads 가능. 패널/팝업 어디서든 `MSG.DOWNLOAD_STREAM`으로 BG에 위임
2. **범위**: 비암호화(EXT-X-KEY 없음) + VOD m3u8만 — LIVE/암호화는 E-CHR-DL-1003 안내, DASH(mpd)는 보류
3. **출력**: 세그먼트 바이너리 concat → `.ts` (재인코딩 없음), `PageKit/{도메인}/videos/{파일명}.ts`, conflictAction uniquify
4. **파일명 기본값 = 페이지 제목** (`t=` 파라미터, 특수문자 필터+80자) — 진행 중 변경 가능, 확장자 생략 시 .ts
5. **화질 선택**: 마스터면 변형 드롭다운(해상도·fps·kbps), 기본=최고 화질 자동 시작, 시작 전에만 변경
6. **LIVE 판정 3중**: ENDLIST 없음 + PLAYLIST-TYPE != VOD → 2회 fetch 세그먼트 수 비교 (토렌트씨 마스터는 ENDLIST 없지만 VOD — 오판 사례 해결)
7. **순차 대기열**: 다중 선택 시 BG 큐 보관 → 완료 후 다음 자동 시작, 마지막에만 알림+자동 닫기
8. **용량 가드**: 총 300MB / 세그먼트 50MB / 세그먼트 200개
9. **세그먼트 수신**: 순차 fetch + 1.2초 간격 + 재시도 1회 (웨일 네트워크 서비스 크래시 대응 — 병렬 금지)

## 아키텍처
- **BG(service-worker.js)**: `openStreamWindow(job)` — referer DNR 규칙 → 팝업 창(520×400) 생성/재사용(탭 URL 교체) → 배지 % → `STREAM_DONE` 시 큐 다음 시작 or 알림 → 다운로더가 10초 후 직접 `window.close()` (SW 타이머 유실 방지)
- **downloader.js**: `prepareQuality`(마스터 변형 드롭다운) → `resolveManifest`(마스터 재귀 해석 깊이 2) → 순차 fetch → 속도 이동 평균(최근 3개) → Blob 저장 → 완료 화면(경로 + "파일 위치 열기" chrome.downloads.show)
- **shared/m3u8.js**: `parseM3U8` → {segs, variants(bandwidth/resolution/frameRate), hasKey, endlist, playlistType, isMaster} + fetchStreamText/Binary(15s 타임아웃)
- **panel.js**: 스트림 다운로드 → BG 위임, **화질 변형 통합**(마스터 fetch 병렬 판별 → 변형 숨김 + "화질 N개 통합" 표시), "본문만" 필터는 스트림에 미적용
- **extractor.js**: `streamName(url)` 이름 부여 (성능 엔트리/DOM/iframe 협업 4개 지점)

## 구현 단계 — 완료 (2026-08-14)
- [x] T-1: shared/m3u8.js 파서(RESOLUTION/FRAME-RATE 포함) + fetch 타임아웃 — node 단위 테스트 통과
- [x] T-2: downloader 창 (html/css/js) — 해상도 선택/속도/파일명 중간 변경/경로 표시/열기/취소/재시도
- [x] T-3: BG — 작업 창 관리/배지/알림/큐/창 크기 520×400
- [x] T-4: panel — 스트림 위임 + 변형 통합(병렬 6s 타임아웃, 비동기 렌더) + 본문만 예외
- [x] T-5: manifest — notifications 권한
- [x] T-6: 10초 자동 닫기 — SW setTimeout 유실 발견 → 다운로더 직접 window.close()로 견고화
- [x] T-7: E-CHR-DL-1003/1004 — error_message_ko.json 반영

## 테스트 계획 — 결과
- [x] TC-1: 스마트스토어 11771879987 — 파일명=페이지 제목(완숙토마토…경북유통.ts) ✓ 속도 1.0MB/s ✓ 진행 중 파일명 변경 ✓ 완료+경로+열기 ✓ 10초 자동 닫기 ✓ ffprobe mpegts 17.08s
- [x] TC-2: 순차 큐 — 스트림 2건 → 첫 완료 후 두 번째 자동 시작 → (1).ts 1.2MB + (2).ts 1.9MB → 자동 닫힘 ✓
- [x] TC-3: 토렌트씨 마스터 — 변형 드롭다운 3개(856x480 60fps 652kbps / 854x480 29.97fps 522kbps / 640x360 60fps 404kbps) ✓ 최고 화질 자동 선택 ✓ 97세그먼트 962s 80.1MB 저장 ✓
- [x] TC-4: 화질 변형 통합 — 토렌트씨 4건 → 마스터 1건 + 변형 3건 숨김 (통합 로그 확인) / 마스터 없는 스마트스토어 4건은 그대로 표시 ✓
- [x] TC-5: ENDLIST 없는 VOD(토렌트씨 마스터) → LIVE 오판 없음 ✓

## 알려진 제약 (실측)
- Whale 네트워크/디버그 서비스 크래시: 네이버 CDN 병렬 fetch·토렌트씨 페이지 처리 중 devtools 500 반복 — 테스트 환경 특성 (순차+1.2초 간격으로 완화, 재시작 패턴)
- SW 코드 갱신 시 `.whale-profile/Default/Service Worker` 캐시 삭제 + 재시작 필요 (확장 리로드만으론 미반영)
- 토렌트씨 webmeetup.com CDN은 전면 차단 (streamruby.net은 허용)

## 롤백 계획
- git revert — DOWNLOAD_STREAM 경로 제거 시 기존 chrome.downloads 배치 경로로 복귀 (변경 격리)

## 성능 예산
- 세그먼트 fetch: 순차 1개 + 1.2초 간격 (병렬 금지 — 크래시 원인)
- 총 300MB / 세그먼트 50MB / 200개 가드, 요청 타임아웃 15초
- 변형 통합: 병렬 fetch + 6초 타임아웃, 렌더 블로킹 없음 (비동기 갱신)
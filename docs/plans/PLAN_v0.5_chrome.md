# PLAN_v0.5_chrome — HTTP 미디어 탐색 + UMP 연구 + DASH 병합 + ZIP/CSV

## 개요
- P1-1: **HTTP 미디어 제공 영상 탐색** — 유튜브 무로그인은 UMP 전면 전환으로 mp4 실저장 검증 불가 → 일반 HTTP(mp4)를 직접 서빙하는 사이트를 찾아 다운로더 실저장 검증 (bd 신규 등록)
- P1-2: **UMP/SABR 프로토콜 파싱 연구** — 유튜브 새 스트리밍 방식(sabr.malformed_config) 세션 재구성 가능성 연구. 결과는 문서화만 (구현은 가능성 있을 때)
- P2-1: **DASH(mpd) 세그먼트 병합** — MPD XML 파싱 + SegmentTemplate/초기화 세그먼트 → m4s 조립 (v0.2 보류 항목)
- P2-2: **ZIP 패키징 + 정규식 CSV 내보내기** — 배치 다운로드 ZIP + 링크 검색 CSV 내보내기 (PRD F3/F4)

## 결정 사항
1. **P1-1**: 탐색 대상 = 한국 서비스 우선 (네이버/다음/티빙 등), mp4 직접 링크 제공 사이트에서 실측. UMP 외에 HTTP 미디어로 영상 제공하는 유튜브 케이스(일부 채널/구버전)도 확인
2. **P1-2**: UMP 파싱은 연구 단계 — 구현은 v1.1+ 후보. 연구 결과는 docs/plans/PLAN_v0.5_chrome.md 부록 + bd note로 유지
3. **P2-1**: mpd 지원 범위 — SegmentTemplate + SegmentList + SegmentBase(on-demand) VOD, 초기화 세그먼트(m4s) 병합, on-demand는 단일 파일 전체 저장, 300MB 가드, LIVE/다중 기간 미지원(E-CHR-DL-1003 재사용)
4. **P2-2**: ZIP은 JSZip 의존성 추가 없이 BG 순차 다운로드 후 자체 Store ZIP(shared/zip.js) — **SW는 URL.createObjectURL 미지원이므로 base64 data URL로 저장** (Whale offscreen 미지원 동일 제약), 용량 가드 100MB. CSV는 패널 링크 탭에 [CSV 내보내기] 버튼 (검색 필터 적용 결과)

## 구현 단계
- [x] T-50: PLAN/TODO/DESIGN 문서 갱신
- [ ] T-51: P1-1 HTTP 미디어 사이트 탐색 + 실측 (검증 기록)
- [x] T-52: P1-2 UMP/SABR 연구 (문서화) + 유튜브 player API(innertube ANDROID_SDKLESS) m3u8 확보 — 웨일 실측 통과
- [x] T-53: P2-1 DASH(mpd) 파싱/병합 — shared/m3u8.js 확장 + downloader 분기
- [x] T-54: P2-2 ZIP 패키징 (BG)
- [x] T-55: P2-2 CSV 내보내기 (패널)
- [x] T-56: 통합 검증 (Chrome CDP)

## 테스트 계획
- TC-1: mp4 직접 링크 사이트 → 다운로더 실저장 (ffprobe/파일 크기 확인) — 미실시 (T-51 후속)
- TC-2: mpd 샘플 → 세그먼트 병합 저장 — **완료**: Bitmovin art-of-motion (Cloudflare UA 우회로 mpd 확보, segs=53, segment_0~52, init.mp4, 1080p 선택) + 웨일 실측 성공
- TC-3: 이미지 N개 ZIP → 1개 zip 저장 — **완료**: picsum 3건 76KB, unzip -t 무결성 통과 (Chrome CDP + 웨일)
- TC-4: 링크 검색 결과 CSV → 파일 저장 + 내용 확인 — **완료**: picsum 링크 탭 5건, BOM/컬럼 정상

## 에러코드
- 신규 없음 (기존 E-CHR-DL-1003/1004 재사용)

## 부록: UMP/SABR 연구 결과 (T-52, 2026-08-15)

### 배경
- 2025-02 유튜브가 **web 클라이언트에서 adaptiveFormats를 제거**하고 SABR 스트리밍 URL만 제공 (yt-dlp #12482 확인)
- PageKit이 webRequest로 캡처하던 `videoplayback`(adaptiveFormats) 무로그인 응답이 **UMP 형식(`sabr.malformed_config` 31B 쿼리)** 으로 전환됨 — v0.3에서 E-CHR-DL-1006으로 감지 확인

### SABR 프로토콜 특징
1. YouTube 자체 커스텀 스트리밍 프로토콜 (쿼리 파라미터 `sabr.malformed_config`)
2. 세그먼트 기반이 아닌 **연속 스트림**(continuous) — 개별 세그먼트 요청 없음
3. 응답 본문에서 미디어 세션(config)을 재구성해야 함 — 비공식 포맷, 버전 변경 잦음

### 대응 방향 (결정)
- **PageKit 확장 수준에서 UMP 파싱 구현 = 고비용/불안정** → 구현은 v1.1+ 후보로 보류
- yt-dlp도 무로그인 web은 사실상 포기, 로그인 쿠키 + tv 클라이언트 + PO Token 조합으로 우회 중
- **PageKit 우선 전략**: 유튜브는 로그인 상태에서 adaptiveFormats가 살아있는 경우 캡처, 아닌 경우 E-CHR-DL-1006 안내. **일반 HTTP 미디어(mp4 직접 링크) 제공 사이트를 정상 동작 경로로 실측·보장** (T-51)

## 롤백 계획
- git revert — 각 기능별 분리 커밋

## 성능 예산
- mpd: 파싱 마이크로초급, 세그먼트 순차 수신 1.2s 간격 (웨일 크래시 대응 유지 — Chrome도 동일 정책)
- ZIP: 100MB 가드, 메모리 ≤150MB
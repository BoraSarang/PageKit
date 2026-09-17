# PERMISSIONS.md — Safari 권한 정의서

**버전**: v1.0.12 / **플랫폼**: safari (macOS만) / **갱신**: 2026-09-17

---

## 1. 권한 목록 (Chrome manifest 기준, Safari가 무시하는 키 포함)

| 권한 | 용도 | Safari 상태 |
|------|------|-------------|
| `storage` | 설정/다운로드 상태 저장 | 지원 (`local` 5MB, `unlimited`→무제한 16+ / `session` 16.4+) |
| `downloads` | 배치 다운로드 + 리포트 저장 | **packager 감사 필요** — 미지원 시 앵커 폴백 + `E-SAF-DL-1001` |
| `contextMenus` | 우클릭 진입점 2원화 | macOS 지원 |
| `commands` | 키보드 단축키 | 지원 여부 실측 (T-SAF-02) |
| `scripting` | 요청 시 스크립트 주입 | 지원 (`injectImmediately`만 미지원) |
| `activeTab` | 현재 탭 접근 | 지원 |
| `webRequest` | 스트림 감지 보조 | macOS만 지원 |
| `declarativeNetRequest` | HLS/DASH 감지 + Referer/모바일 UA 규칙 | **실측 필요** — 미지원 시 `E-SAF-NET-1001` degraded |
| `notifications` | 스트림 완료 알림 | 지원 (macOS) |
| `sidePanel` | Chrome 전용 | **Safari가 무시** — `windows.create(popup)` 대체 |

## 2. host_permissions

- `<all_urls>` — 요청 시 분석·주입 (Chrome과 동일). file 스킴은 Safari가 무시.

## 3. 콘텐츠 스크립트

- `debug.js`, `content/extractor.js` 정적 주입 유지. 무거운 품질 모듈은 요청 시 주입.

## 4. 심사·배포 (로컬 개발용 범위)

- App Store 배포 없음. 무서명 + `Safari > 설정 > 개발자 > 무서명 확장 허용`으로 실행.
- TestFlight/App Store로 확장 시 별도 작업: 서명, 번들ID(`com.borasarang.PageKit`), 개인정보 고지.

## 5. 권한 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-09-17 | 신규 (v1.0.12) | Safari macOS 이식 |

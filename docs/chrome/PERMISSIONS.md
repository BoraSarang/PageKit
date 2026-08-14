# PERMISSIONS.md — Chrome 권한 정의서

**버전**: v0.1.0 / **플랫폼**: chrome

---

## 1. 권한 목록 (manifest permissions)

| 권한 | 용도 | 필수 여부 |
|------|------|-----------|
| `sidePanel` | 사이드 패널 UI (메인 작업 공간) | 필수 |
| `storage` | 설정/히스토리/다운로드 상태 저장 | 필수 |
| `downloads` | 배치 다운로드 (`chrome.downloads`) | 필수 |
| `contextMenus` | 우클릭 진입점 ② (PageKit으로 분석) | 필수 |
| `commands` | 키보드 단축키 진입점 ③ | 필수 |
| `scripting` | 플로팅 버튼 요청 시 주입 (진입점 ⑤) | 필수 |
| `activeTab` | 현재 탭 접근 (요청 시점) | 필수 |
| `declarativeNetRequest` | HLS/DASH 스트림 URL 감지 + 스트림 CDN referer 규칙 (다운로드 WAF 대응) | 선택 (옵션 ON 시) |
| `notifications` | 스트림 다운로드 완료 시스템 알림 (클릭 시 파일 위치 열기) | 필수 (v0.2) |

## 2. host_permissions

- **`<all_urls>`** — 사이드 패널/단축키/컨텍스트 메뉴에서 임의 사이트 분석·스크립트 주입 (2026-08-14 사용자 확정)
  - 팝업은 `activeTab`만으로 동작하지만, 패널/단축키 진입점은 `activeTab`이 부여되지 않아 `<all_urls>` 필요
  - 심사 설명: "사용자가 선택한 페이지의 미디어/본문 추출을 위한 요청 시 주입"
- 분석/주입은 항상 요청 시(`chrome.scripting.executeScript`) 수행 — manifest `content_scripts` 미사용
- 테스트용 `http://127.0.0.1/*`, `http://localhost/*`는 `<all_urls>`로 대체됨 (별도 항목 제거)

## 3. 콘텐츠 스크립트

- manifest의 `content_scripts.matches`는 사용하지 않음 (항상 요청 시 주입)
- `world: 'ISOLATED'` 기본

## 4. dNR 규칙 (스트림 감지, 옵션 ON 시)

- 정적 규칙 1개: URL 필터 `.m3u8`, `.mpd` 감지
- `PERMISSION_OFF` 시 규칙 비활성화 (`updateSessionRules`로 세션 규칙만 사용)

## 5. 심사 체크리스트

- [x] 권한 설명 — `<all_urls>`는 "요청 시 분석" 목적으로 심사 메모에 명시
- [x] `unsafe-eval` 없음 (CSP `script-src 'self'`)
- [x] 다운로드는 사용자 선택 기반 UI
- [x] 개인정보 수집 없음 — 로컬 처리 전용, 외부 서버 통신 없음
- [ ] `web_accessible_resources`: 플로팅 버튼 CSS/JS만 최소 노출
- [ ] privacy_policy URL (스토어 등록 시)

## 6. 권한 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-08-14 | 초기 정의 | v0.1 초안 |
| 2026-08-14 | `<all_urls>` 추가 (host_permissions) | 패널/단축키 진입점에서 임의 사이트 분석 필요 — 사용자 확정 |
| 2026-08-14 | `notifications` 추가 | 스트림 다운로드 완료 알림 (v0.2 작업 창) |
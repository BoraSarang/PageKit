# PLAN_v0.4_chrome — 우클릭/복사 제한 해제 전역 체크박스 전환

## 개요
- **문제**: 옵션의 "🔓 우클릭/복사 제한 해제 (화이트리스트)"가 동작 안 됨 — 도메인 배열(`unlockSites`)에 현재 hostname이 일치해야만 활성화되는 호스트 기반 구조 (입력 도메인 vs 실제 hostname 불일치, www 접두사 등으로 미동작)
- **요청**: 화이트리스트(도메인 추가/삭제) 제거 → **전역 체크박스** "우클릭/복사 제한 해제" ON/OFF로 단순화 (모든 사이트 적용)
- bd: 신규 이슈 등록

## 결정 사항
1. **설정 키 = `settings.unlockEnabled`** (storage.js DEFAULT_SETTINGS에 이미 존재, 기본 false — 심사 안전 유지)
2. **unlock.js**: `unlockSites` 포함 검사 제거 → `settings.unlockEnabled === true`이면 활성
3. **옵션 UI**: 도메인 입력/추가 버튼/리스트 제거 → 체크박스 1개 + 설명 문구
4. **기존 데이터 마이그레이션**: `unlockSites`가 비어있지 않으면 → `unlockEnabled=true`로 1회 승계 + `unlockSites` 비움 (기존 사용자 보호, getSettings()에서 처리)
5. **스토리지 onChanged 감지**: `changes.unlockSites` → `changes.settings`로 변경 (옵션 토글 즉시 반영)
6. **미사용 코드 정리**: `UNLOCK_TOGGLE` 메시지(미사용), `getUnlockSites`/`toggleUnlockSite`(storage.js), options.js 화이트리스트 렌더/추가/공통삭제 unlockSites 분기 제거

## v0.4.1 핵심 원인 발견 (2026-08-15 실사용 리포트)
- **증상**: 체크박스 ON + 사이트 접속 시 우클릭 해제 동작 안 함
- **원인 확정**: PageKit은 manifest `content_scripts` 자동 주입이 없고 **요청 시(분석/패널/플로팅)에만 스크립트를 주입**하는 구조 → 그냥 페이지에 들어가면 `unlock.js`가 페이지에 **존재하지 않음** (체크박스/설정 문제가 아님 — 화이트리스트 시절부터 동일)
- **해결 (T-43)**: BG `tabs.onUpdated`(status=complete)에서 `settings.unlockEnabled === true`면 해당 탭에 `debug.js`+`unlock.js`를 자동 주입 (`__pkUnlockLoaded` 가드로 중복 안전, 전역 스크립트 주입 아님 — 심사 친화적: "사용자가 켠 경우에만 로드 시 주입")
- 옵션 ON 상태로 이미 열려 있는 탭은 새로고침 시 주입됨

## 구현 단계
- [ ] T-42-1: storage.js — getSettings() 마이그레이션 + unlockSites 함수 제거
- [ ] T-42-2: unlock.js — settings.unlockEnabled 기반 활성/비활성
- [ ] T-42-3: options.html — 화이트리스트 카드 → 체크박스 카드
- [ ] T-42-4: options.js — 체크박스 토글(즉시 저장) + 화이트리스트 코드 제거
- [ ] T-42-5: messages.js — UNLOCK_TOGGLE 제거 (미사용 확인)
- [ ] T-42-6: docs — TODO.md / DESIGN.md(7장) / CHANGELOG.md / e2e PLAN(TC-E2E-CHR-006 갱신)
- [ ] T-42-7: 검증 — node --check + Whale 실측 (옵션 토글 → 사이트 즉시 해제)

## 테스트 계획
- TC-1: 체크박스 ON → 임의 사이트에서 우클릭/복사/선택 해제 동작 (토글 후 새로고침 없이 즉시)
- TC-2: 체크박스 OFF → 해제 비활성 (우클릭 메뉴 원복)
- TC-3: 기존 unlockSites 보유 시 → unlockEnabled=true 승계 확인 (개발자 도구 storage 확인)
- TC-4: 옵션 저장/재로드 후 체크박스 상태 유지

## 에러코드
- 신규 없음

## 롤백 계획
- git revert — unlock.js를 unlockSites 기반으로 복원 (settings 분기는 제거)
- 옵션에 화이트리스트 카드 복원 시 HTML/JS revert

## 성능 예산
- 영향 없음 (storage get 1회/스크립트 로드 시, onChanged 리스너 기존과 동일)
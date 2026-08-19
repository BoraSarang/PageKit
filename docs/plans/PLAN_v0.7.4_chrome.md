# PLAN v0.7.4 (chrome) — 설치 온보딩 페이지

> 작성: 2026-08-19 · 상태: 완료

## 요구 (사용자)

- 확장 설치 시 뜨는 온보딩(사용 설명) 페이지 제작
- 내용: 0. 툴바 고정 방법/이점(고정 유도) · 1. 우클릭/복사 제한 해제 방법 · 2. 이미지·스트림·동영상 다운로드 방법

## 구현

- `extension/onboarding/onboarding.html` + `onboarding.css` + `onboarding.js` 신규
  - options 페이지와 동일한 pk-* 디자인 변수/카드 스타일 재사용
  - 카드 3개 + 단계별 설명 10스텝 + 이점 강조 박스(툴바 고정 유도)
  - 버전 표시: `getManifest().version` 동적
  - 버튼: 설정 열기(`runtime.openOptionsPage`) / 닫기(현재 탭 `tabs.remove`)
- `service-worker.js` `onInstalled`: `details.reason === 'install'`일 때만 온보딩 탭 생성
  (업데이트 시에는 열지 않음 — 무단 탭 방지)

## 검증

- `node --check` 통과 (onboarding.js, service-worker.js)
- Chrome CDP 실측: 카드 3개·스텝 10개·버튼 2개 렌더링, 확장 리로드 후 버전 **v0.7.4** 표시, 닫기 버튼 → 탭 닫힘 확인

## 롤백

- git revert — onInstalled 분기 제거 시 온보딩 미표시 (페이지 파일 삭제는 별도)
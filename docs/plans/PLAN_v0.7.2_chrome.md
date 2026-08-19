# PLAN v0.7.2 (chrome) — 패널 스트림 탭을 영상 옆 버튼으로

> 작성: 2026-08-19 · 상태: 완료 · 소규모 UI 변경

## 요구

- "스트림도 영상 옆에 빼줘" — 스트림 탭이 드롭다운에 숨어 있어 영상 옆으로 노출
- 사용자 결정(선택지 3개 중): **버튼 3개 + 드롭다운** — 🖼 이미지 / 🎬 영상 / 📡 스트림 버튼, 드롭다운엔 [전체, 오디오, 링크]

## 수정

- `panel.html`: `pk-cat-streams` 버튼 추가 (📡 + `pk-c-streams` 카운트)
- `panel.js`:
  - render(): isQuick 판정에 streams 포함, 스트림 active 토글 + 카운트 배지, 드롭다운 cat 배열에서 streams 제거 ([all, audios, links])
  - setCategory(): streams active 토글 + 셀렉트 'all' 초기화
  - `pk-cat-streams` 클릭 이벤트 추가

## 검증

- `node --check` 통과
- Chrome CDP 실측: 패널 popup 창 → 버튼 3개(🖼🎬📡) 렌더링 확인, 📡 클릭 → is-active 전환 + 셀렉트 'all' 초기화 확인

## 롤백

- git revert — 2파일 변경 (panel.html, panel.js)
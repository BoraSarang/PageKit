# PLAN v0.7.5 (chrome) — 컨텍스트 메뉴 수리 + 분석 오버레이 + URL 표시 + 플로팅 제거

> 작성: 2026-08-19 · 상태: 완료

## 요구 (사용자 리포트 4건)

1. **분석 중 로딩 표시**: 패널이 페이지/탭 변경으로 자동 재분석될 때 "분석 중…" 오버레이 필요
2. **URL 표시 양끝**: 파일명 중간 축약(기존 `…base9…base4`) 대신 "앞부분…파일명끝" 형태
3. **컨텍스트 메뉴 오류**: "PageKit으로 분석"이 클릭한 탭이 아닌 다른 탭을 분석 + 새 탭으로 열림
4. **플로팅 버튼**: "안 먹히면 아예 빼자" — 동작 여부 실측 후 결정

## 원인 분석 (③ 컨텍스트 메뉴)

- `onClicked`에서 `await ensureInjected()` → **user gesture 소멸** → `sidePanel.open()` 실패
  → fallback `tabs.create`로 새 탭 열림 + 패널 `analyze()`가 활성 탭이 아닌 **첫 번째 웹 탭** 분석
- 플로팅 버튼(content script 경유)은 MV3에서 **원천적으로 제스처 전달 불가** → 항상 fallback만 동작

## 구현

### ③ 컨텍스트 메뉴 수리 (T-86)
- `service-worker.js` `onClicked`: `await` 없이 동기 `openSidePanel('context', tab?.windowId)` 호출(제스처 유지) + `storage.session.set({ contextTarget })` 기록 + `ensureInjected`는 fire-and-forget
- `panel.js` `analyze()`: `contextTarget` 있으면 그 탭을 분석(1회용 — 사용 후 제거) + `storage.onChanged` 리스너로 열린 패널 즉시 재분석
- 검증: 활성 탭 google 상태에서 torrentsee 컨텍스트 분석 성공, `openResp {ok:true, fallback:'tab'}`(무제스처 폴백은 예상)

### ① 분석 오버레이 (T-87)
- `panel.html` `#pk-overlay`(스피너 + "분석 중…") + `panel.css`(고정/반투명/backdrop blur)
- `panel.js`: `analyze()` 출처 선점 직후 `showAnalyzing()`, try/catch/finally로 성공·실패 모두 `hideAnalyzing()`
- 검증: ⟳ 클릭 0.6초 시점 표시 확인 → 완료 후 숨김 확인

### ② URL 양끝 표시 (T-88)
- `panel.js` `shortenUrl`: 파일명 끝 10자 + 확장자만 보존, 앞부분만 축약 → `앞부분…파일명끝`
- 검증: 4케이스 단위 테스트 (긴 jpg / jiantou2.png / 쿼리 포함 / 짧은 이름)

### ④ 플로팅 버튼 제거 (T-89)
- 실측: 클릭 → `sidePanel.open` 실패(무제스처) → fallback 탭 활성화만 동작 → 사용자 결정 "제거"
- 삭제: `content/float-button.js` + `content/float-button.css` 파일, extractor.js `ensureFloatButton`/`pk.ui.floatVisible` 핸들러, service-worker.js `injectFloatButton`/`FLOAT_BUTTON_READY`/`RUN_SCRIPTS`, popup.js 토글 핸들러 + popup.html 버튼, messages.js `FLOAT_BUTTON_READY` + `PANEL_SOURCES`에서 'float' 제거
- 검증: 페이지 리로드 + 새 코드 주입 상태에서 `#pk-float-btn` 미존재 실측

## 롤백 계획

- git revert + 확장 리로드 (`chrome://extensions` → reload)

## 에러코드 영향

- 신규/변경 에러코드 없음 (기존 E-CHR-NET-1001 등 유지)

## 문서 갱신

- docs/TODO.md T-86~T-89, docs/CHANGELOG.md, PLAN_v0.7.5 (본 문서)
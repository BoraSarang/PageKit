# PLAN_v0.6_landing.md — PageKit 랜딩 페이지

> 생성: 2026-08-15 · 플랫폼: landing(정적 HTML) · 스택: HTML + Tailwind CDN

## 개요

PageKit 확장 홍보용 랜딩 페이지. 이미지 없이 아이콘+타이포 중심의 Flat Design으로 완성도 높은 단일 HTML 페이지 제작.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 스택 | 정적 HTML 단일 파일 `landing/index.html` (Tailwind CDN) |
| 디자인 | ui-ux-pro-max `--design-system` 추천: Flat Design (그림자/그라디언트 없음) |
| 색상 | Teal #0D9488 primary / Orange #EA580C CTA / #F0FDFA 배경 / 다크모드 지원 |
| 타이포 | Plus Jakarta Sans (Google Fonts) |
| 이미지 | 없음 — Hero 미리보기는 CSS 브라우저 모형(가짜 패널 UI)로 표현 |
| 푸터 | 제작자 BoRaSaRang · 문의 leeborasarang@gmail.com (mailto) |
| 스토어 링크 | 미배포 → `#` 자리표시자 |

## 구조

1. Hero — 헤드라인 + CTA + CSS 브라우저 모형
2. 문제/솔루션 — 페인 포인트 3개 → PageKit 해결
3. 기능 6카드 — 이미지/비디오(HLS·DASH)/ZIP/CSV/링크/우클릭 해제
4. 사용법 3단계
5. CTA + 푸터

## a11y / 성능

- 반응형 375/768/1024/1440 (mobile-first, `md:`/`lg:` 브레이크포인트)
- 다크모드 `prefers-color-scheme` + 대비 4.5:1
- `prefers-reduced-motion` 존중
- 키보드 포커스 가시 상태, 인라인 SVG 아이콘(이모지 금지)
- 성능: 외부 리소스 Tailwind CDN + Google Fonts 2개 뿐

## 테스트 계획 (TC)

- TC-01: Chrome CDP 로컬 열기 — Hero/기능/사용법/푸터 랜더링 확인 (375/768/1280)
- TC-02: 다크모드 전환 확인 (emulate colorScheme)
- TC-03: Lighthouse snapshot — a11y/best-practices 점수 확인
- TC-04: 푸터 mailto 링크 존재 + a11y 트리 확인

## 롤백 계획

- 미배포 정적 파일 — `git revert` 로 간단 롤백

## 에러코드

- 없음 (신규 에러 없음)
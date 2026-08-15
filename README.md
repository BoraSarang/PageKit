# PageKit

페이지의 이미지, 영상, 링크를 한 번에 수집하고 일괄 다운로드하는 Chrome · 웨일 확장 프로그램.

- 우클릭·복사 제한 해제, HLS(m3u8)·DASH(mpd) 영상 병합, 배치 ZIP 저장, 링크 추출·CSV 내보내기
- 스토어 배포 준비 중 — 지금은 GitHub Releases에서 받아 개발자 모드로 설치할 수 있습니다.

## 랜딩 페이지

- GitHub Pages: https://borasarang.github.io/PageKit/
- 소스: [`landing/index.html`](landing/index.html) (정적 HTML, Tailwind CDN)

## 기능

| 기능 | 설명 |
|------|------|
| 이미지 수집 | srcset/lazy/background 이미지 감지 + 본문 안/밖 분류 필터 |
| 영상 병합 다운로드 | HLS(m3u8)·DASH(mpd) 스트리밍을 품질 선택 후 하나의 MP4로 병합 (유튜브 지원) |
| 배치 ZIP 저장 | 선택 항목을 폴더 구조 그대로 ZIP 압축, 실패 항목 자동 재시도 |
| 링크 추출 · CSV | 중복 제거 추출 + 정규식 필터·프리셋 + CSV 내보내기 |
| 우클릭·복사 해제 | 복사·저장 제한 페이지에서 자유로운 사용 |
| 가벼운 MV3 | 요청 시에만 스크립트 주입, 최소 권한 Manifest V3 |

## 설치 (스토어 배포 전)

1. [GitHub Releases](https://github.com/BoraSarang/PageKit/releases/latest)에서 최신 버전 ZIP 다운로드
2. `chrome://extensions`(웨일: `whale://extensions`) → 개발자 모드 ON
3. "압축 해제된 확장 프로그램 로드" → 압축 해제 폴더 선택

## 사용법

1. 페이지에서 확장 아이콘 클릭 또는 우클릭 → "PageKit으로 분석"
2. 수집된 이미지·영상·링크 확인 (본문/외부 분류, 정규식 필터)
3. 원하는 것 선택 → ZIP 배치 다운로드, 영상은 품질 선택 후 MP4 병합, 링크는 CSV 내보내기

단축키: `Cmd+Shift+K` 사이드 패널 열기 · `Cmd+Shift+D` 디버그 창

## 문서

- [PRD](docs/PRD.md) · [DESIGN](docs/DESIGN.md) · [TODO](docs/TODO.md) · [CHANGELOG](docs/CHANGELOG.md)
- [권한 정의서](docs/chrome/PERMISSIONS.md) · [메시지 규약](docs/chrome/MESSAGING.md) · [E2E 계획](docs/e2e/PLAN.md)
- 계획: `docs/plans/PLAN_v0.x_{platform}.md`

## 개발

```
extension/          # 확장 소스 (MV3)
├── manifest.json
├── background/     # 서비스 워커 (다운로더, 스트림 감지, 패널 컨트롤러)
├── content/        # 콘텐츠 스크립트 (추출/하이라이트/플로팅 버튼/우클릭 해제)
├── popup/ sidepanel/ options/ debug-view/
└── shared/         # 공통 (messages, m3u8/DASH 파서, zip)
landing/            # 랜딩 페이지 (GitHub Pages)
docs/               # 문서
scripts/            # 빌드/검증 스크립트
```

빌드/검증:

```bash
./build_and_run.sh debug chrome   # 빌드 + Chrome 테스트
./scripts/a11y-dump.sh chrome     # a11y 덤프
./scripts/webstore-publish.sh chrome --dry-run  # 스토어 패키징 검증
```

## 배포

- Chrome 웹 스토어 · 웨일 스토어: **출시 준비 중**
- 랜딩 페이지: GitHub Actions가 `main` 푸시 시 `landing/`을 GitHub Pages로 자동 배포 (`.github/workflows/pages.yml`)

## 제작자

- BoRaSaRang · 문의: leeborasarang@gmail.com
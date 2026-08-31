<div align="center">

# 🧰 PageKit

**웹페이지의 군더더기는 빼고, 알짜배기만 쏙 — 미디어 수집·다운로드 & 페이지 품질 진단**
_Grab the good stuff from any page: media collection · batch download · page quality audit._

[![version](https://img.shields.io/badge/version-1.0.7-0d9488)](https://github.com/BoraSarang/PageKit/releases)
[![Chrome / Whale](https://img.shields.io/badge/Chrome%20%2F%20Whale-116%2B-3b82f6)](#설치)
[![CI](https://github.com/BoraSarang/PageKit/actions/workflows/ci.yml/badge.svg)](https://github.com/BoraSarang/PageKit/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)](https://github.com/BoraSarang/PageKit/pulls)

[기능](#-주요-기능) · [설치](#-설치) · [스크린샷](#-스크린샷) · [사용법](#-빠른-시작) · [개발자](#%EC%A7%80%EC%9A%B0%EC%A7%80-%EC%95%8A%EC%9D%8C--developers) · [English](#-english)

</div>

---

## 🇰🇷 한국어

### ✨ 주요 기능

|     | 기능                        | 설명                                                                                                                                |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 🖼   | **미디어 수집**             | `srcset`·lazy·background 이미지, 동영상, 오디오, 링크를 한 번에 수집하고 본문 안/밖으로 자동 분류                                   |
| 🎬  | **스트리밍 병합 다운로드**  | HLS(m3u8)·DASH(mpd)를 화질별로 감지해 **화질 변형을 하나의 카드로 통합**, **검토 화면(해상도·예상 용량) 후 하나의 MP4로 병합 저장** |
| ⏹   | **유튜브 형식 확인 · 복사** | 유튜브는 다운로드가 제한되어, 지원 형식을 한눈에 보여주고 **페이지 주소 복사**만 제공                                               |
| 📦  | **배치 ZIP 저장**           | 선택 항목을 폴더 구조 그대로 ZIP으로 일괄 저장, 실패 항목 자동 재시도                                                               |
| 🔗  | **링크 추출 · CSV**         | 중복 제거 추출 + 정규식 필터 프리셋 + CSV 내보내기                                                                                  |
| 🔓  | **우클릭·복사 해제**        | 복사·저장이 막힌 페이지에서 자유롭게 사용                                                                                           |
| 🔍  | **페이지 품질 진단** ⭐NEW  | SEO·성능(Core Web Vitals 실측)·접근성(axe-core 내장)·콘텐츠 품질을 종합 진단하고 **HTML/JSON 리포트**로 저장                        |

> 💡 모든 처리는 **100% 로컬**에서 이루어집니다. 서버 통신 없음, 추적 없음.
> ⚡ Manifest V3 · 요청 시에만 스크립트 주입하는 가벼운 구조.

### 📦 설치

**Chrome Web Store** — 준비 중 🏗️
**Whale(웨일)** — 동일하게 동작합니다

<details open>
<summary><b>수동 설치 (개발자 모드)</b></summary>

1. [Releases](https://github.com/BoraSarang/PageKit/releases)에서 최신 ZIP 다운로드
2. 압축 해제 후 `chrome://extensions` 접속
3. 우측 상단 **개발자 모드** ON
4. **압축해제된 확장 프로그램 로드** → 해제한 폴더 선택

</details>

### 🖥 스크린샷

<!-- 📸 캡처 후 .github/assets/ 에 넣고 아래 주석을 해제하세요
| 팝업 | 미디어 패널 |
|------|------------|
| ![](./.github/assets/popup.png) | ![](./.github/assets/media-panel.png) |
| 품질 리포트 | 스트림 작업 창 |
| ![](./.github/assets/quality-report.png) | ![](./.github/assets/stream-task.png) |
-->

> 📸 _스크린샷 준비 중 — 캡처 가이드는 [`docs/screenshots-guide.md`](docs/screenshots-guide.md) 참조_

### 🚀 빠른 시작

1. 툴바 아이콘 클릭 → **[📊 사이드 패널에서 분석]** — 열려 있는 페이지의 미디어가 정리되어 표시됩니다 (**[✅ 품질 진단]** 버튼으로 진단 화면도 열 수 있어요)
2. 항목 선택 → **[다운로드]** (ZIP 일괄 또는 개별)
3. 영상·스트림 → **검토 화면에서 해상도·예상 용량 확인 후 [다운로드 시작]** (유튜브는 형식 확인 · 주소 복사)
4. 우클릭 → **PageKit으로 분석 / PageKit으로 품질 진단**

### 🗺 로드맵

- [x] 미디어 수집 · 배치 다운로드 · 스트림 병합 (v0.5)
- [x] 페이지 품질 진단 단독 패널 (v0.7)
- [x] 스트림 화질 통합 카드 · 검토 화면(예상 용량 포함) · 유튜브 형식 확인 · 자동 리사이즈 (v1.0.2~1.0.6)
- [ ] Chrome Web Store 정식 배포
- [ ] 진단 히스토리·비교 리포트

---

## 🌍 English

### ✨ Features

|     | Feature                         | Description                                                                                                                               |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 🖼   | **Media collector**             | Detects `srcset`/lazy/background images, videos, audios and links; classifies in-article vs off-article                                   |
| 🎬  | **Stream merge downloader**     | Detects HLS(m3u8)/DASH(mpd), merges quality variants into a single card, then **review (resolution · estimated size) → one MP4**          |
| ⏹   | **YouTube format check · copy** | YouTube downloads are restricted, so PageKit shows supported formats and **copies the page URL**                                          |
| 📦  | **Batch ZIP save**              | Download selected items preserving folder structure, with auto-retry                                                                      |
| 🔗  | **Link extractor · CSV**        | Deduped extraction, regex filter presets, CSV export                                                                                      |
| 🔓  | **Unlock right-click/copy**     | Freely use pages that block copy/save                                                                                                     |
| 🔍  | **Page quality audit** ⭐NEW    | One-shot SEO, performance (real Core Web Vitals), accessibility (embedded axe-core) and content-quality checks with **HTML/JSON reports** |

> 💡 100% local processing. No servers, no tracking.
> ⚡ Lightweight Manifest V3 — scripts are injected only on demand.

### 📦 Install

**Chrome Web Store** — coming soon 🏗️
**Whale browser** — works the same

<details>
<summary><b>Manual install (developer mode)</b></summary>

1. Grab the latest ZIP from [Releases](https://github.com/BoraSarang/PageKit/releases)
2. Unzip, then open `chrome://extensions`
3. Toggle **Developer mode** (top right)
4. Click **Load unpacked** → select the unzipped folder

</details>

### 🚀 Quick start

1. Click the toolbar icon → **[Analyze in side panel]** — media from the current page is organized instantly (use **[Quality audit]** button for the diagnostic panel)
2. Select items → **Download** (bulk ZIP or individual)
3. Videos/streams → **review screen (resolution · estimated size) → [Start download]** (YouTube shows formats and copies the URL only)
4. Right-click any page → **Analyze with PageKit / Quality audit**

---

## 🛠️ 개발자 · Developers

### 요구사항 Requirements

- Node.js ≥ 20 (E2E/도구), Chrome or Whale 116+

### 스크립트 Scripts (repo root)

```bash
./scripts/e2e-chrome.sh        # E2E 스모크 (Whale 격리 프로필, 브라우저 다운로드 없음)
node e2e/diag-media.cjs        # 분석·로깅 파이프라인 실측 진단
npm run format                 # prettier 전체 포맷
npm run format:check           # CI와 동일 검사
node --experimental-vm-modules scripts/strict-check.cjs extension   # 엄격 구문 검증
./scripts/webstore-publish.sh chrome --dry-run   # 스토어 패키징 검증
```

> ⚠️ `node --check`는 import/export 파일을 가짜 통과시킵니다 — 반드시 `strict-check`를 사용하세요.
> ⚠️ Chrome 137+ 는 `--load-extension`을 지원하지 않으므로 E2E는 Whale 격리 프로필로 실행합니다. ([AGENTS.md](AGENTS.md) 규칙 6)

### 구조 Structure

```text
extension/
├── background/        # SW 라우팅 + 품질 핸들러 + 다운로더/스트림 감지
├── content/           # extractor(수정 불가급 핵심)·품질 엔진·a11y·CWV
├── shared/            # 메시지 규약·룰엔진·DOM 유틸 (classic+ESM 듀얼)
├── sidepanel/         # 미디어 패널 + 품질진단 단독 패널
├── popup/ options/    # 진입점 UI
└── downloader/        # 스트림 작업창 UI
docs/                  # PRD·DESIGN·CHANGELOG·권한 정의서
e2e/, scripts/         # 테스트 및 도구
```

### 아키텍처 한 줄 Architecture in one line

SW가 라우팅만 담당하고, 분석은 항상 **요청 시 대상 탭 격리 월드에 주입**되며,
모든 응답은 catch 보장 · 이슈 목록은 단일 원천(`rebuildFlatIssues`)으로 관리됩니다.
자세한 설계: [`docs/DESIGN.md`](docs/DESIGN.md) · 메시지 규약: [`docs/chrome/MESSAGING.md`](docs/chrome/MESSAGING.md)

### 문서 Docs

[`PRD`](docs/PRD.md) · [`DESIGN`](docs/DESIGN.md) · [`CHANGELOG`](docs/CHANGELOG.md) · [`TODO`](docs/TODO.md) · [`PERMISSIONS`](docs/chrome/PERMISSIONS.md)

---

<div align="center">

🇰🇷 위 한국어 섹션이 본문입니다 · English above is a condensed mirror.
Made with ☕ by [BoraSaRang](https://github.com/BoraSarang)

</div>

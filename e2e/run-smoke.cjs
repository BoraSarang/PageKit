// e2e/run-smoke.cjs — PageKit 확장 스모크 테스트 (시스템 Chrome 채널, 브라우저 다운로드 없음)
// 실행: node e2e/run-smoke.cjs  또는 ./scripts/e2e-chrome.sh
// 검증 범위: 확장 로드/SW 기동, 팝업 UI(버튼·버전·자동분석 제거), 품질 단독 패널, 옵션 fieldset
//
// 참고: Playwright 헤드리스 브랜드 Chrome은 chrome-headless-shell을 써서 확장이 안 돈다.
// 그래서 ①headless:false + --headless=new 플래그(창 없는 완전 바이너리) → ②완전 헤데드 순으로 폴백한다.

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');

function assert(cond, msg) {
  if (!cond) throw new Error('❌ ' + msg);
  console.log('✅ ' + msg);
}

// 실행 브라우저: Chrome 137+ 는 --load-extension 자체가 제거되어 확장 자동화 불가.
// → Whale(Chromium 계열)을 '완전 격리 임시 프로필'로 기동한다 (실사용 .whale-profile·프로세스 무접촉).
const EXECUTABLE = process.env.E2E_EXECUTABLE || '/Applications/Whale.app/Contents/MacOS/Whale';

const LAUNCH_MODES =
  process.env.E2E_HEADLESS === '0'
    ? [
        { name: 'headed', extraArgs: [] },
        { name: 'new-headless', extraArgs: ['--headless=new'] },
      ]
    : [
        { name: 'new-headless(무창 확장 지원)', extraArgs: ['--headless=new'] },
        { name: 'headed', extraArgs: [] },
      ];

async function launchWithExtension(mode) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagekit-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    // headless:false 로 두고 실제 헤들리싱은 --headless=new 플래그로 제어해야
    // chrome-headless-shell 대신 완전 바이너리가 뜬다(확장/SW 지원).
    headless: false,
    executablePath: EXECUTABLE,
    args: [
      ...mode.extraArgs,
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  return context;
}

async function waitForServiceWorker(context, ms = 10000) {
  const [existing] = context.serviceWorkers();
  if (existing) return existing;
  try {
    return await context.waitForEvent('serviceworker', { timeout: ms });
  } catch {
    return null;
  }
}

(async () => {
  // 0) 확장이 뜨는 실행 모드 탐색
  let context = null;
  let sw = null;
  for (const mode of LAUNCH_MODES) {
    console.log(`[E2E] 실행 모드 시도: ${mode.name}`);
    context = await launchWithExtension(mode);
    sw = await waitForServiceWorker(context);
    if (sw) break;
    console.log(`[E2E] '${mode.name}'에서 SW 미기동 — 다음 모드로 폴백`);
    await context.close().catch(() => {});
    context = null;
  }
  if (!context || !sw)
    throw new Error('❌ 어떤 실행 모드에서도 확장 서비스 워커가 기동하지 않았습니다');

  try {
    const extId = new URL(sw.url()).host;
    assert(/^[\w-]+$/.test(extId), `확장 로드 + SW 기동 (id=${extId.slice(0, 8)}…)`);
    const base = `chrome-extension://${extId}`;

    // 1) 팝업 UI
    const popup = await context.newPage();
    await popup.goto(`${base}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    await popup.waitForSelector('#pk-panel-media', { timeout: 5000 });
    assert(await popup.isVisible('#pk-panel-media'), '팝업: [사이드 패널에서 분석] 버튼');
    assert(await popup.isVisible('#pk-panel-quality'), '팝업: [사이드 패널에서 품질 진단] 버튼');
    assert(!(await popup.isVisible('#pk-summary')), '팝업: 이전 자동요약 섹션 제거 확인');
    const ver = ((await popup.textContent('#pk-version')) || '').trim();
    assert(/^v\d+\.\d+\.\d+$/.test(ver), `팝업 버전 실시간 표시 (${ver})`);

    // 2) 품질 진단 단독 패널
    const qp = await context.newPage();
    await qp.goto(`${base}/sidepanel/quality-tab.html?auto=1`, { waitUntil: 'domcontentloaded' });
    await qp.waitForSelector('#btn-analyze', { timeout: 5000 });
    assert((await qp.title()).includes('품질 진단'), '품질패널 문서 로드');
    const modCount = await qp.locator('#module-checks .check-item').count();
    assert(modCount === 9, `모듈 체크박스 9개 (실제 ${modCount})`);
    assert((await qp.locator('#analysis-target').count()) === 1, '분석대상 표시줄 요소 존재');
    await qp.waitForTimeout(1200); // autoRun 부트 분석 여유
    assert(await qp.isEnabled('#btn-analyze'), '자동 부트 분석 완료(버튼 복귀)');

    // 3) 옵션 페이지 — 품질 섹션 스타일 복구 확인
    const op = await context.newPage();
    await op.goto(`${base}/options/options.html`, { waitUntil: 'domcontentloaded' });
    await op.waitForSelector('.pk-fieldset legend', { timeout: 5000 });
    const legends = await op.locator('.pk-fieldset legend').allTextContents();
    assert(
      legends.some((t) => t.includes('분석 모듈')),
      '옵션: [분석 모듈] fieldset 렌더'
    );
    assert(await op.isChecked('#pk-quality-enabled'), '옵션: 품질진단 기본 켬');

    console.log('\n🎉 E2E 스모크 전체 통과');
  } finally {
    await context.close().catch(() => {});
  }
})().catch((e) => {
  console.error('\n💥 ' + e.message);
  process.exit(1);
});

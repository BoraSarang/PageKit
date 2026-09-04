// e2e/run-quality-seo.cjs — 품질 진단 SEO 기능 E2E (v1.0.11: SERP 미리보기 + 깨진 링크 실측)
// 검증 범위: 품질패널 분석에서 SERP 카드 렌더, 내부 링크 수집, broken HEAD 실측, 페이지 하이라이트
// 실행: node e2e/run-quality-seo.cjs  (E2E_HEADLESS=0 로 창 확인 가능)

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');

function assert(cond, msg) {
  if (!cond) throw new Error('❌ ' + msg);
  console.log('✅ ' + msg);
}

const EXECUTABLE = process.env.E2E_EXECUTABLE || '/Applications/Whale.app/Contents/MacOS/Whale';

async function launchWithExtension() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagekit-qseo-'));
  const args = [
    '--headless=new',
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: EXECUTABLE,
    args,
  });
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

// 테스트 HTTP 서버: 내부 링크(정상/404/500/HEAD전용) + 외부 링크 1개
function startTestServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="ko"><head>
<title>SERP E2E 테스트 페이지 — 매우 긴 제목으로 길이 게이지 초과 케이스를 확인하기 위한 아주 긴 타이틀 문자열입니다 이게 진짜로 60자가 넘어야 클립이 동작합니다</title>
<meta name="description" content="PageKit 품질 진단 E2E 검증용 설명입니다. 메타 설명의 길이를 채우기 위한 텍스트를 충분히 길게 작성하여 설명 게이지도 확인할 수 있도록 했습니다.">
<link rel="canonical" href="http://127.0.0.1:18925/">
</head><body>
<h1>PageKit E2E</h1>
<a href="/ok">정상 링크</a>
<a href="/missing">깨진 404 링크</a>
<a href="/broken">깨진 500 링크</a>
<a href="/head-only">HEAD 전용 링크</a>
<a href="https://example.com/">외부 링크</a>
</body></html>`);
        return;
      }
      if (req.url === '/ok') {
        res.writeHead(200);
        res.end();
        return;
      }
      if (req.url === '/missing') {
        res.writeHead(404);
        res.end();
        return;
      }
      if (req.url === '/broken') {
        res.writeHead(500);
        res.end();
        return;
      }
      if (req.url === '/head-only') {
        if (req.method === 'HEAD') res.writeHead(200);
        else res.writeHead(405);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(18925, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await startTestServer();
  let context = null;
  try {
    context = await launchWithExtension();
    const sw = await waitForServiceWorker(context);
    if (!sw) throw new Error('SW 미기동');
    const extId = new URL(sw.url()).host;
    const base = `chrome-extension://${extId}`;

    // 테스트 페이지를 열어 활성 탭으로
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:18925/', { waitUntil: 'load' });
    await page.bringToFront();

    // 품질 패널 열기 → autoRun 부트 분석 (대상 = 최근 웹 탭 = 테스트 페이지)
    const qp = await context.newPage();
    await qp.goto(`${base}/sidepanel/quality-tab.html?auto=1`, { waitUntil: 'domcontentloaded' });
    await qp.waitForSelector('#btn-analyze', { timeout: 5000 });
    // 분석 대상 명확화: 테스트 페이지를 활성 탭으로 되돌린 뒤 수동 분석 클릭
    await page.bringToFront();
    await page.waitForTimeout(300);
    await qp.click('#btn-analyze');
    await page.waitForTimeout(2500); // analyze settle + CWV + 리포트 렌더 여유
    assert((await qp.isEnabled('#btn-analyze')) === true, '품질패널 분석 완료');

    // SERP 카드 (분석 대상 = 테스트 페이지 title/desc)
    const serpCard = await qp.locator('#serp-card').count();
    assert(serpCard === 1, 'SERP 미리보기 카드 렌더');
    const serpTitle = ((await qp.locator('.serp-snippet-title').textContent()) || '').trim();
    assert(
      serpTitle.includes('SERP E2E 테스트 페이지'),
      `SERP 타이틀 = 테스트 페이지 제목 (${serpTitle.slice(0, 30)}…)`
    );
    const serpUrl = ((await qp.locator('.serp-url').textContent()) || '').trim();
    assert(serpUrl.includes('127.0.0.1'), `SERP URL 표시 (${serpUrl})`);
    const gaugeCount = await qp.locator('#serp-gauges .serp-gauge').count();
    assert(gaugeCount === 2, 'SERP 길이 게이지 2개 (TITLE/DESCRIPTION)');

    // 깨진 링크 카드 (내부 링크 4개 존재)
    const brokenCard = await qp.locator('#broken-card').count();
    assert(brokenCard === 1, '깨진 링크 실측 카드 렌더');

    // 내부 링크 확인 클릭 → broken 2건 (404 + 500)
    await qp.click('#btn-check-broken');
    await page.waitForTimeout(2500); // HEAD 실측 (동시성 5 — 4건 즉시)
    const brokenCount = await qp.locator('.broken-item').count();
    assert(brokenCount === 2, `깨진 링크 2건 감지 (실제 ${brokenCount})`);
    const statusText = await qp.locator('#broken-status-text').inputValue();
    assert(statusText.includes('2건 깨진'), `상태 표시: ${statusText}`);

    // 페이지 하이라이트 → .pk-broken-link 2개
    const hlBtn = await qp.locator('#btn-highlight-broken').isVisible();
    assert(hlBtn === true, '페이지에서 강조 버튼 노출');
    await qp.click('#btn-highlight-broken');
    await page.waitForTimeout(800);
    const hlCount = await page.locator('a.pk-broken-link').count();
    assert(hlCount === 2, `페이지에서 깨진 링크 2개 하이라이트 (실제 ${hlCount})`);

    // 하이라이트 해제
    await qp.click('#btn-highlight-broken');
    await page.waitForTimeout(500);
    const hlAfter = await page.locator('a.pk-broken-link').count();
    assert(hlAfter === 0, '하이라이트 해제');

    console.log('\n🎉 품질 SEO E2E 전체 통과');
  } finally {
    await context?.close().catch(() => {});
    server.close();
  }
})().catch((e) => {
  console.error('\n💥 ' + e.message);
  process.exit(1);
});

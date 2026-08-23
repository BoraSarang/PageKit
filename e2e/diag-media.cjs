// e2e/diag-media.cjs — 미디어 분석 + 디버그 로깅 파이프라인 실측 진단 (임시 도구)
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const EXECUTABLE =
  process.env.E2E_EXECUTABLE || '/Applications/Whale.app/Contents/MacOS/Whale';

const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>PK-DIAG</title></head>
<body><h1>diag</h1>
<img src="/i/1.png" width="40"><img src="/i/2.png" width="40">
<a href="/a.html">inner</a><a href="https://example.com/x">outer</a>
<iframe src="/frame.html"></iframe>
</body></html>`;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = req.url || '/';
      res.setHeader('Content-Type', u.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
      if (u.startsWith('/i/')) res.end(PNG);
      else if (u === '/frame.html') res.end('<p>frame</p>');
      else res.end(FIXTURE);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const out = { steps: {} };
  const pageErrors = [];
  const srv = await startServer();
  const port = srv.address().port;
  const fixtureUrl = 'http://127.0.0.1:' + port + '/e2e-test.html';

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-diag-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: EXECUTABLE,
    args: [
      '--headless=new',
      '--disable-extensions-except=' + EXT,
      '--load-extension=' + EXT,
      '--no-first-run',
    ],
  });
  context.on('page', (pg) =>
    pg.on('pageerror', (e) => pageErrors.push('[pe ' + pg.url().slice(-24) + '] ' + e.message))
  );

  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    out.steps.extId = extId;

    const target = await context.newPage();
    target.on('pageerror', (e) => pageErrors.push('[target] ' + e.message));
    await target.goto(fixtureUrl, { waitUntil: 'load' });

    const ctrl = await context.newPage();
    ctrl.on('pageerror', (e) => pageErrors.push('[ctrl] ' + e.message));
    await ctrl.goto('chrome-extension://' + extId + '/options/options.html', { waitUntil: 'domcontentloaded' });

    const tabInfo = await ctrl.evaluate(async (prefix) => {
      const tabs = await chrome.tabs.query({ url: prefix + '/*' });
      return tabs.map((t) => ({ id: t.id, url: t.url }));
    }, 'http://127.0.0.1:' + port);
    out.steps.targetTabs = tabInfo;
    const tabId = tabInfo[0] && tabInfo[0].id;

    const ensure = await ctrl.evaluate(
      (tid) =>
        new Promise((res) => {
          chrome.runtime.sendMessage({ type: 'pk.inject.ensure', tabId: tid }, (r) => {
            res({ lastErr: (chrome.runtime.lastError || {}).message || '', resp: r ?? null });
          });
        }),
      tabId
    );
    out.steps.ensureInjected = ensure;

    const analyze = await ctrl.evaluate(
      (tid) =>
        new Promise((res) => {
          const t = setTimeout(() => res({ timeout: true }), 30000);
          chrome.tabs.sendMessage(tid, { type: 'pk.analyze.page' }, (r) => {
            clearTimeout(t);
            res({
              lastErr: (chrome.runtime.lastError || {}).message || '',
              ok: r && r.ok != null ? r.ok : null,
              statsKeys: r && r.data && r.data.stats ? Object.keys(r.data.stats).length : null,
              err: (r && r.error) || null,
            });
          });
        }),
      tabId
    );
    out.steps.analyzePage = analyze;

    const store = await ctrl.evaluate(
      () =>
        new Promise((res) => {
          chrome.storage.local.get(['debugLog', 'debugEnabled'], (v) => {
            const arr = v.debugLog || [];
            res({
              debugEnabledStored: v.debugEnabled === undefined ? '(unset)' : v.debugEnabled,
              logCount: arr.length,
              last5: arr.slice(-5).map((l) => '[' + l.level + ']' + l.text),
            });
          });
        })
    );
    out.steps.storage = store;

    const dv = await context.newPage();
    dv.on('pageerror', (e) => pageErrors.push('[debugview] ' + e.message));
    await dv.goto('chrome-extension://' + extId + '/debug-view.html', { waitUntil: 'domcontentloaded' });
    await dv.waitForTimeout(2600);
    out.steps.debugView = await dv.evaluate(() => ({
      logLen: ((document.getElementById('log') || {}).innerText || '').length,
      countText: (document.getElementById('count') || {}).textContent || '',
    }));
    out.pageErrors = pageErrors;
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await context.close().catch(() => {});
    srv.close();
  }
})().catch((e) => {
  console.error('DIAG FAIL:', e.message);
  process.exit(1);
});

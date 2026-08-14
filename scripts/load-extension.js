// scripts/load-extension.js — chrome://extensions에서 압축해제 확장 로드 (파일 선택 대화상자 인터셉트)
// usage: node scripts/load-extension.js <webSocketUrl> <extensionDir>
const WebSocket = require('ws');
const wsUrl = process.argv[2];
const extDir = process.argv[3];

const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method === 'Page.fileChooserOpened') {
    console.log('FILE_CHOOSER:', JSON.stringify(msg.params));
    // backendNodeId 또는 mode로 폴더 선택 처리
    send('DOM.setFileInputFiles', {
      files: [extDir],
      backendNodeId: msg.params.backendNodeId,
    }).then(() => {
      console.log('SET_FILES_OK');
      setTimeout(() => { ws.close(); process.exit(0); }, 1500);
    }).catch((e) => {
      console.log('SET_FILES_ERR:', e.message);
      ws.close(); process.exit(1);
    });
  }
});

ws.on('open', async () => {
  try {
    await send('Page.enable');
    await send('Page.setInterceptFileChooserDialog', { enabled: true });
    // 개발자 모드 확인 + loadUnpacked 클릭
    const r = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const mgr = document.querySelector('extensions-manager');
          const root = mgr.shadowRoot;
          const toolbar = root.querySelector('extensions-toolbar');
          const tr = toolbar.shadowRoot;
          const devMode = tr.querySelector('#devMode');
          if (devMode && !devMode.checked) devMode.click();
          await new Promise(r => setTimeout(r, 300));
          const btn = tr.querySelector('#loadUnpacked');
          if (!btn) return { err: 'no loadUnpacked btn' };
          btn.click();
          return { clicked: true };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('CLICK:', JSON.stringify(r.result.value));
  } catch (e) {
    console.log('ERR:', e.message);
    ws.close(); process.exit(1);
  }
});

ws.on('error', (e) => { console.log('WS ERROR:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 20000);
// scripts/cdp-eval.js — CDP로 확장 페이지 평가 (테스트용)
// usage: node scripts/cdp-eval.js <webSocketUrl> <'js 코드'> [id]
const WebSocket = require('ws');
const url = process.argv[2];
const code = process.argv[3];
const id = process.argv[4] || 'eval-' + Date.now();

const ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 });
ws.on('open', () => {
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: code, awaitPromise: true, returnByValue: true },
    })
  );
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    if (msg.result && msg.result.exceptionDetails) {
      console.log(
        'EXCEPTION:',
        JSON.stringify(
          msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text
        )
      );
    } else if (msg.result && msg.result.result) {
      const r = msg.result.result;
      if (r.type === 'undefined') console.log('RESULT: undefined');
      else if (r.type === 'object' && r.subtype === 'error')
        console.log('ERROR:', r.description || r.value);
      else console.log('RESULT:', JSON.stringify(r.value ?? r.description ?? r, null, 2));
    } else {
      console.log('RAW:', JSON.stringify(msg).slice(0, 500));
    }
    ws.close();
    process.exit(0);
  }
});
ws.on('error', (e) => {
  console.log('WS ERROR:', e.message);
  process.exit(1);
});
setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(1);
}, 15000);

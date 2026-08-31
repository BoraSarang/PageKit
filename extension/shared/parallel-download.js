// shared/parallel-download.js — 단일 URL의 병렬 바이트-Range 수신 + 체크포인트 재개
// ┌ 역할 ─────────────────────────────────────────────
// │ HTTP Range를 지원하는 서버 대상으로 N개 연결이 disjoint 청크를 병렬 수신하고,
// │ 순서 버퍼로 청크를 하나씩 소비자(onChunk)에 전달한다. 실패 청크는 지수 백오프 재시도.
// │ chrome.storage.local 체크포인트로 중단 후 이어받기를 지원한다.
// │ Aura parallel-download.js 참고 — PageKit 규약(에러코드/진행 콜백) 적용.
// └───────────────────────────────────────────────────

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 4_000;

// 지정 URL이 HTTP Range를 수용하는지 탐지 (Content-Range 응답 확인)
export async function probeHttpRange(
  url,
  { headers = {}, signal = null, timeoutMs = 10_000 } = {}
) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    const r = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' }, signal: ctl.signal });
    if (!r.ok)
      return { ranges: false, total: null, contentType: r.headers.get('content-type') || '' };
    const cr = r.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)\s*$/);
    const total = m ? Number(m[1]) : null;
    await r.body?.cancel?.().catch(() => {});
    return {
      ranges: r.status === 206 || /^bytes /.test(cr),
      total,
      contentType: r.headers.get('content-type') || '',
    };
  } catch {
    return { ranges: false, total: null, contentType: '' };
  } finally {
    clearTimeout(t);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

async function fetchRange(
  url,
  start,
  end,
  { headers = {}, signal = null, timeoutMs = 30_000 } = {}
) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    const r = await fetch(url, {
      headers: { ...headers, Range: `bytes=${start}-${end}` },
      signal: ctl.signal,
    });
    if (!r.ok || r.status === 416) {
      const err = new Error(`HTTP ${r.status}`);
      err.code = 'E-CHR-DL-1007';
      throw err;
    }
    return await r.arrayBuffer();
  } finally {
    clearTimeout(t);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

// 병렬 Range 수신. startOffset부터 total까지 재개 가능.
// - headers: referer 등 원본 요청 헤더
// - onChunk(bytes:ArrayBuffer, offset): 순서대로 수신 (사용자가 저장·진행)
// - onProgress(written, total)
// - onCheckpoint(written, total): 주기/완료 시 이어받기 저장
export async function parallelDownload({
  url,
  total,
  headers = {},
  concurrency = 3,
  signal = null,
  retries = 3,
  offset = 0,
  onChunk = null,
  onProgress = null,
  onCheckpoint = null,
  chunkBytes = 4 * 1024 * 1024,
} = {}) {
  if (!Number.isFinite(total) || total <= 0)
    throw new Error('E-CHR-DL-1007: 총 크기를 알 수 없어 병렬 수신 불가');

  // 재개 오프셋을 청크 경계로 정렬
  const start = Math.max(0, offset);
  const ranges = [];
  for (let s = start; s < total; s += chunkBytes) {
    const e = Math.min(s + chunkBytes - 1, total - 1);
    ranges.push([s, e]);
  }
  if (!ranges.length) return;

  // results[i] = i번째 청크의 ArrayBuffer (완료 시). nextPipe부터 순서대로 소비.
  const results = new Array(ranges.length).fill(null);
  let nextPipe = 0;
  let written = start;
  let cursor = 0; // 할당 커서

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const flushReady = async () => {
    while (nextPipe < ranges.length && results[nextPipe] != null) {
      if (signal?.aborted) return;
      const buf = results[nextPipe];
      results[nextPipe] = null;
      if (onChunk) await onChunk(buf, ranges[nextPipe][0]);
      written += buf.byteLength;
      if (onProgress) onProgress(written, total);
      // 대략 32MB 단위 주기 체크포인트
      if (onCheckpoint && written % (32 * 1024 * 1024) < buf.byteLength)
        await onCheckpoint(written, total);
      nextPipe += 1;
    }
  };

  async function worker() {
    for (;;) {
      if (signal?.aborted) return;
      const idx = cursor;
      if (idx >= ranges.length) return;
      cursor += 1;
      const [s, e] = ranges[idx];
      let buf = null;
      let lastErr = null;
      for (let attempt = 0; attempt < retries; attempt++) {
        if (signal?.aborted) return;
        try {
          buf = await fetchRange(url, s, e, { headers, signal });
          break;
        } catch (err) {
          lastErr = err;
          if (signal?.aborted) return;
          if (attempt < retries - 1)
            await sleep(Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
        }
      }
      if (!buf) throw lastErr || new Error('E-CHR-DL-1007: 청크 수신 실패');
      results[idx] = buf;
      await flushReady();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(ranges.length, 1)) }, () =>
    worker()
  );
  await Promise.all(workers);
  if (signal?.aborted) return;
  if (onCheckpoint) await onCheckpoint(written, total);
}

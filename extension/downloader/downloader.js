// downloader/downloader.js — PageKit 스트림 다운로드 작업 창 (마스터 해석 → 세그먼트 병합 → 저장)
// ┌ 역할 구분 (이름 혼동 주의) ─────────────────────────────
// │ 역할: [작업창 UI] 다운로드 전용 팝업 창에서 실행 — 스트림 마스터 해석(m3u8/mpd/유튜브) → 세그먼트 병합 → chrome.downloads 저장
// │ 짝 파일: background/downloader.js = BG 배치 처리 | downloader/downloader.js = 작업창 UI
// └──────────────────────────────────────────────────────

globalThis.__PKDL_VER = 7;
// BG가 연 작은 팝업 창에서 실행. 확장 페이지라 fetch + Blob + chrome.downloads 전부 가능.
// 진행률은 BG로 전송 → 확장 아이콘 배지 표시. 완료 시 BG가 시스템 알림 + 10초 후 창 자동 닫기.

import {
  parseM3U8,
  fetchStreamText,
  fetchStreamBinary,
  parseMPD,
  MAX_STREAM_TOTAL,
  MAX_SEGMENTS,
  streamError,
} from '../shared/m3u8.js';
import { MSG } from '../shared/messages.js';

const $ = (id) => document.getElementById(id);
const DebugLogger = globalThis.DebugLogger;

const params = new URLSearchParams(location.search);
const JOB = {
  url: params.get('u') || '',
  name: params.get('n') || '',
  title: params.get('t') || '',
  folder: params.get('f') || 'page',
  tabId: Number(params.get('tid')) || null, // 페이지 컨텍스트 fetch 폴백용 (유튜브 googlevideo 등)
};

// 기본 파일명: 페이지 제목 우선 → URL 경로 이름 → stream (특수문자/길이 가드)
function defaultName() {
  const title = decodeURIComponent(JOB.title)
    .replace(/[\\/:*?"<>|\n\r\t]/g, '_')
    .trim()
    .slice(0, 80);
  if (title) return title;
  return (JOB.name || '').replace(/\.m3u8$/i, '') || 'stream';
}

let abortCtl = null; // 진행 중 취소용
let selectedVariant = null; // 해상도 드롭다운에서 사용자가 고른 변형
let lastDownloadId = null; // 완료 파일 (파일 위치 열기용)
let speedWin = []; // 최근 3개 세그먼트 수신 시간 (속도 이동 평균)

function setState(text) {
  $('dl-state').textContent = text;
  DebugLogger.info('DLWIN', text);
}

function setProgress(done, total, bytes, mbps = 0) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  $('dl-bar-fill').style.width = `${percent}%`;
  const mb = (bytes / 1048576).toFixed(1);
  const speed = mbps > 0 ? ` · ${mbps.toFixed(1)}MB/s` : '';
  $('dl-meta').textContent = `${done}/${total} 세그먼트 · ${mb}MB · ${percent}%${speed}`;
  chrome.runtime.sendMessage({ type: MSG.STREAM_PROGRESS, payload: { percent } }).catch(() => {});
}

function showResult(ok, title, msg, retry = false) {
  $('dl-progress').hidden = true;
  const box = $('dl-result');
  box.hidden = false;
  $('dl-result-title').textContent = title;
  $('dl-result-title').className = `dl-result-title ${ok ? 'ok' : 'err'}`;
  $('dl-result-msg').textContent = msg;
  $('dl-retry').hidden = !retry;
  $('dl-open').hidden = !ok;
  $('dl-start').disabled = false;
  $('dl-filename').disabled = false;
}

// 마스터면 화질 변형 드롭다운을 채운다 (기본 = 최고 화질). 마스터가 아니거나 fetch 실패 시 UI 없이 진행.
async function prepareQuality() {
  try {
    const m = parseM3U8(await fetchStreamText(JOB.url), JOB.url);
    if (!m.isMaster || m.variants.length < 2) return;
    const opts = [...m.variants].sort((a, b) => b.bandwidth - a.bandwidth);
    const sel = $('dl-quality-select');
    sel.innerHTML = opts
      .map((v, i) => {
        const label =
          [
            v.resolution || '',
            v.frameRate ? `${v.frameRate}fps` : '',
            `${(v.bandwidth / 1000).toFixed(0)}kbps`,
          ]
            .filter(Boolean)
            .join(' · ') || `변형 ${i + 1}`;
        return `<option value="${i}" ${i === 0 ? 'selected' : ''}>${label}</option>`;
      })
      .join('');
    selectedVariant = opts[0];
    sel.onchange = () => {
      selectedVariant = opts[sel.selectedIndex];
    };
    $('dl-quality').hidden = false;
    DebugLogger.info('DLWIN', `마스터 감지 — 화질 변형 ${opts.length}개 표시`);
  } catch {
    /* 변형 1개/세그먼트 매니페스트/fetch 실패 — 기존 흐름 유지 */
  }
}

function codeFrom(message) {
  const m = String(message || '').match(/E-CHR-DL-\d{4}/);
  return m ? m[0] : null;
}

function isM3u8Url(url) {
  return /\.m3u8(\?|#|$)/i.test(url || '');
}

function isMpdUrl(url) {
  return /\.mpd(\?|#|$)/i.test(url || '');
}

// DASH(mpd) — 파싱 + 화질 선택 (마스터형이면 최고 대역폭 Representation 자동 선택)
async function resolveMPD(url, depth = 0) {
  const d = parseMPD(await fetchStreamText(url), url);
  if (!d.isDash) throw streamError('E-CHR-DL-1003', 'DASH 매니페스트가 아닙니다.');
  if (d.error === 'LIVE') throw streamError('E-CHR-DL-1003', 'LIVE 스트림은 저장할 수 없습니다.');
  if (!d.segs.length)
    throw streamError(
      'E-CHR-DL-1003',
      'DASH 세그먼트를 해석하지 못했습니다. (SegmentList/SegmentTemplate/SegmentBase static만 지원)'
    );
  if (d.segs.length > MAX_SEGMENTS)
    throw streamError('E-CHR-DL-1003', '세그먼트가 너무 많아 LIVE 스트림으로 판단됩니다.');
  if (depth > 0) throw streamError('E-CHR-DL-1003', 'DASH 중첩 매니페스트는 지원하지 않습니다.');
  DebugLogger.info(
    'DLWIN',
    `DASH 해석 완료 segs=${d.segs.length} init=${!!d.initUrl}${d.onDemand ? ' on-demand' : ''} ${d.width}×${d.height} ${d.codecs}`
  );
  return d;
}

// mp4 등 단일 URL 직접 수신용 진행 표시 (바이트 단위 — Content-Length 있으면 %)
function setProgressBytes(bytes, totalBytes, mbps) {
  const percent = totalBytes > 0 ? Math.min(100, Math.round((bytes / totalBytes) * 100)) : 0;
  const mb = (bytes / 1048576).toFixed(1);
  const speed = mbps > 0 ? ` · ${mbps.toFixed(1)}MB/s` : '';
  const pct = totalBytes > 0 ? ` · ${percent}%` : '';
  $('dl-meta').textContent = `${mb}MB${pct}${speed}`;
  $('dl-bar-fill').style.width = `${percent}%`;
}

// Blob → chrome.downloads 저장 (m3u8 병합/direct 공통 — 완료 UI·알림·10초 자동 닫기 포함)
async function saveBlob(blob, ext) {
  setState('파일 저장 중…');
  const objectUrl = URL.createObjectURL(blob);
  let fileName = $('dl-filename').value.trim() || defaultName();
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  if (!/\.[a-z0-9]{1,6}$/i.test(fileName)) fileName += ext;
  const filename = `PageKit/${JOB.folder}/videos/${fileName}`;
  try {
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({ url: objectUrl, filename, conflictAction: 'uniquify' }, (id) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(id);
      });
    });
    lastDownloadId = downloadId;
    const sizeMb = (blob.size / 1048576).toFixed(1);
    DebugLogger.info('DLWIN', `스트림 저장 완료 ${sizeMb}MB → ${filename} id=${downloadId}`);
    showResult(
      true,
      '다운로드 완료',
      `${fileName} (${sizeMb}MB) 저장됨.\n위치: 다운로드 폴더 › ${filename}\n10초 후 창이 자동으로 닫힙니다.`
    );
    chrome.runtime
      .sendMessage({ type: MSG.STREAM_DONE, payload: { filename: fileName, sizeMb, downloadId } })
      .catch(() => {});
    // 창 자동 닫기: SW 타이머는 서비스 워커 수명과 함께 유실될 수 있어 창이 직접 닫는다.
    // 큐의 다음 작업이 오면 BG가 탭 URL을 교체(재로드)하므로 이 타이머는 자연 소멸한다.
    setTimeout(() => {
      window.close();
      chrome.runtime.sendMessage({ type: MSG.STREAM_CANCEL }).catch(() => {});
    }, 10000);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}

// 유튜브 googlevideo 등 단일 URL 직접 다운로드 (서명 URL — m3u8 파서 통과 불가)
// 확장 오리진 fetch(전체 수신 + 진행률) → CORS 실패 시 브라우저 다운로더 폴백
// 주의: 웨일 확장 페이지에서 AbortController가 fetch를 중단하지 못함 → Promise.race 기반 타임아웃/취소
async function downloadDirect() {
  setState('동영상 수신 중…');
  const tErr = (code, msg) => Object.assign(new Error(msg), { code });
  let cancelReject = null;
  const cancelP = new Promise((_, rej) => {
    cancelReject = rej;
  });
  const prevCancel = globalThis.__dlCancelCurrent;
  globalThis.__dlCancelCurrent = () =>
    cancelReject?.(tErr('E-CHR-DL-1004', '사용자가 다운로드를 취소했습니다.'));
  const cleanup = () => {
    globalThis.__dlCancelCurrent = prevCancel;
  };
  const connectP = new Promise((_, rej) =>
    setTimeout(
      () =>
        rej(
          tErr(
            'E-CHR-DL-1006',
            '스트림 서버가 응답하지 않습니다.\n유튜브 스트림 주소는 재생 중일 때만 유효합니다 — 영상을 다시 재생한 뒤 ⟳ 버튼으로 재분석하고 즉시 다운로드하세요.'
          )
        ),
      25000
    )
  ); // 서명 URL 무응답 대비 25초 제한
  const parts = [];
  let totalBytes = 0; // 총 크기 — Content-Range(청크) 또는 Content-Length에서 확보
  let received = 0; // 지금까지 수신한 바이트 (다음 Range offset 기준)
  let prevReceived = 0; // 직전 청크 시작 시점의 received
  const CHUNK = 1 << 20; // 1MB 청크 — googlevideo 등 서명 URL은 열린 Range(전체 GET)를 403으로 거부, 한정 Range만 허용
  let first = true;
  speedWin = [];
  let lastT = performance.now();
  const makeIdleP = () => {
    let timer = null;
    const p = new Promise((_, r) => {
      timer = setTimeout(
        () =>
          r(
            tErr(
              'E-CHR-DL-1006',
              '스트림 서버가 응답하지 않습니다.\n유튜브 스트림 주소는 재생 중일 때만 유효합니다 — 영상을 다시 재생한 뒤 ⟳ 버튼으로 재분석하고 즉시 다운로드하세요.'
            )
          ),
        15000
      );
    });
    return { p, timer };
  };

  // 페이지 컨텍스트 fetch 폴백 — googlevideo 등 서명 URL은 확장 오리진 fetch/브라우저 다운로더를 403으로 거부.
  // 유튜브 탭(MAIN world)에서 재생과 동일한 쿠키/Referer/Origin 조건으로 한정 Range 수신
  const pageFetchChunk = (url, range) =>
    new Promise((resolve) => {
      chrome.tabs.sendMessage(
        JOB.tabId,
        { type: 'pk.fetch.stream', payload: { url, range } },
        (res) => {
          if (chrome.runtime.lastError || !res?.ok) {
            DebugLogger.warn(
              'DLWIN',
              `페이지 fetch 실패 ${res?.status ?? '-'} (${chrome.runtime.lastError?.message || '페이지 응답 없음'}) ${range}`
            );
            resolve({
              ok: false,
              status: res?.status ?? null,
              error: chrome.runtime.lastError?.message || '페이지 응답 없음 (스크립트 미주입)',
            });
          } else {
            DebugLogger.debug(
              'DLWIN',
              `페이지 fetch 성공 status=${res.status} size=${res.size} ${range}`
            );
            resolve(res);
          }
        }
      );
    });
  // 페이지 fetch 응답 → fetch Response 호환 (기존 수신 로직 재사용)
  const pageResponseFrom = (pr) => {
    const bin = atob(pr.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let emitted = false;
    return {
      ok: true,
      status: 200,
      headers: {
        get: (n) => {
          const k = n.toLowerCase();
          if (k === 'content-range' && pr.total > 0) return `bytes 0-${pr.size - 1}/${pr.total}`;
          if (k === 'content-type') return pr.mime || null;
          if (k === 'content-length') return String(pr.size);
          return null;
        },
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (emitted) return { done: true };
            emitted = true;
            return { done: false, value: bytes.buffer };
          },
        }),
      },
    };
  };
  const expireMsg =
    '캡처된 주소가 만료되었거나 유효하지 않습니다.\n유튜브 스트림 주소는 재생 중일 때만 유효합니다 — 영상을 다시 재생한 뒤 ⟳ 버튼으로 재분석하고 즉시 다운로드하세요.';

  let viaPage = false; // 확장 fetch 401/403/실패 → 페이지 오리진 fetch로 전환
  try {
    for (;;) {
      let resp = null;
      try {
        if (viaPage) {
          if (!JOB.tabId) {
            DebugLogger.warn('DLWIN', '폴백 탭(tid) 없음 → 브라우저 다운로더 폴백');
            return downloadViaDownloads(); // 폴백 탭 없음 → 브라우저 다운로더
          }
          const pr = await Promise.race([
            pageFetchChunk(JOB.url, `bytes=${received}-${received + CHUNK - 1}`),
            connectP,
            cancelP,
          ]);
          if (!pr?.ok) {
            if (pr?.status === 401 || pr?.status === 403) {
              // 유튜브(googlevideo)는 브라우저 다운로더도 403 (v0.7.7 실측) — 기존 재생 안내 유지
              if (/googlevideo\.com/i.test(JOB.url)) throw streamError('E-CHR-DL-1005', expireMsg);
              // 틱톡 등 서명 CDN: 브라우저 다운로더(쿠키/Referer/UA 완전)로 마지막 시도
              DebugLogger.warn(
                'DLWIN',
                `페이지 fetch ${pr.status} → 브라우저 다운로더 폴백 (서명 CDN 대응)`
              );
              try {
                return await downloadViaDownloads();
              } catch (e) {
                DebugLogger.warn(
                  'DLWIN',
                  `브라우저 다운로더 폴백 실패 → 재생 안내 (${e.message.slice(0, 60)})`
                );
                throw streamError('E-CHR-DL-1005', expireMsg);
              }
            }
            throw new Error(pr?.error || '페이지 fetch 실패');
          }
          resp = pageResponseFrom(pr);
        } else {
          resp = await Promise.race([
            fetch(JOB.url, { headers: { Range: `bytes=${received}-${received + CHUNK - 1}` } }),
            connectP,
            cancelP,
          ]);
        }
      } catch (e) {
        cleanup();
        if (e?.code === 'E-CHR-DL-1004' || e?.code === 'E-CHR-DL-1006')
          throw streamError(e.code, e.message);
        if (!viaPage) {
          DebugLogger.info(
            'DLWIN',
            `확장 fetch 예외(${e.message.slice(0, 60)}) → 페이지 폴백 전환`
          );
          viaPage = true;
          continue; // 확장 fetch 불가 → 페이지 컨텍스트 시도
        }
        DebugLogger.warn(
          'DLWIN',
          `페이지 fetch 예외(${e.message.slice(0, 60)}) → 브라우저 다운로더 폴백`
        );
        return downloadViaDownloads(); // 페이지 경유도 불가 → 브라우저 다운로더
      }
      if (!resp.ok) {
        cleanup();
        // googlevideo 등 서명 URL은 확장 fetch(쿠키 없음)를 403으로 거부 → 페이지 오리진 fetch 폴백
        if (!viaPage && (resp.status === 401 || resp.status === 403)) {
          DebugLogger.info(
            'DLWIN',
            `확장 fetch ${resp.status} → 페이지 폴백 전환 ${JOB.url.slice(0, 70)}`
          );
          viaPage = true;
          continue;
        }
        if (viaPage) {
          DebugLogger.warn('DLWIN', `페이지 fetch 응답 ${resp.status} → 브라우저 다운로더 폴백`);
          return downloadViaDownloads();
        }
        throw streamError(
          'E-CHR-DL-1005',
          `캡처된 주소가 만료되었거나 유효하지 않습니다. (HTTP ${resp.status})\n동영상을 다시 재생한 뒤 분석해 주세요.`
        );
      }
      if (first) {
        first = false;
        // 유튜브 UMP/SABR(application/vnd.yt-ump 등) — 실제 미디어가 아닌 스트리밍 설정 응답 → 저장 불가 안내
        const respType = resp.headers.get('Content-Type') || '';
        if (/yt-ump|sabr/i.test(respType)) {
          cleanup();
          throw streamError(
            'E-CHR-DL-1006',
            '이 영상은 유튜브의 새 스트리밍 방식(UMP/SABR)으로만 제공되어 저장할 수 없습니다.\n저장 가능한 영상은 일반 HTTP 스트림을 제공하는 영상입니다.'
          );
        }
        // 총 크기 확보: Content-Range "bytes s-e/total" 우선, 없으면 Content-Length
        const cr = resp.headers.get('Content-Range');
        const m = cr && cr.match(/\/(\d+)\s*$/);
        if (m) totalBytes = Number(m[1]);
        else totalBytes = Number(resp.headers.get('Content-Length')) || 0;
      }
      const reader = resp.body.getReader();
      let idle = makeIdleP();
      try {
        for (;;) {
          let value = null;
          let done = false;
          try {
            ({ done, value } = await Promise.race([reader.read(), idle.p, cancelP]));
          } catch (e) {
            clearTimeout(idle.timer);
            if (e?.code === 'E-CHR-DL-1004' || e?.code === 'E-CHR-DL-1006')
              throw streamError(e.code, e.message);
            throw e;
          }
          if (done) break;
          if (!value || value.byteLength === 0) continue; // 0바이트 keepalive — idle 타이머 유지
          clearTimeout(idle.timer);
          idle = makeIdleP();
          parts.push(value);
          received += value.byteLength;
          if (received > MAX_STREAM_TOTAL)
            throw streamError('E-CHR-DL-1004', '스트림 용량이 300MB를 초과해 중단합니다.');
          const now = performance.now();
          speedWin.push({ bytes: value.byteLength, dt: (now - lastT) / 1000 });
          if (speedWin.length > 3) speedWin.shift();
          lastT = now;
          const agg = speedWin.reduce((a, s) => ({ bytes: a.bytes + s.bytes, dt: a.dt + s.dt }), {
            bytes: 0,
            dt: 0,
          });
          const mbps = agg.dt > 0 ? agg.bytes / 1048576 / agg.dt : 0;
          setProgressBytes(received, totalBytes, mbps);
        }
      } finally {
        clearTimeout(idle.timer);
      }
      const chunkGot = received - prevReceived;
      prevReceived = received;
      if (totalBytes > 0 && received >= totalBytes) break; // 마지막 청크 도달
      if (chunkGot < CHUNK) break; // 크기 정보 없음 + 마지막 청크 판정
    }
  } finally {
    cleanup();
  }
  await saveBlob(new Blob(parts, { type: 'video/mp4' }), '.mp4');
}

// CORS 차단 등 fetch 불가 시 폴백 — 브라우저 다운로더에 직접 전달 (진행률은 다운로드 목록에서)
async function downloadViaDownloads() {
  let fileName = $('dl-filename').value.trim() || defaultName();
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  if (!/\.[a-z0-9]{1,6}$/i.test(fileName)) fileName += '.mp4';
  const filename = `PageKit/${JOB.folder}/videos/${fileName}`;
  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url: JOB.url, filename, conflictAction: 'uniquify' }, (id) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(`E-CHR-DL-1005 브라우저 다운로드 실패 (${err.message})`));
      else resolve(id);
    });
  });
  lastDownloadId = downloadId;
  DebugLogger.info('DLWIN', `브라우저 다운로더 전송 ${filename} id=${downloadId}`);
  showResult(
    true,
    '다운로드 시작됨',
    `${fileName} — 브라우저 다운로드 목록에서 확인하세요.\n창을 닫아도 계속 진행됩니다.`
  );
  chrome.runtime.sendMessage({ type: MSG.STREAM_CANCEL }).catch(() => {});
  setTimeout(() => window.close(), 3000);
}

// 마스터 매니페스트를 최고 화질 변형까지 재귀 해석 (깊이 2 제한) → 세그먼트 매니페스트 정보
async function resolveManifest(url, depth = 0) {
  const text = await fetchStreamText(url);
  const m = parseM3U8(text, url);
  if (m.isMaster) {
    if (depth >= 2) throw streamError('E-CHR-DL-1003', '매니페스트 해석 깊이를 초과했습니다.');
    const best = m.variants.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a), m.variants[0]);
    if (!best) throw streamError('E-CHR-DL-1003', '품질 변형이 없는 마스터 매니페스트입니다.');
    DebugLogger.info('DLWIN', `마스터 매니페스트 → 최고 화질 변형 선택 (${best.bandwidth}b/s)`);
    setState(`품질 해석 중… (${(best.bandwidth / 1000).toFixed(0)}kbps)`);
    return resolveManifest(best.url, depth + 1);
  }
  if (m.hasKey) throw streamError('E-CHR-DL-1003', '암호화(AES-128) 스트림은 저장할 수 없습니다.');
  if (!m.segs.length) throw streamError('E-CHR-DL-1003', '매니페스트에 세그먼트가 없습니다.');
  // ENDLIST가 있는 VOD는 세그먼트 수와 무관하게 저장 (긴 영상 200개+ 오판 방지) —
  // LIVE 판단은 ENDLIST 부재 + 재요청 세그먼트 증가 비교로 수행
  if (!m.endlist && m.segs.length > MAX_SEGMENTS)
    throw streamError('E-CHR-DL-1003', '세그먼트가 너무 많아 LIVE 스트림으로 판단됩니다.');
  if (!m.endlist && m.playlistType !== 'VOD') {
    // ENDLIST가 없는 VOD(CDN에 따라 누락)를 LIVE와 구분: 0.5초 후 재요청해 세그먼트 수 비교
    const m2 = parseM3U8(await fetchStreamText(url), url);
    if (m2.segs.length > m.segs.length) {
      throw streamError('E-CHR-DL-1003', 'LIVE 스트림은 저장할 수 없습니다.');
    }
  }
  return m;
}

async function runDownload() {
  const startBtn = $('dl-start');
  startBtn.disabled = true;
  $('dl-filename').disabled = false; // 진행 중에도 파일명 변경 가능 — 저장 직전 최종값 반영
  $('dl-quality-select').disabled = true; // 화질은 시작 전에만 변경
  $('dl-result').hidden = true;
  $('dl-progress').hidden = false;
  $('dl-bar-fill').style.width = '0%';
  $('dl-meta').textContent = '';
  speedWin = [];

  abortCtl = new AbortController();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    DebugLogger.feature('DLWIN', `스트림 다운로드 시작 ${JOB.url.slice(0, 90)}`);
    // DASH(mpd): 매니페스트 → 초기화 세그먼트 + 미디어 세그먼트 병합
    if (isMpdUrl(JOB.url)) {
      setState('DASH 매니페스트 해석 중…');
      const d = await resolveMPD(JOB.url);
      const segs = d.segs;
      setState('세그먼트 수신 중…');
      const parts = [];
      let total = 0;
      // 초기화 세그먼트(moov 박스) 먼저 수신 — 실패 시 중단
      if (d.initUrl) {
        let initBuf = null;
        for (let attempt = 0; attempt < 2 && !initBuf; attempt++) {
          try {
            initBuf = await fetchStreamBinary(d.initUrl);
          } catch (e) {
            if (attempt === 0) await sleep(1200);
            else throw streamError('E-CHR-DL-1004', `초기화 세그먼트 수신 실패 (${e.message})`);
          }
        }
        parts.push(initBuf);
        total += initBuf.byteLength;
      }
      for (let i = 0; i < segs.length; i++) {
        if (abortCtl.signal.aborted)
          throw streamError('E-CHR-DL-1004', '사용자가 다운로드를 취소했습니다.');
        const t0 = performance.now();
        let buf = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            buf = await fetchStreamBinary(segs[i]);
            break;
          } catch (e) {
            lastErr = e;
            if (attempt === 0) await sleep(1200);
          }
        }
        if (!buf) {
          parts.length = 0;
          throw streamError(
            'E-CHR-DL-1004',
            `세그먼트 수신 실패 (${lastErr?.message || '알 수 없음'})`
          );
        }
        total += buf.byteLength;
        if (total > MAX_STREAM_TOTAL) {
          parts.length = 0;
          throw streamError('E-CHR-DL-1004', '스트림 용량이 300MB를 초과해 중단합니다.');
        }
        parts.push(buf);
        speedWin.push({ bytes: buf.byteLength, dt: (performance.now() - t0) / 1000 });
        if (speedWin.length > 3) speedWin.shift();
        const agg = speedWin.reduce((a, s) => ({ bytes: a.bytes + s.bytes, dt: a.dt + s.dt }), {
          bytes: 0,
          dt: 0,
        });
        const mbps = agg.dt > 0 ? agg.bytes / 1048576 / agg.dt : 0;
        setProgress(i + 1, segs.length, total, mbps);
        if (i + 1 < segs.length) await sleep(1200);
      }
      setState('파일 저장 중…');
      const blob = new Blob(parts, { type: 'video/mp4' });
      parts.length = 0;
      await saveBlob(blob, '.mp4');
      return;
    }
    // 유튜브 googlevideo 등 m3u8이 아닌 단일 URL → 직접 수신 모드
    if (!isM3u8Url(JOB.url)) return await downloadDirect();
    setState('매니페스트 해석 중…');
    const m = selectedVariant
      ? await resolveManifest(selectedVariant.url)
      : await resolveManifest(JOB.url);
    const segs = m.segs;
    setState('세그먼트 수신 중…');

    const parts = [];
    let total = 0;
    for (let i = 0; i < segs.length; i++) {
      if (abortCtl.signal.aborted)
        throw streamError('E-CHR-DL-1004', '사용자가 다운로드를 취소했습니다.');
      const t0 = performance.now();
      let buf = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          buf = await fetchStreamBinary(segs[i]);
          break;
        } catch (e) {
          lastErr = e;
          if (attempt === 0) await sleep(1200);
        }
      }
      if (!buf) {
        parts.length = 0;
        throw streamError(
          'E-CHR-DL-1004',
          `세그먼트 수신 실패 (${lastErr?.message || '알 수 없음'})`
        );
      }
      total += buf.byteLength;
      if (total > MAX_STREAM_TOTAL) {
        parts.length = 0;
        throw streamError('E-CHR-DL-1004', '스트림 용량이 300MB를 초과해 중단합니다.');
      }
      parts.push(buf);
      speedWin.push({ bytes: buf.byteLength, dt: (performance.now() - t0) / 1000 });
      if (speedWin.length > 3) speedWin.shift();
      const agg = speedWin.reduce((a, s) => ({ bytes: a.bytes + s.bytes, dt: a.dt + s.dt }), {
        bytes: 0,
        dt: 0,
      });
      const mbps = agg.dt > 0 ? agg.bytes / 1048576 / agg.dt : 0;
      setProgress(i + 1, segs.length, total, mbps);
      if (i + 1 < segs.length) await sleep(1200); // CDN/WAF 부하 분산 + 네트워크 서비스 보호
    }

    setState('파일 저장 중…');
    const blob = new Blob(parts, { type: 'video/mp2t' });
    parts.length = 0;
    await saveBlob(blob, '.ts');
  } catch (e) {
    const code = codeFrom(e.message);
    DebugLogger.error('[DLWIN] 스트림 다운로드 실패', e.message, { code });
    showResult(false, '다운로드 실패', e.message || '알 수 없는 오류', true);
    chrome.runtime
      .sendMessage({ type: MSG.STREAM_FAIL, payload: { code, message: e.message } })
      .catch(() => {});
  }
}

// --- UI 이벤트 ---
$('dl-start').addEventListener('click', runDownload);
$('dl-retry').addEventListener('click', () => {
  $('dl-result').hidden = true;
  runDownload();
});
$('dl-cancel').addEventListener('click', () => {
  if (abortCtl) abortCtl.abort();
  globalThis.__dlCancelCurrent?.(); // 웨일은 AbortController가 fetch를 못 죽임 → race 기반 취소
});
$('dl-close').addEventListener('click', () => {
  window.close();
  chrome.runtime.sendMessage({ type: MSG.STREAM_CANCEL }).catch(() => {});
});
$('dl-open').addEventListener('click', () => {
  if (lastDownloadId != null) chrome.downloads.show(lastDownloadId);
});

// 시작 시 자동 실행 (패널/팝업에서 이미 승인된 작업)
if (JOB.url && JOB.url.startsWith('http')) {
  $('dl-filename').value = defaultName();
  DebugLogger.feature(
    'DLWIN',
    `스트림 다운로드 창 열림 — 자동 시작 (기본 파일명: ${$('dl-filename').value})`
  );
  (async () => {
    if (isM3u8Url(JOB.url)) await prepareQuality(); // 유튜브 등 단일 URL은 화질 드롭다운 없이 직접 수신
    setTimeout(runDownload, 300);
  })();
}

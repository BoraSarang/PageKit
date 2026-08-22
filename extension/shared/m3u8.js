// shared/m3u8.js — HLS 매니페스트 파싱 + 스트림 다운로드 공통 (BG/작업창/패널 공유)

export const MAX_STREAM_TOTAL = 300 * 1024 * 1024; // 총 병합 용량 가드
export const MAX_SEGMENT_SIZE = 50 * 1024 * 1024; // 세그먼트 단일 용량 가드
export const MAX_SEGMENTS = 200; // 세그먼트 최대 개수 가드 (LIVE 오인 방지)
export const FETCH_TIMEOUT_MS = 15000; // 단일 요청 타임아웃

// m3u8 텍스트 → { segs, variants, hasKey, endlist, playlistType, isMaster }
// - 마스터 매니페스트(#EXT-X-STREAM-INF 존재): variants 목록만 있고 segs 없음
// - 세그먼트 매니페스트: segs 목록 (변형 URL이면 isMaster)
export function parseM3U8(text, baseUrl) {
  const segs = [];
  const variants = [];
  let hasKey = false;
  let endlist = false;
  let playlistType = null;
  let pendingVariant = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-KEY')) hasKey = true;
      if (line.startsWith('#EXT-X-ENDLIST')) endlist = true;
      if (line.startsWith('#EXT-X-PLAYLIST-TYPE')) {
        const mt = line.match(/:(VOD|EVENT|LIVE)/i);
        if (mt) playlistType = mt[1].toUpperCase();
      }
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bw = parseInt((line.match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10);
        const res = (line.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || null;
        const frame = (line.match(/FRAME-RATE=([\d.]+)/) || [])[1] || null;
        pendingVariant = {
          bandwidth: bw,
          resolution: res,
          frameRate: frame ? parseFloat(frame) : null,
        };
      }
      continue;
    }
    let abs = null;
    try {
      abs = new URL(line, baseUrl).href;
    } catch {
      continue;
    }
    if (pendingVariant) {
      variants.push({ ...pendingVariant, url: abs });
      pendingVariant = null;
    } else {
      segs.push(abs);
    }
  }
  return { segs, variants, hasKey, endlist, playlistType, isMaster: variants.length > 0 };
}

// 확장 오리진 fetch → ArrayBuffer (실패 시 throw, 타임아웃 가드 포함)
export async function fetchStreamBinary(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { credentials: 'include', signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_SEGMENT_SIZE) throw new Error('세그먼트가 50MB를 초과');
    return buf;
  } finally {
    clearTimeout(t);
  }
}

// m3u8 텍스트 응답 fetch
export async function fetchStreamText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  return new TextDecoder().decode(await fetchStreamBinary(url, timeoutMs));
}

// 스트림 저장 불가 사유 에러 팩토리
export function streamError(code, message) {
  return new Error(`${code}: ${message}`);
}

// ISO8601 기간 문자열 → 초 (P0Y0M0DT0H3M30.000S, PT0H1M0.1S 등 — Y/M/D/T/H/M/S 모두 지원)
function isoDurationToSeconds(value) {
  const m = String(value || '').match(
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
  );
  if (!m) return null;
  const Y = parseFloat(m[1] || '0'),
    Mo = parseFloat(m[2] || '0'),
    D = parseFloat(m[3] || '0');
  const H = parseFloat(m[4] || '0'),
    Mi = parseFloat(m[5] || '0'),
    S = parseFloat(m[6] || '0');
  return Y * 365 * 86400 + Mo * 30 * 86400 + D * 86400 + H * 3600 + Mi * 60 + S;
}

// MPD 텍스트 → { segs, initUrl, isDash, type, totalSeconds, codecs, width, height }
// 지원: static VOD의 SegmentTemplate(duration/timescale + mediaPresentationDuration), SegmentList,
//       SegmentBase(on-demand — 단일 파일 전체를 그대로 저장, segs=[파일 URL], onDemand=true).
// LIVE/다중 Period는 미지원 → segs 빈 배열 반환.
export function parseMPD(text, baseUrl) {
  const doc = new DOMParser().parseFromString(String(text), 'application/xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'MPD') return { isDash: false, segs: [], initUrl: null };
  if ((root.getAttribute('type') || 'static').toLowerCase() === 'dynamic') {
    return { isDash: true, segs: [], initUrl: null, live: true, error: 'LIVE' };
  }
  const mediaPresentationDuration = isoDurationToSeconds(
    root.getAttribute('mediaPresentationDuration')
  );
  const period = root.querySelector('Period');
  if (!period) return { isDash: true, segs: [], initUrl: null };
  // 비디오 적응 세트 우선, 없으면 오디오
  let as = period.querySelector(
    'AdaptationSet[contentType="video"], AdaptationSet[contentType="audio"]'
  );
  if (!as) as = period.querySelector('AdaptationSet');
  if (!as) return { isDash: true, segs: [], initUrl: null };
  // 최고 대역폭 Representation 선택
  const reps = [...as.querySelectorAll('Representation')];
  if (!reps.length) return { isDash: true, segs: [], initUrl: null };
  const rep = reps.reduce(
    (a, b) =>
      parseInt(b.getAttribute('bandwidth') || '0', 10) >
      parseInt(a.getAttribute('bandwidth') || '0', 10)
        ? b
        : a,
    reps[0]
  );
  const repBase = new URL(
    rep.querySelector('BaseURL')?.textContent || '.',
    new URL(as.querySelector('BaseURL')?.textContent || '.', baseUrl).href
  ).href;
  const meta = {
    isDash: true,
    segs: [],
    initUrl: null,
    type: 'mp4',
    totalSeconds: mediaPresentationDuration,
    codecs: rep.getAttribute('codecs') || '',
    width: rep.getAttribute('width') || '',
    height: rep.getAttribute('height') || '',
  };
  const resolve = (u) => {
    try {
      return new URL(u, repBase).href;
    } catch {
      return null;
    }
  };
  // 1) SegmentList: Initialization + SegmentURL 나열
  const segList =
    rep.querySelector('SegmentList') ||
    as.querySelector('SegmentList') ||
    period.querySelector('SegmentList');
  if (segList) {
    const init = segList.querySelector('Initialization')?.getAttribute('sourceURL');
    if (init) meta.initUrl = resolve(init);
    for (const su of segList.querySelectorAll('SegmentURL')) {
      const u = su.getAttribute('media');
      if (u) meta.segs.push(resolve(u));
    }
    if (meta.segs.length) return meta;
  }
  // 2) SegmentTemplate: duration/timescale로 세그먼트 수 계산
  const tmpl =
    rep.querySelector('SegmentTemplate') ||
    as.querySelector('SegmentTemplate') ||
    period.querySelector('SegmentTemplate');
  if (tmpl) {
    const init = tmpl.getAttribute('initialization');
    if (init)
      meta.initUrl = resolve(
        init
          .replace(/\$RepresentationID\$/g, rep.getAttribute('id') || '0')
          .replace(/\$Bandwidth\$/g, rep.getAttribute('bandwidth') || '0')
      );
    const mediaTmpl = tmpl.getAttribute('media');
    if (mediaTmpl) {
      const timescale = parseInt(tmpl.getAttribute('timescale') || '1', 10) || 1;
      const duration = parseInt(tmpl.getAttribute('duration') || '0', 10) || 0;
      const startNumber = parseInt(tmpl.getAttribute('startNumber') || '1', 10) || 1;
      if (duration > 0 && mediaPresentationDuration > 0) {
        const count = Math.max(1, Math.ceil(mediaPresentationDuration / (duration / timescale)));
        const repId = rep.getAttribute('id') || '0';
        const bw = rep.getAttribute('bandwidth') || '0';
        const name = (i) => {
          let u = mediaTmpl.replace(/\$RepresentationID\$/g, repId).replace(/\$Bandwidth\$/g, bw);
          u = u
            .replace(/\$Number\$/g, String(startNumber + i - 1))
            .replace(/\$Number%(\d+)d\$/g, (_, w) =>
              String(startNumber + i - 1).padStart(Number(w), '0')
            );
          const t = Math.round((startNumber + i - 1) * duration);
          u = u.replace(/\$Time\$/g, String(t));
          return u;
        };
        for (let i = 0; i < count; i++) {
          const u = resolve(name(i));
          if (u) meta.segs.push(u);
        }
        if (meta.segs.length) return meta;
      }
    }
  }
  // 3) SegmentBase (on-demand): 단일 파일 전체가 초기화+미디어 — 병합 없이 그대로 저장
  const segBase =
    rep.querySelector('SegmentBase') ||
    as.querySelector('SegmentBase') ||
    period.querySelector('SegmentBase');
  if (segBase) {
    // BaseURL이 미디어 파일 자체 (매니페스트 자신이면 비정상 구조로 간주)
    if (repBase !== baseUrl && !repBase.endsWith('/')) {
      meta.segs.push(repBase);
      meta.onDemand = true;
      return meta;
    }
  }
  return meta;
}

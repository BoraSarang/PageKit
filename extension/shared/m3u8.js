// shared/m3u8.js — HLS 매니페스트 파싱 + 스트림 다운로드 공통 (BG/작업창/패널 공유)

export const MAX_STREAM_TOTAL = 300 * 1024 * 1024 ; // 총 병합 용량 가드
export const MAX_SEGMENT_SIZE = 50 * 1024 * 1024 ;  // 세그먼트 단일 용량 가드
export const MAX_SEGMENTS = 200 ;                    // 세그먼트 최대 개수 가드 (LIVE 오인 방지)
export const FETCH_TIMEOUT_MS = 15000 ;              // 단일 요청 타임아웃

// m3u8 텍스트 → { segs, variants, hasKey, endlist, playlistType, isMaster }
// - 마스터 매니페스트(#EXT-X-STREAM-INF 존재): variants 목록만 있고 segs 없음
// - 세그먼트 매니페스트: segs 목록 (변형 URL이면 isMaster)
export function parseM3U8(text, baseUrl) {
  const segs = [] ;
  const variants = [] ;
  let hasKey = false ;
  let endlist = false ;
  let playlistType = null ;
  let pendingVariant = null ;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim() ;
    if (!line) continue ;
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-KEY')) hasKey = true ;
      if (line.startsWith('#EXT-X-ENDLIST')) endlist = true ;
      if (line.startsWith('#EXT-X-PLAYLIST-TYPE')) {
        const mt = line.match(/:(VOD|EVENT|LIVE)/i) ;
        if (mt) playlistType = mt[1].toUpperCase() ;
      }
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bw = parseInt((line.match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10) ;
        const res = (line.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || null ;
        const frame = (line.match(/FRAME-RATE=([\d.]+)/) || [])[1] || null ;
        pendingVariant = { bandwidth: bw, resolution: res, frameRate: frame ? parseFloat(frame) : null } ;
      }
      continue ;
    }
    let abs = null ;
    try { abs = new URL(line, baseUrl).href ; } catch { continue ; }
    if (pendingVariant) {
      variants.push({ ...pendingVariant, url: abs }) ;
      pendingVariant = null ;
    } else {
      segs.push(abs) ;
    }
  }
  return { segs, variants, hasKey, endlist, playlistType, isMaster: variants.length > 0 } ;
}

// 확장 오리진 fetch → ArrayBuffer (실패 시 throw, 타임아웃 가드 포함)
export async function fetchStreamBinary(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController() ;
  const t = setTimeout(() => ctl.abort(), timeoutMs) ;
  try {
    const r = await fetch(url, { credentials: 'include', signal: ctl.signal }) ;
    if (!r.ok) throw new Error(`HTTP ${r.status}`) ;
    const buf = await r.arrayBuffer() ;
    if (buf.byteLength > MAX_SEGMENT_SIZE) throw new Error('세그먼트가 50MB를 초과') ;
    return buf ;
  } finally {
    clearTimeout(t) ;
  }
}

// m3u8 텍스트 응답 fetch
export async function fetchStreamText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  return new TextDecoder().decode(await fetchStreamBinary(url, timeoutMs)) ;
}

// 스트림 저장 불가 사유 에러 팩토리
export function streamError(code, message) {
  return new Error(`${code}: ${message}`) ;
}

// background/stream-detector.js — HLS/DASH 스트림 URL 감지 + 유튜브 googlevideo 캡처 (T-20, WPageTools-9am)
// declarativeNetRequest 세션 규칙으로 .m3u8/.mpd 요청을 관찰 + webRequest로 googlevideo media 요청 캡처.
// 옵션(streamDetect) ON일 때만 활성화. 감지된 URL은 storage.session에 기록.

import { BGLogger } from './logger.js' ;
import * as storage from './storage.js' ;

const RULE_ID = 9001 ;
const CAPTURE_KEY = 'ytCaptured' ;
const MAX_CAPTURES = 5 ;

// 유튜브 DASH itag → 화질 라벨 (주요 itag — 나머지는 'itag N'으로 표시)
const ITAG_LABEL = {
  5: '240p', 6: '270p', 17: '144p', 18: '360p', 22: '720p', 34: '360p', 35: '480p', 36: '240p', 37: '1080p', 38: '3072p',
  43: '360p', 44: '480p', 45: '720p', 46: '1080p', 82: '360p', 83: '480p', 84: '720p', 85: '1080p',
  133: '240p', 134: '360p', 135: '480p', 136: '720p', 137: '1080p', 138: '2160p', 160: '144p',
  139: '오디오 48k', 140: '오디오 128k', 141: '오디오 256k', 256: '오디오 128k', 258: '오디오 128k',
  242: '240p', 243: '360p', 244: '480p', 247: '720p', 248: '1080p', 271: '1440p', 272: '2160p', 278: '144p',
  299: '720p60', 302: '720p60', 303: '1080p60', 308: '1440p60', 313: '2160p', 315: '2160p60',
  394: '144p', 395: '240p', 396: '360p', 397: '480p', 398: '720p', 399: '1080p', 400: '1440p', 401: '2160p', 402: '2160p60',
  601: '720p60', 602: '1080p60', 603: '1440p60', 604: '2160p60',
} ;
// 오디오 포함(progressive) itag — 그 외 video-only (DASH 분리 스트림)
const PROGRESSIVE_ITAGS = new Set([5, 6, 17, 18, 22, 34, 35, 36, 37, 38, 43, 44, 45, 46, 82, 83, 84, 85]) ;

function itagOf(url) {
  try { return Number(new URL(url).searchParams.get('itag')) || 0 ; }
  catch { return 0 ; }
}

// 스트림 식별 키 — itag 없이 서명된 URL(id=)만 있는 요청도 같은 스트림끼리 dedup
function streamKey(url) {
  try {
    const u = new URL(url) ;
    const itag = Number(u.searchParams.get('itag')) || 0 ;
    if (itag) return `itag-${itag}` ;
    const id = u.searchParams.get('id') ;
    if (id) return `id-${id}` ;
    return `url-${u.href}` ;
  } catch { return `url-${url}` ; }
}

// 전체(또는 처음부터) 다운로드 가능한 요청만 캡처 — range=0-0 등 부분 세그먼트는 다운로드 불가라 무시
function isFullRange(url) {
  try {
    const range = new URL(url).searchParams.get('range') ;
    return !range || range.startsWith('0-') ;
  } catch { return false ; }
}

let webRequestRegistered = false ;
// 응답 상태 확인 전까지 대기 중인 googlevideo 요청 (onBeforeRequest → onHeadersReceived 확정 방식)
const pendingRequests = new Map() ;

const onGooglevideo = (details) => {
  if (!details?.url || !details.url.includes('/videoplayback') || !isFullRange(details.url)) return ;
  pendingRequests.set(details.url, true) ;
} ;

// 2xx 응답(재생 성공) 요청만 캡처 — 서명 URL은 요청 전 상태로는 유효 여부를 알 수 없음 (403 응답 요청 제외)
const onGooglevideoResponse = (details) => {
  if (!pendingRequests.has(details.url)) return ;
  pendingRequests.delete(details.url) ;
  if (details.statusCode < 200 || details.statusCode >= 300) {
    BGLogger.debug('STREAM', `gv 응답 ${details.statusCode} 제외 ${details.url.slice(0, 100)}`) ;
    return ;
  }
  const itag = itagOf(details.url) ;
  const key = streamKey(details.url) ;
  storage.getSession(CAPTURE_KEY, []).then((list) => {
    if (!Array.isArray(list)) list = [] ;
    // 같은 스트림이 이미 있으면 첫 요청 우선 보존 (대표 URL 유지)
    if (list.some((c) => c.key === key)) return ;
    const cap = {
      url: details.url,
      key,
      itag,
      label: ITAG_LABEL[itag] || (itag ? `itag ${itag}` : ''),
      format: PROGRESSIVE_ITAGS.has(itag) ? 'progressive' : (itag ? 'video-only' : 'unknown'),
      capturedAt: Date.now(),
    } ;
    list.push(cap) ;
    if (list.length > MAX_CAPTURES) list.splice(0, list.length - MAX_CAPTURES) ;
    storage.setSession(CAPTURE_KEY, list) ;
    BGLogger.debug('STREAM', `유튜브 캡처 itag=${itag} (${cap.label || '라벨 없음'} · ${cap.format}) ${list.length}개`) ;
  }).catch(() => {}) ;
} ;

async function applyRules(enabled) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: enabled
        ? [{
            id: RULE_ID,
            priority: 1,
            action: { type: 'allow' },
            condition: {
              urlFilter: '||.m3u8',
              resourceTypes: ['xmlhttprequest', 'media', 'other'],
            },
          }]
        : [],
    }) ;
    // 유튜브 캡처 리스너 — streamDetect와 동일 스위치 (PLAN_v0.3 결정 사항 2)
    if (enabled && !webRequestRegistered) {
      chrome.webRequest.onBeforeRequest.addListener(onGooglevideo, { urls: ['*://*.googlevideo.com/*'] }) ;
      chrome.webRequest.onHeadersReceived.addListener(onGooglevideoResponse, { urls: ['*://*.googlevideo.com/*'] }) ;
      webRequestRegistered = true ;
    } else if (!enabled && webRequestRegistered) {
      chrome.webRequest.onBeforeRequest.removeListener(onGooglevideo) ;
      chrome.webRequest.onHeadersReceived.removeListener(onGooglevideoResponse) ;
      webRequestRegistered = false ;
      storage.setSession(CAPTURE_KEY, []).catch(() => {}) ;
    }
    BGLogger.info('STREAM', enabled ? '스트림 감지 규칙 활성화 (m3u8 + 유튜브 캡처)' : '스트림 감지 규칙 비활성화') ;
  } catch (e) {
    BGLogger.warn('STREAM', `규칙 적용 실패 (${e.message})`) ;
  }
}

export async function getCapturedStreams() {
  return await storage.getSession(CAPTURE_KEY, []) ;
}

export function initStreamDetector() {
  chrome.runtime.onMessage.addListener((message, _sender) => {
    if (message?.type === 'pk.settings.set' && message.payload && 'streamDetect' in message.payload) {
      applyRules(Boolean(message.payload.streamDetect)) ;
    }
    if (message?.type === 'pk.settings.get') {
      // 응답은 하지 않음 — SW의 SETTINGS_GET 핸들러가 실제 설정을 반환해야 함
      // (sendResponse 최초 호출만 유효 — 여기서 응답하면 data 없는 {ok:true}로 무효화됨)
      storage.getSettings().then((s) => {
        if (s.streamDetect) applyRules(true) ;
      }) ;
    }
    return false ;
  }) ;

  storage.getSettings().then((s) => applyRules(Boolean(s.streamDetect))) ;
  BGLogger.feature('BG', '스트림 감지 초기화 완료 (m3u8 + 유튜브)') ;
}
// background/stream-detector.js — HLS/DASH 스트림 URL 감지 (T-20)
// declarativeNetRequest 세션 규칙으로 .m3u8/.mpd 요청을 관찰.
// 옵션(streamDetect) ON일 때만 활성화. 감지된 URL은 storage.session에 기록.

import { BGLogger } from './logger.js' ;
import * as storage from './storage.js' ;

const RULE_ID = 9001 ;

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
    BGLogger.info('STREAM', enabled ? '스트림 감지 규칙 활성화 (m3u8)' : '스트림 감지 규칙 비활성화') ;
  } catch (e) {
    BGLogger.warn('STREAM', `규칙 적용 실패 (${e.message})`) ;
  }
}

export function initStreamDetector() {
  // 감지된 URL은 웹 요청 완료 시점에 확인 (dNR allow 규칙 + webNavigation 대체)
  // MV3에서 요청 URL 직접 관찰은 불가하므로, 콘텐츠 스크립트 수집과 병행:
  // 여기서는 규칙 관리만 담당하고 실제 URL 수집은 extractor의 DOM 수집이 담당.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'pk.settings.set' && message.payload && 'streamDetect' in message.payload) {
      applyRules(Boolean(message.payload.streamDetect)) ;
    }
    if (message?.type === 'pk.settings.get') {
      storage.getSettings().then((s) => {
        if (s.streamDetect) applyRules(true) ;
      }) ;
      sendResponse({ ok: true }) ;
      return false ;
    }
    return false ;
  }) ;

  storage.getSettings().then((s) => applyRules(Boolean(s.streamDetect))) ;
  BGLogger.feature('BG', '스트림 감지 초기화 완료') ;
}
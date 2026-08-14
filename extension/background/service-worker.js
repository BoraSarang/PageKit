// background/service-worker.js — PageKit MV3 백그라운드 서비스 워커 (진입점)

import { BGLogger } from './logger.js' ;
import { DebugLogger } from '../debug-module.js' ;
import { openSidePanel } from './sidepanel-controller.js' ;
import { MSG, msgOk, msgErr } from '../shared/messages.js' ;
import * as storage from './storage.js' ;
import { initDownloader, ensureReferer } from './downloader.js' ;
import { initStreamDetector, getCapturedStreams } from './stream-detector.js' ;

const RUN_SCRIPTS = [
  'debug.js',
  'node_modules/@mozilla/readability/Readability.js',
  'content/unlock.js',
  'content/extractor.js',
  'content/highlight.js',
  'content/float-button.js',
] ;

// 교차 오리진 iframe의 미디어(blob 재생 등)도 수집하기 위해 분석용 스크립트는 모든 프레임에 주입
const FRAME_SCRIPTS = [
  'debug.js',
  'node_modules/@mozilla/readability/Readability.js',
  'content/extractor.js',
] ;
const MAIN_SCRIPTS = [
  'debug.js', // float-button.js가 DebugLogger를 사용하므로 함께 주입
  'content/unlock.js',
  'content/highlight.js',
  'content/float-button.js',
] ;

// 주입 여부는 ping으로 실시간 검증 (세션 키는 페이지 리로드 후 스크립트가 사라져도 남아 있어 부정확)
async function ensureInjected(tabId, force = false) {
  if (!force) {
    try {
      const p = await chrome.tabs.sendMessage(tabId, { type: 'pk.ping' }, { frameId: 0 }) ;
      if (p?.ok) return true ;
    } catch { /* 스크립트 없음 → 재주입 */ }
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: FRAME_SCRIPTS,
  }) ;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: MAIN_SCRIPTS,
  }) ;
  return true ;
}

async function injectFloatButton(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['debug.js', 'content/float-button.js'],
  }) ;
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content/float-button.css'],
  }) ;
}

// --- 디버그 창 관리 (AGENTS.md 19장, Shop WiseBar 참고) ---
let _debugWinId = null ;

function openDebugWindow() {
  const url = chrome.runtime.getURL('debug-view.html') ;
  if (_debugWinId != null) {
    chrome.windows.update(_debugWinId, { focused: true }, () => {
      if (chrome.runtime.lastError) _debugWinId = null ;
    }) ;
    return ;
  }
  chrome.windows.create({ url, type: 'popup', width: 900, height: 640 }, (win) => {
    if (chrome.runtime.lastError || !win) return ;
    _debugWinId = win.id ;
    chrome.windows.onRemoved.addListener((removedId) => {
      if (removedId === _debugWinId) _debugWinId = null ;
    }) ;
  }) ;
  BGLogger.feature('BG', '디버그 창 열림') ;
}

// --- 스트림 다운로드 작업 창 관리 ---
// 다운로드는 독립 팝업 창(downloader.html)에서 수행 — 페이지 클릭/패널 닫힘과 무관하게 지속.
// 진행률은 배지, 완료는 시스템 알림 + 10초 후 자동 닫기.
let streamWinId = null ;
let streamBusy = false ;
let streamDownloadId = null ; // 완료된 파일 (알림 클릭 시 다운로드 항목 표시)
let streamQueue = [] ; // 대기 중인 스트림 작업 (여러 개 선택 시 순차 다운로드)

function streamWinUrl(job) {
  // downloader2: 웨일이 확장 페이지를 경로 기반으로 캐시해 html 수정이 반영 안 됨 → 캐시 우회용 별도 파일명
  const q = new URLSearchParams({ u: job.url, n: job.name || '', f: job.folder || 'page' }) ;
  if (job.title) q.set('t', job.title) ;
  if (job.referer) q.set('r', job.referer) ;
  return chrome.runtime.getURL(`downloader2/downloader2.html?${q.toString()}`) ;
}

async function openStreamWindow(job) {
  streamBusy = true ;
  if (job.referer) {
    try { await ensureReferer(new URL(job.url).hostname.replace(/^www\./, ''), job.referer) ; }
    catch (e) { BGLogger.warn('DL', `스트림 Referer 규칙 등록 실패 ${e.message}`) ; }
  }
  const url = streamWinUrl(job) ;
  if (streamWinId != null) {
    try {
      const win = await chrome.windows.get(streamWinId, { populate: true }) ;
      const tab = win?.tabs?.[0] ;
      if (tab) {
        await chrome.tabs.update(tab.id, { url }) ;
        await chrome.windows.update(streamWinId, { focused: true }) ;
        BGLogger.info('DL', `스트림 작업 창 재사용 win=${streamWinId}`) ;
        return ;
      }
    } catch { streamWinId = null ; }
  }
  const win = await chrome.windows.create({ url, type: 'popup', width: 520, height: 400, focused: true }) ;
  if (chrome.runtime.lastError || !win) {
    streamBusy = false ;
    nextStreamJob() ; // 창 생성 실패 시 다음 대기 작업으로
    return ;
  }
  streamWinId = win.id ;
  BGLogger.feature('DL', '스트림 다운로드 작업 창 열림') ;
}

// 큐의 다음 작업 시작 (완료/닫힘/생성 실패 시 호출)
function nextStreamJob() {
  if (streamQueue.length && streamWinId == null && !streamBusy) {
    const next = streamQueue.shift() ;
    BGLogger.info('DL', `대기열 다음 작업 시작 ${(next.url || '').slice(0, 70)}`) ;
    openStreamWindow(next).catch((e) => BGLogger.error('DL', `대기열 작업 열기 실패 ${e.message}`, { code: 'E-CHR-DL-1001' })) ;
  }
}

chrome.windows.onRemoved.addListener((removedId) => {
  if (removedId === streamWinId) {
    streamWinId = null ;
    streamBusy = false ;
    chrome.action.setBadgeText({ text: '' }).catch(() => {}) ;
    BGLogger.info('DL', '스트림 작업 창 닫힘 (다운로드 중단 가능)') ;
    nextStreamJob() ; // 닫힘 = 이 항목 포기 → 남은 대기 작업 자동 시작
  }
}) ;

chrome.notifications.onClicked.addListener(() => {
  if (streamDownloadId != null) {
    chrome.downloads.show(streamDownloadId) ;
    streamDownloadId = null ;
  }
}) ;

// --- 설치/시작 시 초기화 ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pk-analyze',
      title: 'PageKit으로 분석',
      contexts: ['page', 'selection', 'image', 'video', 'link'],
    }) ;
    chrome.contextMenus.create({
      id: 'pk-debug',
      title: 'PageKit 디버그 창 열기',
      contexts: ['action'],
    }) ;
  }) ;
  BGLogger.feature('BG', '확장 설치/업데이트 초기화 완료 (컨텍스트 메뉴 등록)') ;
}) ;

initDownloader({ ensureInjected }) ;
initStreamDetector() ;

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pk-analyze') {
    (async () => {
      await ensureInjected(tab.id) ;
      await openSidePanel('context', tab.windowId) ;
    })() ;
  } else if (info.menuItemId === 'pk-debug') {
    openDebugWindow() ;
  }
}) ;

// --- 키보드 단축키 (진입점 ③ + 디버그) ---
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'pagekit-open-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }) ;
    if (tab?.id != null) await ensureInjected(tab.id) ;
    await openSidePanel('shortcut') ;
  } else if (command === 'pagekit-toggle-debug') {
    openDebugWindow() ;
  }
}) ;

// --- 메시지 라우팅 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false ;
  const tabId = sender.tab?.id ;
  const tabUrl = sender.tab?.url ;

  switch (message.type) {
    // content 스크립트 로그 위임 → debugEnabled 확인 후 중앙 기록
    case 'DEBUG_LOG': {
      chrome.storage.local.get('debugEnabled', (v) => {
        if (!(v && v.debugEnabled)) return ;
        const entry = message.entry || {} ;
        if (tabId != null) entry.tabId = tabId ;
        if (tabUrl) entry.url = tabUrl ;
        chrome.storage.local.get('debugLog', (cur) => {
          let arr = Array.isArray(cur && cur.debugLog) ? cur.debugLog : [] ;
          arr = arr.concat([entry]).slice(-2000) ;
          chrome.storage.local.set({ debugLog: arr }) ;
        }) ;
      }) ;
      return false ;
    }
    case MSG.ENSURE_FRAMES: {
      // extractor가 협업에 실패(iframe이 주입 이후 로드됨)했을 때 iframe에 분석 스크립트 재주입
      // extractor.js는 __pkExtractorLoaded 가드가 있어 중복 주입 안전
      if (tabId == null) {
        sendResponse(msgErr('E-CHR-PERM-1001', '활성 탭이 없습니다.')) ;
        return false ;
      }
      BGLogger.debug('BG', `ENSURE_FRAMES 수신 senderTab=${tabId}`) ;
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: FRAME_SCRIPTS,
      })
        .then(() => sendResponse(msgOk()))
        .catch((e) => {
          BGLogger.error('BG', `iframe 주입 실패 tab=${tabId}: ${e.message}`, { code: 'E-CHR-PERM-1001' }) ;
          sendResponse(msgErr('E-CHR-PERM-1001', '권한이 없어 스크립트를 주입할 수 없습니다.')) ;
        }) ;
      return true ;
    }
    case MSG.ENSURE_INJECTED: {
      // 팝업/패널 등 확장 페이지 메시지엔 sender.tab이 없으므로 payload.tabId 우선
      const targetTabId = message.tabId ?? tabId ;
      BGLogger.debug('BG', `ENSURE_INJECTED 수신 senderTab=${tabId} msgTabId=${message.tabId} → ${targetTabId}`) ;
      if (targetTabId == null) {
        sendResponse(msgErr('E-CHR-PERM-1001', '활성 탭이 없습니다.')) ;
        return false ;
      }
      ensureInjected(targetTabId, message.force === true)
        .then(() => sendResponse(msgOk()))
        .catch((e) => {
          BGLogger.error('BG', `주입 실패 tab=${targetTabId}: ${e.message}`, { code: 'E-CHR-PERM-1001' }) ;
          sendResponse(msgErr('E-CHR-PERM-1001', '권한이 없어 스크립트를 주입할 수 없습니다.')) ;
        }) ;
      return true ;
    }
    case MSG.OPEN_SIDE_PANEL: {
      openSidePanel(message.source || 'popup').then(sendResponse) ;
      return true ;
    }
    case MSG.DOWNLOAD_STREAM: {
      // 스트림(m3u8) 다운로드 → 독립 작업 창에서 수행 (패널/팝업 어디서든 호출 가능)
      const p = message.payload || {} ;
      if (!p.url?.startsWith('http')) {
        sendResponse(msgErr('E-CHR-DL-1001', '유효한 스트림 URL이 없습니다.')) ;
        return false ;
      }
      if (streamBusy) {
        // 이미 진행 중 → 대기열에 추가 (완료 후 자동 순차 진행)
        streamQueue.push({ url: p.url, name: p.name, title: p.title, folder: p.folder, referer: p.referer }) ;
        BGLogger.info('DL', `스트림 다운로드 대기열 추가 (${streamQueue.length}개 대기)`) ;
        sendResponse(msgOk()) ;
        return false ;
      }
      openStreamWindow({ url: p.url, name: p.name, title: p.title, folder: p.folder, referer: p.referer })
        .catch((e) => BGLogger.error('DL', `스트림 작업 창 열기 실패 ${e.message}`, { code: 'E-CHR-DL-1001' })) ;
      sendResponse(msgOk()) ;
      return false ;
    }
    case MSG.GET_CAPTURED_STREAMS: {
      // 유튜브 googlevideo 캡처 목록 (webRequest — streamDetect ON일 때 수집)
      getCapturedStreams().then((caps) => sendResponse(msgOk(caps))) ;
      return true ;
    }
    case MSG.STREAM_PROGRESS: {
      const pct = Math.max(0, Math.min(100, message.payload?.percent ?? 0)) ;
      chrome.action.setBadgeText({ text: pct >= 100 ? '' : `${pct}%` }).catch(() => {}) ;
      return false ;
    }
    case MSG.STREAM_DONE: {
      const p = message.payload || {} ;
      streamDownloadId = p.downloadId ?? null ;
      chrome.action.setBadgeText({ text: '' }).catch(() => {}) ;
      if (streamQueue.length) {
        // 중간 완료 — 알림 없이 다음 항목 자동 시작 (창은 유지)
        BGLogger.info('DL', `항목 완료 — 다음 대기 작업 진행 (${streamQueue.length}개 남음)`) ;
        const next = streamQueue.shift() ;
        openStreamWindow(next).catch((e) => BGLogger.error('DL', `대기열 작업 열기 실패 ${e.message}`, { code: 'E-CHR-DL-1001' })) ;
        return false ;
      }
      // 마지막 작업 완료 — 시스템 알림 (창 자동 닫기는 다운로더가 10초 후 직접 수행:
      // SW 타이머는 서비스 워커 수명과 함께 유실될 수 있으므로 창 측에서 보장)
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: 'PageKit 스트림 저장 완료',
        message: `${p.filename || '동영상'} (${p.sizeMb || 0}MB) — 10초 후 창이 자동으로 닫힙니다.`,
      }).catch(() => {}) ;
      BGLogger.info('DL', `스트림 저장 완료 알림 ${p.filename} (${p.sizeMb}MB)`) ;
      return false ;
    }
    case MSG.STREAM_FAIL:
    case MSG.STREAM_CANCEL: {
      chrome.action.setBadgeText({ text: '' }).catch(() => {}) ;
      return false ;
    }
    case MSG.FLOAT_BUTTON_READY: {
      BGLogger.debug('FLOAT', `플로팅 버튼 준비됨 tab=${tabId}`) ;
      sendResponse(msgOk()) ;
      return false ;
    }
    case MSG.SETTINGS_GET: {
      storage.getSettings().then((s) => sendResponse(msgOk(s))) ;
      return true ;
    }
    case MSG.SETTINGS_SET: {
      storage.setSettings(message.payload || {}).then((s) => {
        BGLogger.info('SETTINGS', '설정 저장됨', s) ;
        sendResponse(msgOk(s)) ;
      }) ;
      return true ;
    }
    default:
      return false ;
  }
}) ;

chrome.runtime.onStartup.addListener(() => {
  BGLogger.info('BG', '브라우저 시작 감지') ;
}) ;

BGLogger.feature('BG', 'PageKit 백그라운드 서비스 워커 기동 완료') ;
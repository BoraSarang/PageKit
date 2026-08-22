// background/service-worker.js — PageKit MV3 백그라운드 서비스 워커 (진입점)

import { BGLogger } from './logger.js';
import { DebugLogger } from '../debug-module.js';
import { openSidePanel } from './sidepanel-controller.js';
import { MSG, msgOk, msgErr } from '../shared/messages.js';
import * as storage from './storage.js';
import { initDownloader, ensureReferer } from './downloader.js';
import { initStreamDetector, getCapturedStreams } from './stream-detector.js';

// HTML 리포트 생성 — shared/quality-rules.js 단일 구현 위임
const generateHtmlReport = (data) => globalThis.pkQualityRules.generateHtmlReport(data);

// 교차 오리진 iframe의 미디어(blob 재생 등)도 수집하기 위해 분석용 스크립트는 모든 프레임에 주입
const FRAME_SCRIPTS = [
  'debug.js',
  'node_modules/@mozilla/readability/Readability.js',
  'content/extractor.js',
  'shared/quality-rules.js',
  'content/quality-analyzer.js',
  'content/web-vitals.js',
  'content/a11y-scan.js',
];
const MAIN_SCRIPTS = ['debug.js', 'content/unlock.js', 'content/highlight.js'];

// 우클릭/복사 제한 해제 전용: 옵션(settings.unlockEnabled) ON이면 페이지 로드 시 자동 주입
// (manifest content_scripts 미사용 — 요청 시 주입 구조. unlock.js는 __pkUnlockLoaded 가드로 중복 안전)
async function maybeInjectUnlock(tabId, tabUrl) {
  if (!/^https?:/.test(tabUrl || '')) return;
  const s = await storage.getSettings();
  if (!s.unlockEnabled) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['debug.js', 'content/unlock.js'],
    });
  } catch (e) {
    BGLogger.debug('UNLOCK', `자동 주입 실패 tab=${tabId}: ${e.message}`);
  }
}

// 주입 여부는 ping으로 실시간 검증 (세션 키는 페이지 리로드 후 스크립트가 사라져도 남아 있어 부정확)
// 크롬 원문 영어 오류 → 사용자용 한국어 메시지 (내부 페이지·권한 계열)
function friendlyScriptError(e) {
  const m = String(e?.message || e || '');
  if (
    /chrome-extension|different extension|Cannot access contents|cannot be scripted|permission|host/i.test(
      m
    )
  ) {
    return '이 페이지는 분석할 수 없습니다. 일반 웹페이지(http/https)에서 실행해 주세요.';
  }
  return m || '알 수 없는 오류로 분석에 실패했습니다.';
}

async function ensureInjected(tabId, force = false) {
  if (!force) {
    try {
      const p = await chrome.tabs.sendMessage(tabId, { type: 'pk.ping' }, { frameId: 0 });
      if (p?.ok) return true;
    } catch {
      /* 스크립트 없음 → 재주입 */
    }
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: FRAME_SCRIPTS,
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: MAIN_SCRIPTS,
  });
  return true;
}

// --- 디버그 창 관리 (AGENTS.md 19장, Shop WiseBar 참고) ---
let _debugWinId = null;

function openDebugWindow() {
  const url = chrome.runtime.getURL('debug-view.html');
  if (_debugWinId != null) {
    chrome.windows.update(_debugWinId, { focused: true }, () => {
      if (chrome.runtime.lastError) _debugWinId = null;
    });
    return;
  }
  chrome.windows.create({ url, type: 'popup', width: 900, height: 640 }, (win) => {
    if (chrome.runtime.lastError || !win) return;
    _debugWinId = win.id;
    chrome.windows.onRemoved.addListener((removedId) => {
      if (removedId === _debugWinId) _debugWinId = null;
    });
  });
  BGLogger.feature('BG', '디버그 창 열림');
}

// --- 스트림 다운로드 작업 창 관리 ---
// v0.7: 다운로드는 항상 독립 팝업 창(downloader.html)에서 수행 — 요청마다 새 창(병렬).
// 진행률은 배지, 완료는 시스템 알림 + 10초 후 자동 닫기 (창 측에서 수행).
let streamDownloadId = null; // 완료된 파일 (알림 클릭 시 다운로드 항목 표시)

function streamWinUrl(job) {
  const q = new URLSearchParams({ u: job.url, n: job.name || '', f: job.folder || 'page' });
  if (job.title) q.set('t', job.title);
  if (job.referer) q.set('r', job.referer);
  if (job.tabId != null) q.set('tid', String(job.tabId)); // 페이지 컨텍스트 fetch 폴백용 (유튜브 googlevideo 등)
  return chrome.runtime.getURL(`downloader/downloader.html?${q.toString()}`);
}

async function openStreamWindow(job) {
  if (job.referer) {
    try {
      await ensureReferer(new URL(job.url).hostname.replace(/^www\./, ''), job.referer);
    } catch (e) {
      BGLogger.warn('DL', `스트림 Referer 규칙 등록 실패 ${e.message}`);
    }
  }
  const url = streamWinUrl(job);
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 520,
    height: 400,
    focused: true,
  });
  if (chrome.runtime.lastError || !win) {
    BGLogger.error('DL', '스트림 작업 창 열기 실패', { code: 'E-CHR-DL-1001' });
    return;
  }
  BGLogger.feature('DL', '스트림 다운로드 작업 창 열림');
}

chrome.windows.onRemoved.addListener(() => {
  // 다운로더 창이 닫히면 배지 정리 — 병렬 진행 중인 다른 창이 있으면 STREAM_PROGRESS로 재갱신됨
  chrome.action.setBadgeText({ text: '' }).catch(() => {});
});

chrome.notifications.onClicked.addListener(() => {
  if (streamDownloadId != null) {
    chrome.downloads.show(streamDownloadId);
    streamDownloadId = null;
  }
});

// --- 설치/시작 시 초기화 ---
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pk-analyze',
      title: 'PageKit으로 분석',
      contexts: ['page', 'selection', 'image', 'video', 'link'],
    });
    chrome.contextMenus.create({
      id: 'pk-analyze-quality',
      title: 'PageKit으로 품질 진단',
      contexts: ['page', 'selection', 'image', 'video', 'link'],
    });
    chrome.contextMenus.create({
      id: 'pk-debug',
      title: 'PageKit 디버그 창 열기',
      contexts: ['action'],
    });
  });
  // 최초 설치 시 온보딩(사용 설명) 페이지 열기
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    BGLogger.feature('BG', '온보딩 페이지 열림 (최초 설치)');
  }
  BGLogger.feature('BG', '확장 설치/업데이트 초기화 완료 (컨텍스트 메뉴 등록)');
});

initDownloader({ ensureInjected });
initStreamDetector();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pk-analyze' || info.menuItemId === 'pk-analyze-quality') {
    // 주의: sidePanel.open()은 사용자 제스처가 유지되는 동안만 성공 — await로 제스처가
    // 소멸하기 전에 openSidePanel을 동기 호출한다 (ensureInjected는 이후 fire-and-forget).
    const view = info.menuItemId === 'pk-analyze-quality' ? 'quality' : 'media';
    const targetTabId = tab?.id;
    if (targetTabId != null) {
      // 패널이 분석할 대상 탭을 세션에 기록 (활성 탭이 아닌 우클릭한 탭 분석)
      chrome.storage.session
        .set({ contextTarget: { tabId: targetTabId, url: tab.url || '', ts: Date.now() } })
        .catch(() => {});
      ensureInjected(targetTabId).catch(() => {});
    }
    openSidePanel('context', tab?.windowId, view);
  } else if (info.menuItemId === 'pk-debug') {
    openDebugWindow();
  }
});

// --- 키보드 단축키 (진입점 ③ + 디버그) ---
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'pagekit-open-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await ensureInjected(tab.id);
    // 단축키는 항상 미디어 패널로 복귀 (품질 패널에 갇히지 않게 경로 리셋)
    await openSidePanel('shortcut', null, 'media');
  } else if (command === 'pagekit-toggle-debug') {
    openDebugWindow();
  }
});

// --- 메시지 라우팅 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;

  switch (message.type) {
    // content 스크립트 로그 위임 → debugEnabled 확인 후 중앙 기록
    case 'DEBUG_LOG': {
      chrome.storage.local.get('debugEnabled', (v) => {
        if (!(v && v.debugEnabled)) return;
        const entry = message.entry || {};
        if (tabId != null) entry.tabId = tabId;
        if (tabUrl) entry.url = tabUrl;
        chrome.storage.local.get('debugLog', (cur) => {
          let arr = Array.isArray(cur && cur.debugLog) ? cur.debugLog : [];
          arr = arr.concat([entry]).slice(-2000);
          chrome.storage.local.set({ debugLog: arr });
        });
      });
      return false;
    }
    case MSG.ENSURE_FRAMES: {
      // extractor가 협업에 실패(iframe이 주입 이후 로드됨)했을 때 iframe에 분석 스크립트 재주입
      // extractor.js는 __pkExtractorLoaded 가드가 있어 중복 주입 안전
      if (tabId == null) {
        sendResponse(msgErr('E-CHR-PERM-1001', '활성 탭이 없습니다.'));
        return false;
      }
      BGLogger.debug('BG', `ENSURE_FRAMES 수신 senderTab=${tabId}`);
      chrome.scripting
        .executeScript({
          target: { tabId, allFrames: true },
          files: FRAME_SCRIPTS,
        })
        .then(() => sendResponse(msgOk()))
        .catch((e) => {
          BGLogger.error('BG', `iframe 주입 실패 tab=${tabId}: ${e.message}`, {
            code: 'E-CHR-PERM-1001',
          });
          sendResponse(msgErr('E-CHR-PERM-1001', '권한이 없어 스크립트를 주입할 수 없습니다.'));
        });
      return true;
    }
    case MSG.ENSURE_INJECTED: {
      // 팝업/패널 등 확장 페이지 메시지엔 sender.tab이 없으므로 payload.tabId 우선
      const targetTabId = message.tabId ?? tabId;
      BGLogger.debug(
        'BG',
        `ENSURE_INJECTED 수신 senderTab=${tabId} msgTabId=${message.tabId} → ${targetTabId}`
      );
      if (targetTabId == null) {
        sendResponse(msgErr('E-CHR-PERM-1001', '활성 탭이 없습니다.'));
        return false;
      }
      ensureInjected(targetTabId, message.force === true)
        .then(() => sendResponse(msgOk()))
        .catch((e) => {
          BGLogger.error('BG', `주입 실패 tab=${targetTabId}: ${e.message}`, {
            code: 'E-CHR-PERM-1001',
          });
          sendResponse(msgErr('E-CHR-PERM-1001', '권한이 없어 스크립트를 주입할 수 없습니다.'));
        });
      return true;
    }
    case MSG.OPEN_SIDE_PANEL: {
      openSidePanel(message.source || 'popup').then(sendResponse);
      return true;
    }
    case MSG.DOWNLOAD_STREAM: {
      // 스트림(m3u8) 다운로드 → 독립 작업 창에서 수행 (패널/팝업 어디서든 호출 가능)
      // v0.7: 대기열 없음 — 요청마다 항상 새 창을 열어 병렬 다운로드
      const p = message.payload || {};
      if (!p.url?.startsWith('http')) {
        sendResponse(msgErr('E-CHR-DL-1001', '유효한 스트림 URL이 없습니다.'));
        return false;
      }
      openStreamWindow({
        url: p.url,
        name: p.name,
        title: p.title,
        folder: p.folder,
        referer: p.referer,
        tabId: p.tabId ?? null,
      }).catch((e) =>
        BGLogger.error('DL', `스트림 작업 창 열기 실패 ${e.message}`, { code: 'E-CHR-DL-1001' })
      );
      sendResponse(msgOk());
      return false;
    }
    case MSG.GET_CAPTURED_STREAMS: {
      // 유튜브 googlevideo 캡처 목록 (webRequest — streamDetect ON일 때 수집)
      getCapturedStreams().then((caps) => sendResponse(msgOk(caps)));
      return true;
    }
    case MSG.STREAM_PROGRESS: {
      const pct = Math.max(0, Math.min(100, message.payload?.percent ?? 0));
      chrome.action.setBadgeText({ text: pct >= 100 ? '' : `${pct}%` }).catch(() => {});
      return false;
    }
    case MSG.STREAM_DONE: {
      const p = message.payload || {};
      streamDownloadId = p.downloadId ?? null;
      chrome.action.setBadgeText({ text: '' }).catch(() => {});
      // 완료 — 시스템 알림 (창 자동 닫기는 다운로더가 10초 후 직접 수행:
      // SW 타이머는 서비스 워커 수명과 함께 유실될 수 있으므로 창 측에서 보장)
      chrome.notifications
        .create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: 'PageKit 스트림 저장 완료',
          message: `${p.filename || '동영상'} (${p.sizeMb || 0}MB) — 10초 후 창이 자동으로 닫힙니다.`,
        })
        .catch(() => {});
      BGLogger.info('DL', `스트림 저장 완료 알림 ${p.filename} (${p.sizeMb}MB)`);
      return false;
    }
    case MSG.STREAM_FAIL:
    case MSG.STREAM_CANCEL: {
      chrome.action.setBadgeText({ text: '' }).catch(() => {});
      return false;
    }
    case MSG.SETTINGS_GET: {
      storage.getSettings().then((s) => sendResponse(msgOk(s)));
      return true;
    }
    case MSG.SETTINGS_SET: {
      storage.setSettings(message.payload || {}).then((s) => {
        BGLogger.info('SETTINGS', '설정 저장됨', s);
        if (s.unlockEnabled && message.payload?.unlockEnabled) {
          chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            const tab = tabs[0];
            if (tab?.id != null) maybeInjectUnlock(tab.id, tab.url);
          });
        }
        sendResponse(msgOk(s));
      });
      return true;
    }
    case MSG.QUALITY_GET_CONFIG: {
      (async () => {
        const { qualityAnalysis } = await chrome.storage.local.get('qualityAnalysis');
        const DEFAULT = {
          enabled: true,
          autoRun: true,
          modules: {
            seoMeta: true,
            headings: true,
            structuredData: true,
            imageSEO: true,
            linkSEO: true,
            contentQuality: true,
            coreWebVitals: true,
            resourceTiming: true,
            a11yScan: true,
          },
          thresholds: { lcp: 2500, inp: 200, cls: 0.1, a11yScore: 90, seoScore: 80 },
          axeCore: { enabled: true },
          exportFormat: 'json',
        };
        sendResponse({ ok: true, data: { ...DEFAULT, ...(qualityAnalysis || {}) } });
      })();
      return true;
    }
    case MSG.QUALITY_ANALYZE: {
      (async () => {
        // 옵션에서 품질 진단 기능이 꺼져 있으면 즉시 안내 (enabled 기본값 = 켬)
        const { qualityAnalysis } = await chrome.storage.local
          .get('qualityAnalysis')
          .catch(() => ({}));
        if (qualityAnalysis?.enabled === false) {
          sendResponse({
            ok: false,
            error: '품질 진단 기능이 꺼져 있습니다. PageKit 설정에서 켜주세요.',
            code: 'E-CHR-CFG-1001',
          });
          return;
        }
        // 대상 탭 결정: 명시 지정 > 활성 탭(http/s) > 최근 접근한 웹페이지.
        // 패널이 폴백 탭으로 열려 확장 페이지 자체가 '활성 탭'인 경우 자기 분석 시도를 방지함.
        let tabId = message.payload?.tabId;
        if (!tabId) {
          const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (active && /^https?:/i.test(active.url || '')) {
            tabId = active.id;
          } else {
            const webTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
            const recent = webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
            if (recent) tabId = recent.id;
          }
        }
        if (!tabId) {
          sendResponse({
            ok: false,
            error: '분석할 일반 웹페이지를 찾을 수 없습니다.',
            code: 'E-CHR-PERM-1002',
          });
          return;
        }
        try {
          // 브라우저 내부 페이지·타 확장 페이지는 분석 대상이 아님 — 주입 전에 차단해 한국어 안내만 반환
          const tab = await chrome.tabs.get(tabId).catch(() => null);
          if (!tab?.url || !/^https?:/i.test(tab.url)) {
            sendResponse({
              ok: false,
              error: '이 페이지는 분석할 수 없습니다. 일반 웹페이지(http/https)에서 실행해 주세요.',
              code: 'E-CHR-PERM-1002',
            });
            return;
          }
          // 품질 분석용 스크립트 + axe-core를 격리 월드에 주입 (멱등 — 스크립트별 가드 플래그 존재)
          await chrome.scripting.executeScript({
            target: { tabId },
            files: [
              'debug.js',
              'shared/quality-rules.js',
              'content/quality-analyzer.js',
              'content/web-vitals.js',
              'content/axe.min.js',
              'content/a11y-scan.js',
            ],
          });
          const response = await chrome.tabs.sendMessage(
            tabId,
            { type: 'pk.quality.analyze', payload: message.payload },
            { frameId: 0 }
          );
          if (!response?.ok) throw new Error(response?.error || '분석 실행 실패');
          sendResponse(response);
        } catch (e) {
          BGLogger.warn('QUALITY', `분석 실패 tab=${tabId}: ${e.message}`, {
            code: 'E-CHR-PERM-1002',
          });
          sendResponse({ ok: false, error: friendlyScriptError(e), code: 'E-CHR-PERM-1002' });
        }
      })();
      return true;
    }
    case MSG.QUALITY_EXPORT: {
      (async () => {
        try {
          const format = message.payload?.format || 'json';
          const ext = message.payload?.format === 'html' ? 'html' : 'json';
          const name =
            message.payload?.filename ||
            `quality-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
          const content =
            message.payload?.format === 'html'
              ? generateHtmlReport(message.payload.data)
              : JSON.stringify(message.payload.data, null, 2);
          const url = `data:${message.payload.format === 'html' ? 'text/html' : 'application/json'};charset=utf-8,${encodeURIComponent(content)}`;
          const downloadId = await chrome.downloads.download({
            url,
            filename: `PageKit/quality-reports/${name}`,
            saveAs: false,
          });
          sendResponse({ ok: true, downloadId });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }
    default:
      return false;
  }
});

chrome.runtime.onStartup.addListener(() => {
  BGLogger.info('BG', '브라우저 시작 감지');
});

// 우클릭/복사 제한 해제: 페이지 로드 완료 시 unlockEnabled ON이면 unlock.js 자동 주입
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  maybeInjectUnlock(tabId, tab.url);
});

BGLogger.feature('BG', 'PageKit 백그라운드 서비스 워커 기동 완료');

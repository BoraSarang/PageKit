// background/quality-handler.js — 품질 진단 메시지 핸들러 (SW 라우팅에서 위임)
// 게이트(enabled) → 대상 탭 결정 → 격리월드 주입 → 응답 보장(catch 필수)

import { BGLogger } from './logger.js';
import { MSG } from '../shared/messages.js';
import '../shared/quality-rules.js'; // generateHtmlReport 단일 구현(globalThis.pkQualityRules)

const generateHtmlReport = (data) => globalThis.pkQualityRules.generateHtmlReport(data);

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

export function handleQualityMessage(message, sender, sendResponse) {
  switch (message.type) {
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
}

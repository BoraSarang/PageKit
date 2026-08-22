// background/quality-runner.js — 품질 진단 백그라운드 러너 (설정 기반 실행 제어 + 내보내기)

import { BGLogger } from './logger.js';
import { MSG } from '../shared/messages.js';

const RUNNER_NAME = 'quality-runner';

export async function initQualityRunner() {
  // 설정 변경 리스너
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.qualityAnalysis) {
      BGLogger.feature(RUNNER_NAME, '품질 진단 설정 변경 감지', changes.qualityAnalysis.newValue);
    }
  });

  // 메시지 핸들러 등록
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'pk.quality.getConfig') {
      getConfig().then(config => sendResponse({ ok: true, data: config }));
      return true;
    }

    if (message?.type === 'pk.quality.analyze') {
      if (!sender.tab?.id) return sendResponse({ ok: false, error: '탭 없음' });
      runAnalysis(sender.tab.id, message.payload?.modules || {}).then(sendResponse);
      return true;
    }

    if (message?.type === 'pk.quality.export') {
      exportResult(message.payload).then(sendResponse);
      return true;
    }

    return false;
  });

  BGLogger.feature(RUNNER_NAME, '품질 진단 러너 초기화 완료');
}

// 설정 조회
async function getConfig() {
  const { qualityAnalysis } = await chrome.storage.local.get('qualityAnalysis');
  const DEFAULT = {
    enabled: true,
    autoRun: false,
    modules: { seoMeta: true, headings: true, structuredData: true, imageSEO: true, linkSEO: true, contentQuality: true, coreWebVitals: true, resourceTiming: true, a11yScan: true },
    thresholds: { lcp: 2500, inp: 200, cls: 0.1, a11yScore: 90, seoScore: 80 },
    axeCore: { enabled: true },
    exportFormat: 'json',
  };
  return { ...DEFAULT, ...(qualityAnalysis || {}) };
}

// 메인 프레임에서 분석 실행
async function runAnalysis(tabId, enabledModules = {}) {
  try {
    const config = await getConfig();
    if (!config.enabled) return { ok: false, error: '품질 진단 기능이 꺼져 있습니다.' };

    // 컨텐츠 스크립트가 주입되어 있는지 확인 후 분석 요청
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'pk.quality.analyze',
      payload: { modules: { ...config.modules, ...enabledModules } },
    }, { frameId: 0 });

    if (!response?.ok) {
      // 스크립트 미주입 시 주입 후 재시도
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['debug.js', 'content/quality-analyzer.js', 'content/web-vitals.js', 'content/a11y-scan.js'],
      });
      const retry = await chrome.tabs.sendMessage(tabId, {
        type: 'pk.quality.analyze',
        payload: { modules: { ...config.modules, ...enabledModules } },
      }, { frameId: 0 });
      if (retry?.ok) return { ok: true, data: retry.data };
      return { ok: false, error: retry?.error || '분석 실행 실패' };
    }

    return { ok: true, data: response.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 결과 내보내기 (JSON + HTML 리포트)
async function exportResult({ format = 'json', data, filename }) {
  try {
    const config = await getConfig();
    const ext = format === 'html' ? 'html' : 'json';
    const name = filename || `quality-report-${new Date().toISOString().slice(0,10)}.${ext}`;
    const url = `data:${format === 'html' ? 'text/html' : 'application/json'};charset=utf-8,${encodeURIComponent(format === 'html' ? generateHtmlReport(data) : JSON.stringify(data, null, 2))}`;

    const downloadId = await chrome.downloads.download({
      url,
      filename: `PageKit/quality-reports/${name}`,
      saveAs: false,
    });

    return { ok: true, downloadId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// HTML 리포트 생성 (shared/quality-rules.js의 로직과 동일)
function generateHtmlReport(data) {
  const { scores, coreWebVitals, modules, analyzedAt, url } = data;
  const catScores = { SEO: scores.seo, Performance: scores.performance, Accessibility: scores.a11y, 'Best Practices': scores.bestPractices };
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>PageKit 품질 진단 리포트</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:900px;margin:2rem auto;padding:0 1.5rem;line-height:1.6;color:#1f2937}
h1,h2,h3{color:#111827}.score{font-size:3rem;font-weight:700;text-align:center;margin:1rem 0}
.score-excellent{color:#059669}.score-good{color:#0d9488}.score-fair{color:#d97706}.score-poor{color:#dc2626}
.card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1.5rem;margin:1rem 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1rem 0}
.metric{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:1rem;text-align:center}
.metric .val{font-size:2rem;font-weight:700}.metric .lbl{color:#6b7280;font-size:.875rem}
.issue{padding:.75rem 1rem;margin:.5rem 0;border-radius:6px;border-left:4px solid}
.issue-critical{border-color:#dc2626;background:#fef2f2}.issue-major{border-color:#d97706;background:#fffbeb}
.issue-minor{border-color:#0d9488;background:#f0fdfa}.issue-info{border-color:#3b82f6;background:#eff6ff}
.issue .sev{font-weight:600;text-transform:uppercase;font-size:.75rem;margin-right:.5rem}
.issue .loc{font-family:monospace;font-size:.875rem;color:#6b7280}
.meta{color:#6b7280;font-size:.875rem;margin-top:1rem}
</style></head><body>
<h1>PageKit 품질 진단 리포트</h1>
<p class="meta">URL: ${url} | 분석 시각: ${new Date(analyzedAt).toLocaleString('ko-KR')}</p>

<div class="score score-${scores.overall>=90?'excellent':scores.overall>=70?'good':scores.overall>=50?'fair':'poor'}">${scores.overall}/100</div>

<div class="grid">
  <div class="metric"><div class="val">${scores.seo??'-'}</div><div class="lbl">SEO</div></div>
  <div class="metric"><div class="val">${scores.performance??'-'}</div><div class="lbl">성능</div></div>
  <div class="metric"><div class="val">${scores.a11y??'-'}</div><div class="lbl">접근성</div></div>
  <div class="metric"><div class="val">${scores.bestPractices??'-'}</div><div class="lbl">모범 사례</div></div>
</div>

<h2>Core Web Vitals</h2>
<div class="grid">
  <div class="metric"><div class="val">${coreWebVitals.lcp??'-'}ms</div><div class="lbl">LCP</div></div>
  <div class="metric"><div class="val">${coreWebVitals.inp??'-'}ms</div><div class="lbl">INP</div></div>
  <div class="metric"><div class="val">${coreWebVitals.cls??'-'}</div><div class="lbl">CLS</div></div>
  <div class="metric"><div class="val">${coreWebVitals.fcp??'-'}ms</div><div class="lbl">FCP</div></div>
  <div class="metric"><div class="val">${coreWebVitals.ttfb??'-'}ms</div><div class="lbl">TTFB</div></div>
</div>

${Object.entries(modules||{}).map(([k,v])=>v?`<div class="card"><h3>${k} <span style="font-weight:400;color:#6b7280">(${v.score}/100)</span></h3>${v.issues?.map(i=>`<div class="issue issue-${i.severity}"><span class="sev">${i.severity}</span>${i.location?'<span class="loc">'+i.location+'</span> ':''}${i.message}<br><small>${i.fix}</small></div>`).join('')||'<p style="color:#059669">이슈 없음</p>'}</div>`).join('')}

</body></html>`;
}

// 메시지 타입 추가 필요: shared/messages.js에 추가
// MSG.QUALITY_ANALYZE = 'pk.quality.analyze'
// MSG.QUALITY_GET_CONFIG = 'pk.quality.getConfig'
// MSG.QUALITY_EXPORT = 'pk.quality.export'
// MSG.QUALITY_FRAME_ANALYZE = 'pk.quality.frame.analyze'
// MSG.QUALITY_FRAME_RESULT = 'pk.quality.frame.result'
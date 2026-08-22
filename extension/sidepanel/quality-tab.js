// sidepanel/quality-tab.js — 품질 진단 UI 로직 (단독 사이드패널 전용)
// 옵션 autoRun(기본 켬): 패널 열림 즉시 분석 + 탭 전환/이동 시 자동 재분석
// autoRun 끔: 수동 "분석 시작" 버튼으로만 실행

import { MSG } from '../shared/messages.js';
import '../shared/quality-rules.js'; // 리포트 단일 구현(globalThis.pkQualityRules)

const STANDALONE = new URLSearchParams(location.search).has('auto');

const $ = (id) => document.getElementById(id);

const MODULES = [
  { key: 'seoMeta', label: '메타 태그', cat: 'SEO' },
  { key: 'headings', label: '헤딩 계층', cat: 'SEO' },
  { key: 'structuredData', label: '구조화 데이터', cat: 'SEO' },
  { key: 'imageSEO', label: '이미지 SEO', cat: 'SEO' },
  { key: 'linkSEO', label: '링크 분석', cat: 'SEO' },
  { key: 'contentQuality', label: '콘텐츠 품질', cat: 'Content' },
  { key: 'coreWebVitals', label: 'Core Web Vitals', cat: 'Performance' },
  { key: 'resourceTiming', label: '리소스 타이밍', cat: 'Performance' },
  { key: 'a11yScan', label: '접근성', cat: 'Accessibility' },
];

let currentResult = null;
let analyzing = false;

function init() {
  renderModuleChecks();
  bindEvents();
  loadSavedModules();
  if (STANDALONE) {
    // 옵션 autoRun(기본 켬)에 따라 즉시 분석 + 탭 추적 자동 재분석 활성화
    sendMessage({ type: 'pk.quality.getConfig' })
      .then((resp) => {
        const auto = resp?.data?.autoRun !== false;
        DebugLogger.feature('QUALITY', `품질 진단 단독 패널 모드 진입 (autoRun=${auto})`);
        if (auto) {
          runAnalysis({ manual: true });
          bindTabTracking();
        } else {
          setTargetBar('분석 대기', "'분석 시작' 버튼을 누르면 현재 페이지를 진단합니다");
        }
      })
      .catch(() => {
        // 설정 조회 실패 시 기본 동작(자동) 유지
        runAnalysis({ manual: true });
        bindTabTracking();
      });
  } else {
    checkAutoRun();
  }
}

// 단독 패널 모드: 탭 전환/페이지 이동 시 자동 재분석 (옵션 autoRun에 실시간 연동)
let reanalyzeTimer = null;
let tabHandlers = null;

function bindTabTracking() {
  if (tabHandlers) return; // 중복 바인딩 방지
  const schedule = () => {
    clearTimeout(reanalyzeTimer);
    reanalyzeTimer = setTimeout(() => {
      if (!analyzing) runAnalysis();
    }, 300);
  };
  const onUpdated = (_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') schedule();
  };
  chrome.tabs.onActivated.addListener(schedule);
  chrome.tabs.onUpdated.addListener(onUpdated);
  tabHandlers = { schedule, onUpdated };
}

function unbindTabTracking() {
  if (!tabHandlers) return;
  chrome.tabs.onActivated.removeListener(tabHandlers.schedule);
  chrome.tabs.onUpdated.removeListener(tabHandlers.onUpdated);
  clearTimeout(reanalyzeTimer);
  tabHandlers = null;
}

// 옵션 페이지에서 자동 분석을 토글하면 열려 있는 패널에 즉시 반영
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !STANDALONE || !changes.qualityAnalysis) return;
  const auto = changes.qualityAnalysis.newValue?.autoRun !== false;
  DebugLogger.feature('QUALITY', `옵션 변경 감지 — 자동 분석 ${auto ? '켬' : '끔'}`);
  if (auto) {
    bindTabTracking();
    runAnalysis(); // 현재 페이지 조용히 즉시 재진단
  } else {
    unbindTabTracking();
    setTargetBar('분석 대기', "'분석 시작' 버튼을 누르면 현재 페이지를 진단합니다");
  }
});

function renderModuleChecks() {
  const container = $('module-checks');
  container.innerHTML = MODULES.map(
    (m) => `
    <label class="check-item" data-module="${m.key}">
      <input type="checkbox" name="module" value="${m.key}" checked />
      <span>${m.label}</span>
      <span style="margin-left:auto;font-size:10px;color:var(--muted);">${m.cat}</span>
    </label>
  `
  ).join('');
}

function bindEvents() {
  $('btn-analyze').addEventListener('click', () => runAnalysis({ manual: true }));
  $('btn-check-all').addEventListener('click', () => setAllChecks(true));
  $('btn-uncheck-all').addEventListener('click', () => setAllChecks(false));
  $('btn-export-json').addEventListener('click', () => exportResult('json'));
  $('btn-export-html').addEventListener('click', () => exportResult('html'));
  $('btn-open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 모듈 체크박스 변경 시 저장
  document.querySelectorAll('input[name="module"]').forEach((el) => {
    el.addEventListener('change', saveModuleSelection);
  });
}

function setAllChecks(checked) {
  document.querySelectorAll('input[name="module"]').forEach((el) => {
    el.checked = checked;
  });
  saveModuleSelection();
}

function saveModuleSelection() {
  const mods = {};
  document.querySelectorAll('input[name="module"]').forEach((el) => {
    mods[el.value] = el.checked;
  });
  chrome.storage.local.set({ qualityModules: mods });
}

function loadSavedModules() {
  chrome.storage.local.get('qualityModules', (v) => {
    if (v.qualityModules) {
      document.querySelectorAll('input[name="module"]').forEach((el) => {
        el.checked = v.qualityModules[el.value] !== false;
      });
    }
  });
}

function checkAutoRun() {
  chrome.storage.local.get('qualityAnalysis', (v) => {
    if (v.qualityAnalysis?.autoRun && !analyzing) {
      runAnalysis();
    }
  });
}

async function runAnalysis({ manual = false } = {}) {
  if (analyzing) return;
  analyzing = true;
  updateUIState(true);

  const enabledModules = {};
  document.querySelectorAll('input[name="module"]').forEach((el) => {
    enabledModules[el.value] = el.checked;
  });

  try {
    const response = await sendMessage({
      type: 'pk.quality.analyze',
      payload: { modules: enabledModules },
    });
    if (!response?.ok) throw new Error(response?.error || '분석 실패');
    currentResult = response.data;
    renderResult(currentResult);
  } catch (e) {
    // 자동 경로(탭 추적·autoRun)는 조용히 건너뛰고, 수동 클릭에만 알림
    DebugLogger.warn('QUALITY', `분석 실패 (${manual ? '수동' : '자동'})`, e.message);
    setTargetBar('분석 실패', e.message || '');
    if (manual) alert('분석 실패: ' + e.message);
  } finally {
    analyzing = false;
    updateUIState(false);
  }
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function renderResult(result) {
  currentResult = result;
  const { scores, coreWebVitals, modules, issues, analyzedAt } = result;

  // 무엇을 분석했는지 + 측정 소요 (스냅샷 시점 명시)
  const dur = result.duration ? ` · ${(result.duration / 1000).toFixed(1)}s 소요` : '';
  setTargetBar(result.title || '제목 없음', `${result.url || ''}${dur}`);

  // 점수 표시
  show('score-card');
  show('charts-section');
  show('issues-section');
  show('export-bar');

  $('overall-score').textContent = scores.overall ?? '--';
  $('overall-score').className = `score-value ${scoreClass(scores.overall)}`;
  $('score-seo').textContent = scores.seo ?? '--';
  $('score-perf').textContent = scores.performance ?? '--';
  $('score-a11y').textContent = scores.accessibility ?? '--';
  $('score-bp').textContent = scores.content ?? '--';

  // CWV 게이지 (INP는 상호작용 전엔 미측정 — 별도 안내 문구)
  updateGauge('lcp', coreWebVitals.lcp, 2500);
  updateGauge('inp', coreWebVitals.inp, 200, '상호작용 필요');
  updateGauge('cls', coreWebVitals.cls, 0.1);

  // 리소스 폭포수
  renderWaterfall(result.modules?.resourceTiming?.summary?.slowest || []);

  // 이슈 리스트
  renderIssues(result.issues || []);
}

function updateGauge(key, value, threshold, emptyText = '--') {
  const valEl = $(`gauge-${key}-val`);
  const progEl = $(`gauge-${key}-progress`);
  if (!valEl || !progEl) return;

  let displayVal, pct;
  if (key === 'cls') {
    displayVal = value?.toFixed(3) ?? emptyText;
    pct = Math.min(100, ((value ?? 0) / threshold) * 100);
  } else {
    displayVal = value ?? emptyText;
    pct = Math.min(100, ((value ?? 0) / threshold) * 100);
  }
  valEl.textContent = displayVal;
  valEl.title = value == null && emptyText !== '--' ? emptyText : '';
  const offset = 264 * (1 - pct / 100);
  $(`gauge-${key}-progress`).style.strokeDashoffset = offset;
  $(`gauge-${key}-progress`).style.stroke = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#0d9488';
}

function renderWaterfall(slowest) {
  const container = $('waterfall');
  if (!slowest.length) {
    container.innerHTML =
      '<div style="text-align:center;color:var(--muted);padding:16px;">느린 리소스 없음</div>';
    return;
  }
  const maxDur = Math.max(...slowest.map((s) => s.duration)) || 1;
  container.innerHTML = slowest
    .map((s) => {
      // 한 줄 구성: [소요시간] [상대 막대] [URL …]
      const pct = Math.max(6, Math.round((s.duration / maxDur) * 100));
      const color = s.duration > 1000 ? '#dc2626' : s.duration > 500 ? '#d97706' : '#0d9488';
      const kb = Math.round((s.size || 0) / 1024);
      return `<div class="waterfall-item">
      <span class="waterfall-time">${s.duration}ms</span>
      <span class="waterfall-track"><i style="width:${pct}%;background:${color}"></i></span>
      <span class="waterfall-url" title="${s.url}${kb ? ` · ${kb}KB` : ''}">${s.url}</span>
    </div>`;
    })
    .join('');
}

function renderIssues(issues) {
  const container = $('issue-list');
  const countEl = $('issue-count');
  countEl.textContent = `${issues.length}개`;

  if (!issues.length) {
    container.innerHTML = `
      <div class="no-issues">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <div>이슈가 없습니다. 훌륭합니다!</div>
      </div>
    `;
    return;
  }

  // 심각도 순 정렬
  const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
  issues.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

  container.innerHTML = issues
    .map(
      (issue) => `
    <div class="issue issue-${issue.severity}">
      <div class="issue-header">
        <span class="issue-sev sev-${issue.severity}">${issue.severity}</span>
        <span class="issue-module">${issue.module || 'general'}</span>
        ${issue.location ? `<span class="issue-loc" title="${escapeHtml(issue.location)}">${escapeHtml(issue.location)}</span>` : ''}
      </div>
      <div class="issue-msg">${escapeHtml(issue.message)}</div>
      <div class="issue-fix">${escapeHtml(issue.fix || '')}</div>
    </div>
  `
    )
    .join('');
}

function updateUIState(isAnalyzing) {
  const btn = $('btn-analyze');
  btn.disabled = isAnalyzing;
  btn.textContent = isAnalyzing ? '분석 중...' : '분석 시작';
  if (isAnalyzing && !currentResult) setTargetBar('분석 중…', '');
  if (!isAnalyzing) {
    show('export-bar');
  }
}

// 분석 대상 표시줄 — 제목/URL 노출로 자동 수집 여부를 명확히
function setTargetBar(title, url) {
  const bar = $('analysis-target');
  if (!bar) return;
  $('target-title').textContent = title || '';
  $('target-url').textContent = url || '';
  bar.hidden = !(title || url);
}

function exportResult(format) {
  if (!currentResult) return alert('분석 결과가 없습니다.');
  const data = currentResult;
  const ext = format === 'html' ? 'html' : 'json';
  const name = `quality-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
  const content =
    format === 'html'
      ? globalThis.pkQualityRules.generateHtmlReport(currentResult)
      : JSON.stringify(currentResult, null, 2);
  const url = `data:${format === 'html' ? 'text/html' : 'application/json'};charset=utf-8,${encodeURIComponent(content)}`;
  chrome.downloads.download({ url, filename: `PageKit/quality-reports/${name}`, saveAs: false });
}


function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function scoreClass(score) {
  if (score == null) return 'score-poor';
  if (score >= 90) return 'score-excellent';
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-fair';
  return 'score-poor';
}

function show(id) {
  const el = $(id);
  if (el) el.style.display = '';
}

// 초기화
document.addEventListener('DOMContentLoaded', init);

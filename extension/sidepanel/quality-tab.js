// sidepanel/quality-tab.js — 품질 진단 UI 로직 (단독 사이드패널 전용)
// 옵션 autoRun(기본 켬): 패널 열림 즉시 분석 + 탭 전환/이동 시 자동 재분석
// autoRun 끔: 수동 "분석 시작" 버튼으로만 실행

import { MSG } from '../shared/messages.js';
import '../shared/quality-rules.js'; // 리포트 단일 구현(globalThis.pkQualityRules)
import '../shared/dom-utils.js';

const { $, escapeHtml } = globalThis.pkDom;

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

// SERP 미리보기 — Google 스타일 (desktop: title 60/desc 160, mobile: title 30/desc 120)
const SERP_LIMITS = {
  desktop: { title: 60, desc: 160 },
  mobile: { title: 30, desc: 120 },
};
let serpMode = 'desktop';
let brokenStatus = new Map();
let brokenList = [];

function init() {
  renderModuleChecks();
  bindEvents();
  loadSavedModules();
  bindSerpToggle();
  bindBrokenEvents();
  // 옵션 autoRun(기본 켬)에 따라 즉시 분석 + 탭 추적 자동 재분석 활성화
  sendMessage({ type: MSG.QUALITY_GET_CONFIG })
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
  if (area !== 'local' || !changes.qualityAnalysis) return;
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
  $('btn-analyze').addEventListener('click', () => {
    DebugLogger.feature('QUALITY', '수동 분석 클릭');
    runAnalysis({ manual: true });
  });
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

async function runAnalysis({ manual = false } = {}) {
  if (analyzing) return;
  const t0 = performance.now();
  analyzing = true;
  updateUIState(true);
  DebugLogger.info('QUALITY', `분석 실행 (${manual ? '수동' : '자동'})`);

  const enabledModules = {};
  document.querySelectorAll('input[name="module"]').forEach((el) => {
    enabledModules[el.value] = el.checked;
  });

  try {
    const response = await sendMessage({
      type: MSG.QUALITY_ANALYZE,
      payload: { modules: enabledModules },
    });
    if (!response?.ok) throw new Error(response?.error || '분석 실패');
    currentResult = response.data;
    renderResult(currentResult);
    DebugLogger.feature(
      'QUALITY',
      `분석 완료 ${Math.round(performance.now() - t0)}ms · 이슈 ${currentResult.totalIssues ?? 0}건`
    );
  } catch (e) {
    // 자동 경로(탭 추적·autoRun)는 조용히 건너뛰고, 수동 클릭에만 알림
    DebugLogger.warn('QUALITY', `분석 실패 (${manual ? '수동' : '자동'})`, e.message);
    const msg = e.message || '';
    setTargetBar('분석 실패', msg);
    if (msg.includes('꺼져 있습니다')) attachOptionsLink();
  } finally {
    analyzing = false;
    updateUIState(false);
  }
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // SW 미기동/무응답 — 원문 대신 명확한 코드로 변환해 UI 안내로 연결
        DebugLogger.error('QUALITY', '백그라운드 무응답', err.message);
        resolve({
          ok: false,
          error: 'PageKit 백그라운드가 응답하지 않습니다. 확장을 새로고침해 주세요.',
          code: 'E-CHR-SW-1001',
        });
        return;
      }
      resolve(resp);
    });
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

  // SERP 미리보기 (seoMeta.meta 데이터 기반)
  renderSerpPreview(result.modules?.seoMeta?.meta, result.url);

  // 깨진 링크 실측 카드 (linkSEO 내부 링크 존재 시)
  const internalLinks = result.modules?.linkSEO?.internalLinks || [];
  if (internalLinks.length) {
    show('broken-card');
  } else {
    const el = $('broken-card');
    if (el) el.style.display = 'none';
  }

  // 이슈 리스트
  renderIssues(result.issues || []);
}

function bindSerpToggle() {
  document.querySelectorAll('.serp-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      serpMode = btn.dataset.serif === 'desktop' ? 'desktop' : 'mobile';
      document.querySelectorAll('.serp-mode').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      const preview = $('serp-preview-body');
      if (preview) {
        preview.classList.toggle('is-mobile', serpMode === 'mobile');
      }
      // 현재 결과로 재렌더 (top-level currentResult 보존)
      const meta = currentResult?.modules?.seoMeta?.meta;
      if (meta) renderSerpPreview(meta, currentResult?.url);
    });
  });
}

// Google 스타일 SERP 스니펫 + title/description 길이 게이지
function renderSerpPreview(meta, pageUrl = '') {
  const card = $('serp-card');
  if (!card || !meta) return;
  card.style.display = '';

  const mode = SERP_LIMITS[serpMode];
  const title = meta.title || '';
  const desc = meta.description || '';
  const url = meta.canonical || pageUrl || '';

  const preview = $('serp-preview-body');
  const urlEl = preview.querySelector('.serp-url');
  const titleEl = preview.querySelector('.serp-snippet-title');
  const descEl = preview.querySelector('.serp-snippet-desc');
  preview.classList.toggle('is-mobile', serpMode === 'mobile');

  let displayUrl = url;
  if (displayUrl) {
    try {
      const u = new URL(displayUrl);
      displayUrl = u.hostname + u.pathname;
    } catch {}
  }
  urlEl.textContent = displayUrl || 'URL 없음';
  titleEl.textContent = title
    ? title.length > mode.title
      ? title.slice(0, mode.title) + '…'
      : title
    : '제목이 설정되지 않았습니다';
  descEl.textContent = desc
    ? desc.length > mode.desc
      ? desc.slice(0, mode.desc) + '…'
      : desc
    : '메타 설명이 설정되지 않았습니다';
  urlEl.classList.toggle('serp-dim', !url);
  titleEl.classList.toggle('serp-dim', !title);
  descEl.classList.toggle('serp-dim', !desc);

  // 길이 게이지: 최적 범위(title 30-60 / desc 120-160) 반영
  const gauges = [
    { label: 'TITLE', len: title.length, min: 30, max: mode.title, unit: 'chars' },
    {
      label: 'DESCRIPTION',
      len: desc.length,
      min: Math.min(120, mode.desc),
      max: mode.desc,
      unit: 'chars',
    },
  ];
  const val = (n, m) => (n > m ? m : n);
  $('serp-gauges').innerHTML = gauges
    .map((g) => {
      const pcnt = Math.min(100, Math.round((g.len / g.max) * 100));
      const color = g.len > g.max ? '#ef4444' : g.len < g.min ? '#f59e0b' : '#0d9f6e';
      return `<div class="serp-gauge">
        <span class="serp-gauge-label">${g.label}</span>
        <div class="serp-gauge-track"><i class="serp-gauge-fill" style="width:${pcnt}%;background:${color}"></i></div>
        <span class="serp-gauge-val">${val(g.len, g.max)}/${g.max}</span>
      </div>`;
    })
    .join('');
  DebugLogger.feature('QUALITY', `SERP 미리보기 렌더 (${serpMode})`);
}

function bindBrokenEvents() {
  $('btn-check-broken').addEventListener('click', checkBrokenLinks);
  $('btn-highlight-broken').addEventListener('click', () =>
    highlightBrokenLinks(!brokenHighlighted)
  );
}

// 내부 링크 HEAD 실측 (background 위임) — 동시성 5
async function checkBrokenLinks() {
  const internalLinks = currentResult?.modules?.linkSEO?.internalLinks || [];
  if (!internalLinks.length) return;
  const btn = $('btn-check-broken');
  const statusEl = $('broken-status-text');
  btn.disabled = true;
  btn.textContent = '확인 중…';
  statusEl.value = `내부 링크 ${internalLinks.length}건 확인 중… (동시성 5)`;
  DebugLogger.feature('QUALITY', `내부 링크 ${internalLinks.length}건 HEAD 실측 시작`);
  try {
    const resp = await sendMessage({
      type: MSG.QUALITY_CHECK_BROKEN_LINKS,
      payload: { urls: internalLinks.map((l) => l.url) },
    });
    if (!resp?.ok) throw new Error(resp?.error || '깨진 링크 확인 실패');
    const { broken, checked } = resp.data;
    brokenList = broken;
    brokenStatus = Object.keys(resp.data.statusMap || {}).reduce((m, k) => {
      m[k] = resp.data.statusMap[k];
      return m;
    }, {});

    // 이슈에 반영 (MAJOR)
    const issueList = currentResult.issues || [];
    const oldCount = issueList.filter((i) => i.module === 'linkSEO' && i.brk).length;
    for (let i = 0; i < oldCount; i++) {
      const idx = issueList.findIndex((x) => x.module === 'linkSEO' && x.brk);
      if (idx >= 0) issueList.splice(idx, 1);
    }
    broken.slice(0, 20).forEach((b) => {
      const text = internalLinks.find((l) => l.url === b.url)?.text || '';
      issueList.push({
        module: 'linkSEO',
        severity: SEVERITY_KEY.MAJOR,
        brk: true,
        location: b.url,
        message: `깨진 링크 — HTTP ${b.status}`,
        fix: text
          ? `"${text}" 링크가 열리지 않습니다. 대상 페이지/URL을 확인하세요.`
          : '대상 URL이 응답하지 않습니다.',
      });
    });
    renderIssues(issueList);
    $('issue-count').textContent = `${issueList.length}개`;

    // broken 목록 렌더
    renderBrokenList(broken);
  } catch (e) {
    statusEl.value = e.message || '깨진 링크 확인 실패';
    DebugLogger.error('QUALITY', '깨진 링크 실측 실패', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 내부 링크 확인';
  }
}

function renderBrokenList(broken) {
  const container = $('broken-list');
  const statusEl = $('broken-status-text');
  const hlBtn = $('btn-highlight-broken');
  if (!broken.length) {
    container.innerHTML =
      '<div style="color:var(--green);font-size:11px;">깨진 링크 없음 — 모든 내부 링크 정상입니다.</div>';
    hlBtn.style.display = 'none';
    statusEl.value = `${currentResult?.modules?.linkSEO?.internalLinks?.length || 0}건 확인 · 깨진 링크 0건`;
    return;
  }
  container.innerHTML = broken
    .slice(0, 30)
    .map(
      (b) =>
        `<div class="broken-item"><code>${escapeHtml(b.url)}</code><span class="brk-status">${b.status}</span></div>`
    )
    .join('');
  if (broken.length > 30) {
    container.innerHTML += `<div style="color:var(--muted);font-size:10px;">외 ${broken.length - 30}건…</div>`;
  }
  statusEl.value = `${broken.length}건 깨진 링크 발견`;
  hlBtn.style.display = '';
}

// 브로큰 링크 페이지 하이라이트 토글 (content 경유 — 요청 시에만 DOM 수정)
let brokenHighlighted = false;
async function highlightBrokenLinks(on) {
  if (!brokenList.length) return;
  const hlBtn = $('btn-highlight-broken');
  hlBtn.disabled = true;
  DebugLogger.feature('QUALITY', `브로큰 링크 페이지 강조 (${on}, ${brokenList.length}건)`);
  try {
    // 분석 대상 탭 = 활성 웹 탭 (패널이 열려도 활성 탭은 유지됨)
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = active?.id;
    if (!tabId) throw new Error('대상 탭을 찾을 수 없습니다');
    const statusMapObj = Object.fromEntries(brokenList.map((b) => [b.url, b.status]));
    const resp = await sendMessage({
      type: MSG.QUALITY_HIGHLIGHT_BROKEN_LINKS,
      payload: {
        // 해제 시 빈 목록 → content가 전체 클래스 제거
        urls: on ? brokenList.map((b) => b.url) : [],
        status: on ? statusMapObj : {},
        tabId,
      },
    });
    if (!resp?.ok) throw new Error(resp?.error || '강조 실패');
    brokenHighlighted = on;
    hlBtn.textContent = on
      ? `강조 해제 (${brokenList.length}건)`
      : `페이지에서 강조 (${brokenList.length}건)`;
  } catch (e) {
    DebugLogger.error('QUALITY', '브로큰 링크 강조 실패', e.message);
  } finally {
    hlBtn.disabled = false;
  }
}

// SEVERITY 상수 — quality-rules.js 전역에서 가져오기 (createIssue와 동일 소스)
const SEVERITY_KEY = globalThis.pkQualityRules?.SEVERITY || { MAJOR: 'major' };

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
// 기능 꺼짐(CFG-1001) 등 설정 유도가 필요한 경우 target-url 영역에 링크 부착
function attachOptionsLink() {
  const urlEl = document.getElementById('target-url');
  if (!urlEl) return;
  urlEl.textContent = '';
  const a = document.createElement('a');
  a.href = '#';
  a.textContent = '설정 열기 → 품질 진단 기능 켜기';
  a.style.cssText = 'color:var(--primary);text-decoration:underline;';
  a.addEventListener('click', (ev) => {
    ev.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  urlEl.appendChild(a);
}

function setTargetBar(title, url) {
  const bar = $('analysis-target');
  if (!bar) return;
  $('target-title').textContent = title || '';
  $('target-url').textContent = url || '';
  bar.hidden = !(title || url);
}

function exportResult(format) {
  DebugLogger.feature('QUALITY', `리포트 내보내기 클릭 (${format})`);
  if (!currentResult) {
    setTargetBar('내보낼 결과 없음', "먼저 '분석 시작'을 실행하세요");
    return;
  }
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

if (!globalThis.pkDom) throw new Error('pkDom 미로드 — dom-utils.js 먼저 포함 필요');
const { $, escapeHtml: esc } = globalThis.pkDom;

// debug-view.js — 디버그 뷰어 UI (classic; 공용 유틸은 pkDom) — PageKit 디버그 창 로직 (v0.1, Shop WiseBar 참고)
// chrome.windows.create로 연 전용 창 페이지 — 2초 폴링으로 storage 로그를 읽어 표시.
// 필터(레벨/탭/검색) + 전체 복사 + 지우기. 닫기 전까지 계속 누적 갱신.

let logs = [];
let paused = false;

function levelClass(level) {
  return (
    {
      ERROR: 'd-err',
      WARN: 'd-warn',
      PERF: 'd-perf',
      CACHE: 'd-cache',
      FEATURE: 'd-feature',
      DEBUG: 'd-debug',
    }[level] || ''
  );
}

function entryHtml(e) {
  const t = new Date(e.ts).toISOString().replace('T', ' ').slice(0, 23);
  const cls = levelClass(e.level);
  const scopeMark =
    e.scope === 'content'
      ? `[TAB${e.tabId != null ? ' ' + e.tabId : ''}]`
      : `[${(e.scope || 'ext').toUpperCase()}]`;
  let meta = '';
  if (e.tabId != null || e.url) {
    const parts = [];
    if (e.tabId != null) parts.push(`tab#${e.tabId}`);
    if (e.url) parts.push(e.url);
    meta = `<span class="d-meta">(${esc(parts.join(' · '))})</span>`;
  }
  const body = cls ? `<span class="${cls}">${esc(e.text)}</span>` : esc(e.text);
  return `<span class="d-meta">${t}</span> [${e.level}] ${scopeMark} ${body} ${meta}`;
}

function rebuildTabs() {
  const sel = $('fTab');
  const cur = sel.value;
  const tabSet = new Set();
  for (const e of logs) if (e.tabId != null) tabSet.add(e.tabId);
  const ids = [...tabSet].sort((a, b) => a - b);
  sel.innerHTML =
    '<option value="">전체</option>' +
    ids.map((id) => `<option value="${id}">탭 #${id}</option>`).join('');
  if (ids.includes(Number(cur))) sel.value = String(cur);
}

function filtered() {
  const lv = $('fLevel').value;
  const tab = $('fTab').value;
  const q = $('fText').value.trim().toLowerCase();
  return logs.filter((e) => {
    if (lv && e.level !== lv) return false;
    if (tab && String(e.tabId) !== tab) return false;
    if (
      q &&
      !(e.text || '').toLowerCase().includes(q) &&
      !((e.url || '') + '').toLowerCase().includes(q)
    )
      return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  const el = $('log');
  if (!rows.length) {
    el.textContent = '(로그 없음 — 페이지를 분석하거나 기능을 사용하면 여기에 쌓입니다)';
    $('count').textContent = '0';
    return;
  }
  el.innerHTML = rows.map(entryHtml).join('\n');
  $('count').textContent = `${rows.length} / ${logs.length}건`;
  el.scrollTop = el.scrollHeight;
}

async function refresh() {
  if (paused) return;
  try {
    logs = await DebugLogger.list(2000);
  } catch {
    return;
  }
  rebuildTabs();
  render();
}

async function copyAll() {
  const text = logs.map((e) => DebugLogger.format(e)).join('\n');
  try {
    await navigator.clipboard.writeText(text || '(로그 없음)');
    $('copyBtn').textContent = '복사됨';
    setTimeout(() => ($('copyBtn').textContent = '전체 복사'), 1500);
  } catch (e) {
    DebugLogger.warn('로그 복사 실패', e);
  }
}

function clearAll() {
  DebugLogger.clear();
  logs = [];
  refresh();
}

document.addEventListener('DOMContentLoaded', () => {
  // 디버그 창을 열면 로그 수집 자동 활성화 (상태 배너 표시)
  const statusBar = $('statusBar');
  const enableBtn = $('enableBtn');
  function refreshStatus() {
    const on = DebugLogger.isEnabled();
    statusBar.hidden = on;
    enableBtn.textContent = on ? '' : '로그 수집 켜기';
  }
  DebugLogger.setEnabled(true);
  enableBtn.addEventListener('click', () => {
    DebugLogger.setEnabled(true);
    refreshStatus();
  });
  refreshStatus();
  ['fLevel', 'fTab'].forEach((id) => $(id).addEventListener('change', render));
  $('fText').addEventListener('input', render);
  $('pauseBtn').addEventListener('click', () => {
    paused = !paused;
    $('pauseBtn').textContent = paused ? '재개' : '일시정지';
    if (!paused) refresh();
  });
  $('copyBtn').addEventListener('click', copyAll);
  $('clearBtn').addEventListener('click', clearAll);
  refresh();
  setInterval(refresh, 2000);
});

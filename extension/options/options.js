// options/options.js — 옵션 페이지 (우클릭 해제 / 사이트 규칙 / 프리셋 / 다운로드 설정)

import { MSG } from '../shared/messages.js';

const $ = (id) => document.getElementById(id);

async function get(key, fallback) {
  const v = await chrome.storage.local.get({ [key]: fallback });
  return v[key];
}
async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ---------- 사이트 규칙 ----------
async function renderRules() {
  const rules = await get('siteRules', {});
  $('pk-rule-list').innerHTML = Object.entries(rules)
    .map(
      ([d, r]) =>
        `<li>${d} → ${r.selectors || r} <button data-act="del" data-key="siteRules" data-val="${d}">✕</button></li>`
    )
    .join('');
}
$('pk-rule-add').addEventListener('click', async () => {
  const domain = $('pk-rule-domain').value.trim();
  const selector = $('pk-rule-selector').value.trim();
  if (!domain || !selector) return;
  const rules = await get('siteRules', {});
  rules[domain] = { selectors: selector };
  await set('siteRules', rules);
  $('pk-rule-domain').value = '';
  $('pk-rule-selector').value = '';
  renderRules();
});

// ---------- 프리셋 ----------
async function renderPresets() {
  const presets = await get('linkPresets', {});
  $('pk-preset-list').innerHTML = Object.entries(presets)
    .map(
      ([name, regex]) =>
        `<li>${name} · <code>${regex}</code> <button data-act="del" data-key="linkPresets" data-val="${name}">✕</button></li>`
    )
    .join('');
}
$('pk-preset-add').addEventListener('click', async () => {
  const name = $('pk-preset-name').value.trim();
  const regex = $('pk-preset-regex').value.trim();
  if (!name || !regex) return;
  try {
    new RegExp(regex);
  } catch {
    alert('정규식이 올바르지 않습니다.');
    return;
  }
  const presets = await get('linkPresets', {});
  presets[name] = regex;
  await set('linkPresets', presets);
  $('pk-preset-name').value = '';
  $('pk-preset-regex').value = '';
  renderPresets();
});

// ---------- 공통 삭제 ----------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act="del"]');
  if (!btn) return;
  const { key, val } = btn.dataset;
  const obj = await get(key, {});
  delete obj[val];
  await set(key, obj);
  renderRules();
  renderPresets();
});

// ---------- 다운로드 설정 ----------
const qs = new URLSearchParams(location.search);
if (qs.get('set') === 'streamDetect') {
  const payload = { streamDetect: true };
  chrome.runtime.sendMessage({ type: MSG.SETTINGS_SET, payload }).then(async () => {
    const after = await chrome.storage.local.get('settings');
    document.title = 'SD=' + Boolean(after.settings?.streamDetect);
    setTimeout(() => location.replace(location.pathname), 3000);
  });
}
if (qs.get('caps') === '1') {
  chrome.storage.session.get('ytCaptured').then((v) => {
    const caps = v.ytCaptured || [];
    document.title =
      'CAPS=' + caps.length + ' | ' + caps.map((c) => `itag=${c.itag} ${c.label}`).join(', ');
  });
}
if (qs.get('capurl')) {
  chrome.storage.session.get('ytCaptured').then((v) => {
    const caps = v.ytCaptured || [];
    const c = caps.find((x) => String(x.itag) === qs.get('capurl')) || caps[0];
    document.title = c ? c.url : 'NO CAP';
  });
}
if (qs.get('capidx')) {
  chrome.storage.session.get('ytCaptured').then((v) => {
    const caps = v.ytCaptured || [];
    const c = caps[Number(qs.get('capidx'))];
    document.title = c ? c.url : 'NO CAP';
  });
}
if (qs.get('logs') === '1') {
  chrome.storage.local.get('debugLog').then((v) => {
    const logs = (v.debugLog || [])
      .filter((l) => /STREAM|캡처|유튜브|규칙|웹 요청/.test(l.text || l))
      .slice(-12);
    document.title =
      'LOGS | ' + logs.map((l) => (typeof l === 'string' ? l : l.text)).join(' /// ');
  });
}

// 부팅 오류 배너 — 일부 설정 로드 실패 시에도 나머지가 동작하도록 격리 표시
function showBootError(msg) {
  DebugLogger.error('OPTIONS', '설정 로드 실패', msg);
  let el = document.getElementById('pk-boot-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pk-boot-error';
    el.style.cssText =
      'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;' +
      'padding:8px 12px;margin-bottom:12px;font-size:12px;white-space:pre-line;';
    document.querySelector('.pk-wrap').prepend(el);
  }
  el.textContent += (el.textContent ? '\n' : '') + msg;
}

async function bootSafe(name, fn) {
  try {
    await fn();
  } catch (e) {
    showBootError(`${name} 로드 실패: ${e.message || e}`);
  }
}

if (qs.get('dl')) {
  // 테스트 훅: BG의 실제 다운로드 흐름 경유 (chrome.windows.create — 서명 URL 그대로 전달)
  chrome.runtime
    .sendMessage({
      type: MSG.DOWNLOAD_STREAM,
      payload: {
        url: qs.get('dl'),
        name: qs.get('n') || '테스트',
        title: qs.get('t') || '',
        folder: qs.get('f') || 'youtube',
        referer: qs.get('r') || '',
      },
    })
    .then((resp) => {
      document.title = resp?.ok ? 'DL SENT' : 'DL ERR ' + JSON.stringify(resp || {});
    });
}
async function loadSettings() {
  const resp = await chrome.runtime.sendMessage({ type: MSG.SETTINGS_GET });
  if (!resp?.ok) throw new Error(resp?.error || '백그라운드 응답 없음');
  const s = resp.data || {};
  $('pk-concurrent').value = s.concurrentDownloads ?? 3;
  $('pk-min-width').value = s.minImageWidth ?? 0;
  $('pk-min-size').value = s.minImageSize ?? 0;
  $('pk-stream-detect').checked = Boolean(s.streamDetect);
  $('pk-stream-max').value = String(s.streamMaxMB ?? 0);
  $('pk-unlock-enabled').checked = Boolean(s.unlockEnabled);
  $('pk-fallback-ua').value = s.fallbackMobileUA || '';
}
$('pk-unlock-enabled').addEventListener('change', async () => {
  const on = $('pk-unlock-enabled').checked;
  DebugLogger.feature('OPTIONS', `우클릭/복사 제한 해제 ${on ? '켬' : '끔'}`);
  const resp = await chrome.runtime.sendMessage({
    type: MSG.SETTINGS_SET,
    payload: { unlockEnabled: on },
  });
  if (!resp?.ok) {
    $('pk-unlock-enabled').checked = !on; // 백그라운드 무응답/실패 시 UI 원복
    showBootError(
      '설정 적용 실패 — PageKit 백그라운드가 응답하지 않습니다. 확장을 새로고침해 주세요.'
    );
  }
});
$('pk-save-settings').addEventListener('click', async () => {
  const payload = {
    concurrentDownloads: Math.max(1, parseInt($('pk-concurrent').value, 10) || 3),
    minImageWidth: Math.max(0, parseInt($('pk-min-width').value, 10) || 0),
    minImageSize: Math.max(0, parseInt($('pk-min-size').value, 10) || 0),
    streamDetect: $('pk-stream-detect').checked,
    streamMaxMB: Math.max(0, parseInt($('pk-stream-max').value, 10) || 0),
    fallbackMobileUA: $('pk-fallback-ua').value.trim(),
  };
  DebugLogger.feature('OPTIONS', '설정 저장', payload);
  await chrome.runtime.sendMessage({ type: MSG.SETTINGS_SET, payload });
  alert('설정이 저장되었습니다.');
});

// ---------- 디버그 ----------
async function loadDebug() {
  const v = await chrome.storage.local.get('debugEnabled');
  $('pk-debug-enabled').checked = v.debugEnabled !== false;
}
$('pk-debug-enabled').addEventListener('change', () => {
  DebugLogger.setEnabled($('pk-debug-enabled').checked);
  DebugLogger.feature('OPTIONS', `디버그 로그 수집 ${$('pk-debug-enabled').checked ? '켬' : '끔'}`);
});

// ---------- 품질 진단 설정 ----------
async function loadQuality() {
  const q = await get('qualityAnalysis', {});
  $('pk-quality-enabled').checked = q.enabled !== false;
  $('pk-quality-auto-run').checked = q.autoRun === true;
  const mods = q.modules || {};
  document.querySelectorAll('input[name="quality-module"]').forEach((el) => {
    el.checked = mods[el.value] !== false;
  });
  const th = q.thresholds || {};
  $('pk-threshold-lcp').value = th.lcp ?? 2500;
  $('pk-threshold-inp').value = th.inp ?? 200;
  $('pk-threshold-cls').value = th.cls ?? 0.1;
  $('pk-threshold-a11y').value = th.a11yScore ?? 90;
  $('pk-threshold-seo').value = th.seoScore ?? 80;
  $('pk-axe-enabled').checked = q.axeCore?.enabled !== false;
}
async function saveQuality() {
  const mods = {};
  document.querySelectorAll('input[name="quality-module"]').forEach((el) => {
    mods[el.value] = el.checked;
  });
  const payload = {
    enabled: $('pk-quality-enabled').checked,
    autoRun: $('pk-quality-auto-run').checked,
    modules: mods,
    thresholds: {
      lcp: parseInt($('pk-threshold-lcp').value, 10),
      inp: parseInt($('pk-threshold-inp').value, 10),
      cls: parseFloat($('pk-threshold-cls').value),
      a11yScore: parseInt($('pk-threshold-a11y').value, 10),
      seoScore: parseInt($('pk-threshold-seo').value, 10),
    },
    axeCore: { enabled: $('pk-axe-enabled').checked },
  };
  await set('qualityAnalysis', payload);
  DebugLogger.feature('OPTIONS', '품질 진단 설정 저장', payload);
}
$('pk-quality-enabled').addEventListener('change', saveQuality);
$('pk-quality-auto-run').addEventListener('change', saveQuality);
document.querySelectorAll('input[name="quality-module"]').forEach((el) => {
  el.addEventListener('change', saveQuality);
});
[
  'pk-threshold-lcp',
  'pk-threshold-inp',
  'pk-threshold-cls',
  'pk-threshold-a11y',
  'pk-threshold-seo',
].forEach((id) => {
  $(id).addEventListener('change', saveQuality);
});
$('pk-axe-enabled').addEventListener('change', saveQuality);

DebugLogger.feature('OPTIONS', '옵션 페이지 로드 완료');
bootSafe('사이트 규칙', renderRules);
bootSafe('링크 프리셋', renderPresets);
bootSafe('설정', loadSettings);
bootSafe('품질 진단', loadQuality);
bootSafe('디버그', loadDebug);

const pkVersionEl = document.getElementById('pk-version');
if (pkVersionEl) pkVersionEl.textContent = `v${chrome.runtime.getManifest().version}`;
const pkVersionFoot = document.getElementById('pk-version-foot');
if (pkVersionFoot) pkVersionFoot.textContent = `v${chrome.runtime.getManifest().version}`;

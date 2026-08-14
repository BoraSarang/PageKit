// options/options.js — 옵션 페이지 (우클릭 해제 / 사이트 규칙 / 프리셋 / 다운로드 설정)

import { MSG } from '../shared/messages.js' ;

const $ = (id) => document.getElementById(id) ;

async function get(key, fallback) {
  const v = await chrome.storage.local.get({ [key]: fallback }) ;
  return v[key] ;
}
async function set(key, value) {
  await chrome.storage.local.set({ [key]: value }) ;
}

// ---------- 사이트 규칙 ----------
async function renderRules() {
  const rules = await get('siteRules', {}) ;
  $('pk-rule-list').innerHTML = Object.entries(rules)
    .map(([d, r]) => `<li>${d} → ${r.selectors || r} <button data-act="del" data-key="siteRules" data-val="${d}">✕</button></li>`)
    .join('') ;
}
$('pk-rule-add').addEventListener('click', async () => {
  const domain = $('pk-rule-domain').value.trim() ;
  const selector = $('pk-rule-selector').value.trim() ;
  if (!domain || !selector) return ;
  const rules = await get('siteRules', {}) ;
  rules[domain] = { selectors: selector } ;
  await set('siteRules', rules) ;
  $('pk-rule-domain').value = '' ;
  $('pk-rule-selector').value = '' ;
  renderRules() ;
}) ;

// ---------- 프리셋 ----------
async function renderPresets() {
  const presets = await get('linkPresets', {}) ;
  $('pk-preset-list').innerHTML = Object.entries(presets)
    .map(([name, regex]) => `<li>${name} · <code>${regex}</code> <button data-act="del" data-key="linkPresets" data-val="${name}">✕</button></li>`)
    .join('') ;
}
$('pk-preset-add').addEventListener('click', async () => {
  const name = $('pk-preset-name').value.trim() ;
  const regex = $('pk-preset-regex').value.trim() ;
  if (!name || !regex) return ;
  try { new RegExp(regex) ; } catch { alert('정규식이 올바르지 않습니다.') ; return ; }
  const presets = await get('linkPresets', {}) ;
  presets[name] = regex ;
  await set('linkPresets', presets) ;
  $('pk-preset-name').value = '' ;
  $('pk-preset-regex').value = '' ;
  renderPresets() ;
}) ;

// ---------- 공통 삭제 ----------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act="del"]') ;
  if (!btn) return ;
  const { key, val } = btn.dataset ;
  const obj = await get(key, {}) ;
  delete obj[val] ;
  await set(key, obj) ;
  renderRules() ;
  renderPresets() ;
}) ;

// ---------- 다운로드 설정 ----------
const qs = new URLSearchParams(location.search) ;
if (qs.get('set') === 'streamDetect') {
  const payload = { streamDetect: true } ;
  chrome.runtime.sendMessage({ type: MSG.SETTINGS_SET, payload }).then(async () => {
    const after = await chrome.storage.local.get('settings') ;
    document.title = 'SD=' + Boolean(after.settings?.streamDetect) ;
    setTimeout(() => location.replace(location.pathname), 3000) ;
  }) ;
}
if (qs.get('caps') === '1') {
  chrome.storage.session.get('ytCaptured').then((v) => {
    const caps = v.ytCaptured || [] ;
    document.title = 'CAPS=' + caps.length + ' | ' + caps.map((c) => `itag=${c.itag} ${c.label}`).join(', ') ;
  }) ;
}
if (qs.get('capurl')) {
  chrome.storage.session.get('ytCaptured').then((v) => {
    const caps = v.ytCaptured || [] ;
    const c = caps.find((x) => String(x.itag) === qs.get('capurl')) || caps[0] ;
    document.title = c ? c.url : 'NO CAP' ;
  }) ;
}
if (qs.get('capidx')) {
  chrome.storage.session.get('ytCaptured').then((v) => {
    const caps = v.ytCaptured || [] ;
    const c = caps[Number(qs.get('capidx'))] ;
    document.title = c ? c.url : 'NO CAP' ;
  }) ;
}
if (qs.get('logs') === '1') {
  chrome.storage.local.get('debugLog').then((v) => {
    const logs = (v.debugLog || []).filter((l) => /STREAM|캡처|유튜브|규칙|웹 요청/.test(l.text || l)).slice(-12) ;
    document.title = 'LOGS | ' + logs.map((l) => (typeof l === 'string' ? l : l.text)).join(' /// ') ;
  }) ;
}
if (qs.get('dl')) {
  // 테스트 훅: BG의 실제 다운로드 흐름 경유 (chrome.windows.create — 서명 URL 그대로 전달)
  chrome.runtime.sendMessage({ type: MSG.DOWNLOAD_STREAM, payload: { url: qs.get('dl'), name: qs.get('n') || '테스트', title: qs.get('t') || '', folder: qs.get('f') || 'youtube', referer: qs.get('r') || '' } }).then((resp) => {
    document.title = resp?.ok ? 'DL SENT' : 'DL ERR ' + JSON.stringify(resp || {}) ;
  }) ;
}
async function loadSettings() {
  const resp = await chrome.runtime.sendMessage({ type: MSG.SETTINGS_GET }) ;
  const s = resp?.data || {} ;
  $('pk-concurrent').value = s.concurrentDownloads ?? 3 ;
  $('pk-min-width').value = s.minImageWidth ?? 0 ;
  $('pk-min-size').value = s.minImageSize ?? 0 ;
  $('pk-stream-detect').checked = Boolean(s.streamDetect) ;
  $('pk-unlock-enabled').checked = Boolean(s.unlockEnabled) ;
}
$('pk-unlock-enabled').addEventListener('change', () => {
  const on = $('pk-unlock-enabled').checked ;
  DebugLogger.feature('OPTIONS', `우클릭/복사 제한 해제 ${on ? '켬' : '끔'}`) ;
  chrome.runtime.sendMessage({ type: MSG.SETTINGS_SET, payload: { unlockEnabled: on } }) ;
}) ;
$('pk-save-settings').addEventListener('click', async () => {
  const payload = {
    concurrentDownloads: Math.max(1, parseInt($('pk-concurrent').value, 10) || 3),
    minImageWidth: Math.max(0, parseInt($('pk-min-width').value, 10) || 0),
    minImageSize: Math.max(0, parseInt($('pk-min-size').value, 10) || 0),
    streamDetect: $('pk-stream-detect').checked,
  } ;
  DebugLogger.feature('OPTIONS', '설정 저장', payload) ;
  await chrome.runtime.sendMessage({ type: MSG.SETTINGS_SET, payload }) ;
  alert('설정이 저장되었습니다.') ;
}) ;

// ---------- 디버그 ----------
async function loadDebug() {
  const v = await chrome.storage.local.get('debugEnabled') ;
  $('pk-debug-enabled').checked = v.debugEnabled !== false ;
}
$('pk-debug-enabled').addEventListener('change', () => {
  DebugLogger.setEnabled($('pk-debug-enabled').checked) ;
  DebugLogger.feature('OPTIONS', `디버그 로그 수집 ${$('pk-debug-enabled').checked ? '켬' : '끔'}`) ;
}) ;

DebugLogger.feature('OPTIONS', '옵션 페이지 로드 완료') ;
renderRules() ;
renderPresets() ;
loadSettings() ;
loadDebug() ;
const pkVersionEl = document.getElementById('pk-version') ;
if (pkVersionEl) pkVersionEl.textContent = `v${chrome.runtime.getManifest().version}` ;
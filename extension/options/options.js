// options/options.js — 옵션 페이지 (화이트리스트 / 사이트 규칙 / 프리셋 / 다운로드 설정)

import { MSG } from '../shared/messages.js' ;

const $ = (id) => document.getElementById(id) ;

async function get(key, fallback) {
  const v = await chrome.storage.local.get({ [key]: fallback }) ;
  return v[key] ;
}
async function set(key, value) {
  await chrome.storage.local.set({ [key]: value }) ;
}

// ---------- 우클릭 화이트리스트 ----------
async function renderUnlock() {
  const sites = await get('unlockSites', []) ;
  $('pk-unlock-list').innerHTML = sites.map((s) => `<li>${s} <button data-act="del" data-key="unlockSites" data-val="${s}">✕</button></li>`).join('') ;
}
$('pk-unlock-add').addEventListener('click', async () => {
  const v = $('pk-unlock-input').value.trim().replace(/^https?:\/\//, '') ;
  if (!v) return ;
  const sites = await get('unlockSites', []) ;
  if (!sites.includes(v)) {
    sites.push(v) ;
    await set('unlockSites', sites) ;
  }
  $('pk-unlock-input').value = '' ;
  renderUnlock() ;
}) ;

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
  const obj = await get(key, key === 'unlockSites' ? [] : {}) ;
  if (Array.isArray(obj)) {
    const idx = obj.indexOf(val) ;
    if (idx >= 0) obj.splice(idx, 1) ;
  } else {
    delete obj[val] ;
  }
  await set(key, obj) ;
  renderUnlock() ;
  renderRules() ;
  renderPresets() ;
}) ;

// ---------- 다운로드 설정 ----------
async function loadSettings() {
  const resp = await chrome.runtime.sendMessage({ type: MSG.SETTINGS_GET }) ;
  const s = resp?.data || {} ;
  $('pk-concurrent').value = s.concurrentDownloads ?? 3 ;
  $('pk-min-width').value = s.minImageWidth ?? 0 ;
  $('pk-min-size').value = s.minImageSize ?? 0 ;
  $('pk-stream-detect').checked = Boolean(s.streamDetect) ;
}
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
renderUnlock() ;
renderRules() ;
renderPresets() ;
loadSettings() ;
loadDebug() ;
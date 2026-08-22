// background/storage.js — chrome.storage 래퍼
// local: settings / siteRules / linkPresets
// session: lastAnalysis / downloadJobs

const LOCAL_KEYS = ['settings', 'siteRules', 'linkPresets'];
const SESSION_KEYS = ['lastAnalysis', 'downloadJobs'];

const DEFAULT_SETTINGS = {
  minImageWidth: 0,
  minImageSize: 0,
  concurrentDownloads: 3,
  retryCount: 2,
  streamDetect: true,
  unlockEnabled: false,
};

export async function getLocal(key, fallback = null) {
  const v = await chrome.storage.local.get(key);
  return v[key] ?? fallback;
}

export async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function getSession(key, fallback = null) {
  const v = await chrome.storage.session.get(key);
  return v[key] ?? fallback;
}

export async function setSession(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

export async function getSettings() {
  const s = await getLocal('settings', null);
  const next = { ...DEFAULT_SETTINGS, ...(s || {}) };
  // v0.4 마이그레이션: 기존 화이트리스트(unlockSites) 보유 시 전역 체크박스 ON으로 1회 승계 후 정리
  const legacy = await getLocal('unlockSites', []);
  if (Array.isArray(legacy) && legacy.length) {
    next.unlockEnabled = true;
    await setLocal('settings', next);
    await setLocal('unlockSites', []);
  }
  return next;
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await setLocal('settings', next);
  return next;
}

export async function getSiteRules() {
  return (await getLocal('siteRules', {})) || {};
}

export async function setSiteRule(domain, rule) {
  const rules = await getSiteRules();
  if (rule) rules[domain] = rule;
  else delete rules[domain];
  await setLocal('siteRules', rules);
  return rules;
}

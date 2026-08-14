// background/storage.js — chrome.storage 래퍼
// local: settings / unlockSites / siteRules / linkPresets
// session: lastAnalysis / downloadJobs

const LOCAL_KEYS = ['settings', 'unlockSites', 'siteRules', 'linkPresets'] ;
const SESSION_KEYS = ['lastAnalysis', 'downloadJobs'] ;

const DEFAULT_SETTINGS = {
  minImageWidth: 0,
  minImageSize: 0,
  concurrentDownloads: 3,
  retryCount: 2,
  streamDetect: false,
  unlockEnabled: false,
} ;

export async function getLocal(key, fallback = null) {
  const v = await chrome.storage.local.get(key) ;
  return v[key] ?? fallback ;
}

export async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value }) ;
}

export async function getSession(key, fallback = null) {
  const v = await chrome.storage.session.get(key) ;
  return v[key] ?? fallback ;
}

export async function setSession(key, value) {
  await chrome.storage.session.set({ [key]: value }) ;
}

export async function getSettings() {
  const s = await getLocal('settings', null) ;
  return { ...DEFAULT_SETTINGS, ...(s || {}) } ;
}

export async function setSettings(patch) {
  const cur = await getSettings() ;
  const next = { ...cur, ...patch } ;
  await setLocal('settings', next) ;
  return next ;
}

export async function getUnlockSites() {
  return (await getLocal('unlockSites', [])) || [] ;
}

export async function toggleUnlockSite(domain) {
  const sites = await getUnlockSites() ;
  const idx = sites.indexOf(domain) ;
  if (idx >= 0) sites.splice(idx, 1) ;
  else sites.push(domain) ;
  await setLocal('unlockSites', sites) ;
  return sites ;
}

export async function getSiteRules() {
  return (await getLocal('siteRules', {})) || {} ;
}

export async function setSiteRule(domain, rule) {
  const rules = await getSiteRules() ;
  if (rule) rules[domain] = rule ;
  else delete rules[domain] ;
  await setLocal('siteRules', rules) ;
  return rules ;
}
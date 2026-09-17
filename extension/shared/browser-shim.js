// shared/browser-shim.js — chrome/browser 네임스페이스 통일 + Safari 지원 탐지 (v1.0.12)
// Safari Web Extensions는 chrome.* 과 browser.* 를 모두 지원하므로 Promise 방식으로 통일한다.
// 판정 함수는 "있으면 사용, 없으면 폴백" 원칙 — Chrome 경로는 그대로 동작한다.

export function extApi() {
  if (typeof browser !== 'undefined' && browser && browser.runtime) return browser;
  return chrome;
}

export function supportsSidePanel() {
  try {
    const api = extApi();
    return !!(api && api.sidePanel && api.sidePanel.open);
  } catch {
    return false;
  }
}

export function supportsDownloads() {
  try {
    const api = extApi();
    return !!(api && api.downloads && api.downloads.download);
  } catch {
    return false;
  }
}

export function supportsNotifications() {
  try {
    const api = extApi();
    return !!(api && api.notifications && api.notifications.create);
  } catch {
    return false;
  }
}

// 활성 웹페이지 탭 조회 (v1.0.12 T-SAF-07)
// Chrome 도킹 패널: currentWindow = 페이지 창이라 그대로.
// Safari 팝업 윈도우: 별도 창이라 currentWindow 조회가 확장 페이지 자신을 돌려준다.
// → lastFocusedWindow 우선 + 모든 창의 활성 탭 폴백으로 http 탭을 찾는다.
export async function queryActivePageTab() {
  const api = extApi();
  const isHttp = (t) => t && t.url && /^https?:/.test(t.url);
  const scoped = supportsSidePanel() ? { currentWindow: true } : { lastFocusedWindow: true };
  try {
    const [active] = await api.tabs.query({ active: true, ...scoped });
    if (isHttp(active)) return active;
  } catch {}
  try {
    const actives = await api.tabs.query({ active: true });
    const hit = (actives || []).find(isHttp);
    if (hit) return hit;
  } catch {}
  try {
    const tabs = await api.tabs.query({ currentWindow: true });
    return (tabs || []).find(isHttp) || null;
  } catch {
    return null;
  }
}

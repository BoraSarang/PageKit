// onboarding/onboarding.js — 설치 환영 페이지 (버전 표시 + 설정/닫기)

const versionEl = document.getElementById('pk-version') ;
if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}` ;

document.getElementById('pk-open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage() ;
}) ;

document.getElementById('pk-close')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }) ;
  if (tab?.id != null) chrome.tabs.remove(tab.id) ;
}) ;

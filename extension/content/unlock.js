// content/unlock.js — 마우스 오른쪽 제한 풀기 (F1)
// 기본 꺼짐, chrome.storage 화이트리스트(unlockSites)에 현재 도메인이 있으면 활성.
// 캡처 단계 stopPropagation으로 페이지의 차단 리스너 실행을 막는다.

(() => {
  if (globalThis.__pkUnlockLoaded) return ;
  globalThis.__pkUnlockLoaded = true ;

  const BLOCKED_EVENTS = ['contextmenu', 'copy', 'cut', 'selectstart', 'dragstart'] ;
  const CSS_ID = 'pk-unlock-style' ;
  let active = false ;

  function isWhitelisted(hostname) {
    return new Promise((resolve) => {
      chrome.storage.local.get({ unlockSites: [] }, ({ unlockSites }) => {
        resolve((unlockSites || []).includes(hostname)) ;
      }) ;
    }) ;
  }

  function enable() {
    if (active) return ;
    active = true ;

    for (const ev of BLOCKED_EVENTS) {
      document.addEventListener(ev, (e) => e.stopPropagation(), true) ;
    }
    // 문서 전체 텍스트 선택/드래그 허용
    const css = 'html, body, * { -webkit-user-select: text !important; user-select: text !important; }' ;
    const style = document.getElementById(CSS_ID) ;
    if (style) style.remove() ;
    const el = document.createElement('style') ;
    el.id = CSS_ID ;
    el.textContent = css ;
    (document.head || document.documentElement).appendChild(el) ;

    DebugLogger.feature('UNLOCK', '우클릭/복사 제한 해제 활성화', { domain: location.hostname }) ;
  }

  function disable() {
    if (!active) return ;
    active = false ;
    document.getElementById(CSS_ID)?.remove() ;
    DebugLogger.feature('UNLOCK', '우클릭/복사 제한 해제 비활성화', { domain: location.hostname }) ;
  }

  // 스토리지 변경 감지 (옵션에서 토글 시 즉시 반영)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.unlockSites) {
      const sites = changes.unlockSites.newValue || [] ;
      if (sites.includes(location.hostname)) enable() ;
      else disable() ;
    }
  }) ;

  isWhitelisted(location.hostname).then((on) => {
    DebugLogger.debug('[UNLOCK] 화이트리스트 확인', { domain: location.hostname, active: on }) ;
    if (on) enable() ;
  }) ;
})() ;
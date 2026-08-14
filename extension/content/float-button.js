// content/float-button.js — 플로팅 버튼 (진입점 ⑤)
// 팝업/컨텍스트 메뉴 진입 시점에 주입됨. 클릭 → BG → sidePanel.open('float')

(() => {
  if (globalThis.__pkFloatLoaded) return ;
  globalThis.__pkFloatLoaded = true ;

  const BTN_ID = 'pk-float-btn' ;

  function create() {
    if (document.getElementById(BTN_ID)) return document.getElementById(BTN_ID) ;
    const btn = document.createElement('button') ;
    btn.id = BTN_ID ;
    btn.className = 'pk-float-btn' ;
    btn.title = 'PageKit 열기 (Shift+클릭 시 닫기)' ;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
    </svg>` ;
    btn.addEventListener('click', () => {
      DebugLogger.feature('FLOAT', '플로팅 버튼 클릭 → 사이드 패널 열기 요청') ;
      chrome.runtime.sendMessage({ type: 'pk.ui.openPanel', source: 'float' }, () => {}) ;
    }) ;
    document.documentElement.appendChild(btn) ;
    return btn ;
  }

  // 이중 주입 방지 (CSS는 BG의 insertCSS로 주입됨)
  const btn = create() ;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'pk.ui.floatVisible') {
      btn.classList.toggle('pk-float-btn-hidden', !message.payload?.visible) ;
      sendResponse({ ok: true }) ;
      return false ;
    }
    return false ;
  }) ;

  DebugLogger.feature('FLOAT', '플로팅 버튼 표시됨') ;
  chrome.runtime.sendMessage({ type: 'pk.content.floatReady' }, () => {}) ;
})() ;
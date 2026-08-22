// content/unlock.js — 마우스 오른쪽 제한 풀기 (F1)
// v0.4: 전역 체크박스(settings.unlockEnabled) 기반 — 모든 사이트에서 동일 적용.
// 캡처 단계 stopPropagation으로 페이지의 차단 리스너 실행을 막는다.

(() => {
  if (globalThis.__pkUnlockLoaded) return;
  globalThis.__pkUnlockLoaded = true;

  const BLOCKED_EVENTS = ['contextmenu', 'copy', 'cut', 'selectstart', 'dragstart'];
  const CSS_ID = 'pk-unlock-style';
  let active = false;

  async function isUnlockEnabled() {
    const v = await chrome.storage.local.get('settings');
    return Boolean(v.settings && v.settings.unlockEnabled);
  }

  function enable() {
    if (active) return;
    active = true;

    for (const ev of BLOCKED_EVENTS) {
      document.addEventListener(ev, (e) => e.stopPropagation(), true);
    }
    // 문서 전체 텍스트 선택/드래그 허용
    const css =
      'html, body, * { -webkit-user-select: text !important; user-select: text !important; }';
    const style = document.getElementById(CSS_ID);
    if (style) style.remove();
    const el = document.createElement('style');
    el.id = CSS_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);

    DebugLogger.feature('UNLOCK', '우클릭/복사 제한 해제 활성화', { domain: location.hostname });
  }

  function disable() {
    if (!active) return;
    active = false;
    document.getElementById(CSS_ID)?.remove();
    DebugLogger.feature('UNLOCK', '우클릭/복사 제한 해제 비활성화', { domain: location.hostname });
  }

  // 설정 변경 감지 (옵션에서 토글 시 즉시 반영)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const s = changes.settings.newValue || {};
      if (s.unlockEnabled) enable();
      else disable();
    }
  });

  isUnlockEnabled().then((on) => {
    DebugLogger.debug('[UNLOCK] 설정 확인', { domain: location.hostname, unlockEnabled: on });
    if (on) enable();
  });
})();

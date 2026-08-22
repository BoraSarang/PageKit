// content/highlight.js — 본문 영역 하이라이트 + 드래그 보정 (T-17)
// HIGHLIGHT_TOGGLE 메시지로 ON/OFF. 분석 결과(article.found) 시 본문 요소에 아웃라인 표시.

(() => {
  if (globalThis.__pkHighlightLoaded) return;
  globalThis.__pkHighlightLoaded = true;

  const CSS_ID = 'pk-highlight-style';
  let on = false;

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      .pk-highlight-node {
        outline: 2px dashed #06b6d4 !important;
        outline-offset: 2px;
        background: rgba(6, 182, 212, 0.06) !important;
      }
      .pk-highlight-guide {
        position: fixed;
        z-index: 2147483646;
        background: rgba(6, 182, 212, 0.18);
        border: 2px solid #06b6d4;
        pointer-events: none;
      }`;
    document.documentElement.appendChild(style);
  }

  function clearHighlights() {
    document
      .querySelectorAll('.pk-highlight-node')
      .forEach((el) => el.classList.remove('pk-highlight-node'));
    document.querySelectorAll('.pk-highlight-guide').forEach((el) => el.remove());
  }

  // readability가 선호하는 본문 후보: 최대 텍스트 밀도 요소를 휴리스틱 선정
  function findArticleRoot() {
    const scores = new Map();
    for (const el of document.querySelectorAll(
      'article, main, [role="main"], .article, .post, .entry-content, .blog-post, #content, #main'
    )) {
      if (!el.isConnected) continue;
      const text = (el.textContent || '').trim();
      const pCount = el.querySelectorAll('p').length;
      if (text.length < 300 || pCount < 2) continue;
      scores.set(el, text.length * 0.6 + pCount * 120);
    }
    let best = null,
      bestScore = 0;
    for (const [el, s] of scores) {
      if (s > bestScore) {
        best = el;
        bestScore = s;
      }
    }
    return best;
  }

  function highlightOn() {
    injectCss();
    const root = findArticleRoot();
    if (!root) {
      DebugLogger.warn('[HIGHLIGHT] 본문 후보를 찾지 못했습니다.', { code: 'E-CHR-GLIST-1001' });
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    while (walker.nextNode() && count < 200) {
      const el = walker.currentNode;
      if (el.children.length === 0 && (el.textContent || '').trim().length > 0) {
        el.classList.add('pk-highlight-node');
        count++;
      }
    }
    DebugLogger.feature('HIGHLIGHT', `본문 하이라이트 ON (${count}개 노드)`);
  }

  function highlightOff() {
    clearHighlights();
    DebugLogger.feature('HIGHLIGHT', '본문 하이라이트 OFF');
  }

  // --- 드래그 보정 가이드 (사용자가 영역을 그리면 해당 노드만 표시) ---
  let dragState = null;
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!on || !e.shiftKey) return;
      dragState = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
      clearHighlights();
    },
    true
  );
  document.addEventListener(
    'mousemove',
    (e) => {
      if (!dragState) return;
      dragState.x2 = e.clientX;
      dragState.y2 = e.clientY;
      let guide = document.querySelector('.pk-highlight-guide');
      if (!guide) {
        guide = document.createElement('div');
        guide.className = 'pk-highlight-guide';
        document.documentElement.appendChild(guide);
      }
      const x = Math.min(dragState.x1, dragState.x2),
        y = Math.min(dragState.y1, dragState.y2);
      guide.style.left = `${x}px`;
      guide.style.top = `${y}px`;
      guide.style.width = `${Math.abs(dragState.x2 - dragState.x1)}px`;
      guide.style.height = `${Math.abs(dragState.y2 - dragState.y1)}px`;
    },
    true
  );
  document.addEventListener(
    'mouseup',
    (e) => {
      if (!dragState) return;
      const { x1, y1, x2, y2 } = dragState;
      dragState = null;
      document.querySelectorAll('.pk-highlight-guide').forEach((el) => el.remove());
      const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
      const el = document.elementFromPoint(cx, cy);
      if (el) {
        clearHighlights();
        let node = el;
        while (node && node !== document.body) {
          if ((node.textContent || '').trim().length > 100) break;
          node = node.parentElement;
        }
        if (node && node !== document.body) {
          node.classList.add('pk-highlight-node');
          DebugLogger.feature('HIGHLIGHT', `드래그 보정: ${node.tagName}.${node.className || ''}`);
        }
      }
    },
    true
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'pk.ui.highlight') return false;
    DebugLogger.debug('[HIGHLIGHT] 토글 요청', { on: Boolean(message.payload?.on) });
    on = Boolean(message.payload?.on);
    if (on) highlightOn();
    else highlightOff();
    sendResponse({ ok: true, data: { on } });
    return false;
  });
})();

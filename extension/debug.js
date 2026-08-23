// debug.js — PageKit DebugLogger 공용 래퍼 (Shop WiseBar 참고, v0.1)
// PLATFORM: extension (background SW / content script / popup / sidepanel / options / debug 창 공용)
// 레벨: [DEBUG]/[INFO]/[WARN]/[ERROR] + [PERF]/[CACHE]/[FEATURE]
//
// 구조:
//   - 모든 로그는 chrome.storage.local["debugLog"]에 누적 (닫기/탭 이동/SW 종료와 무관, 지우기 전까지 유지, MAX 2000 FIFO)
//   - content script는 storage를 직접 쓰지 않고 background로 DEBUG_LOG 메시지를 위임
//     → background가 sender.tab로 탭ID/url을 태깅해 중앙 기록
//   - 로그마다 set하지 않도록 디바운스(300ms)로 배치 저장
//   - chrome.storage.local["debugEnabled"] 켜짐 상태에서만 기록 (기본 꺼짐)
// AGENTS.md 19장 DebugPanel 표준 — 전용 디버그 창(chrome.windows.create) 대응.

if (globalThis.DebugLogger) {
  // 재주입 가드 — manifest 정적 주입 + executeScript 동적 주입이 겹쳐도 1회만 평가
} else {
  globalThis.DebugLogger = (() => {
  'use strict';
  const ENABLE_KEY = 'debugEnabled';
  const LOG_KEY = 'debugLog';
  const MAX_LOG = 2000;
  const FLUSH_MS = 300;

  const isContent =
    typeof location !== 'undefined' &&
    /^https?:/.test(location.protocol || '') &&
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    chrome.runtime.id;
  const scope = isContent
    ? 'content'
    : typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id
      ? 'ext'
      : 'page';

  // 기본 활성화 — 디버그 패널의 목적(모든 기능 동작 추적)을 위해 저장값이 없으면 true
  let enabled = true;
  let pending = [];
  let flushTimer = null;

  try {
    chrome.storage.local.get(ENABLE_KEY, (v) => {
      if (v && typeof v[ENABLE_KEY] === 'boolean') enabled = v[ENABLE_KEY];
    });
    // storage.local 변경 감지 시 캐시 갱신 (SW 장수명 대응)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[ENABLE_KEY]) {
        enabled = !!changes[ENABLE_KEY].newValue;
      }
    });
  } catch {
    enabled = false;
  }

  function safeString(v) {
    try {
      if (v instanceof Error) return `${v.name}: ${v.message}`;
      if (typeof v === 'object' && v !== null) return JSON.stringify(v);
      return String(v);
    } catch {
      if (typeof v === 'object' && v !== null) {
        try {
          return JSON.stringify(v);
        } catch {
          return '[unserializable]';
        }
      }
      return String(v);
    }
  }

  function hashUrlTag() {
    try {
      return { url: location.href };
    } catch {
      return {};
    }
  }

  function sendDelegated(entry) {
    try {
      chrome.runtime.sendMessage({ type: 'DEBUG_LOG', entry });
    } catch {
      /* 컨텍스트 소멸 등 무해 */
    }
  }

  function persistSync(entries) {
    chrome.storage.local.get(LOG_KEY, (v) => {
      let arr = Array.isArray(v && v[LOG_KEY]) ? v[LOG_KEY] : [];
      arr = arr.concat(entries);
      arr = arr.slice(-MAX_LOG);
      chrome.storage.local.set({ [LOG_KEY]: arr }, () => {});
    });
  }

  function enqueue(level, args, consoleFn) {
    const ts = Date.now();
    const text = args.map((a) => (typeof a === 'string' ? a : safeString(a))).join(' ');
    const entry = { ts, level, scope, text };
    if (isContent) Object.assign(entry, hashUrlTag());

    const line = debugLine(entry);
    try {
      consoleFn ? consoleFn(line) : console[level.toLowerCase()](line);
    } catch {
      /* 콘솔 미존재 환경 무해 */
    }

    if (isContent) {
      sendDelegated(entry);
      return;
    }

    if (!enabled) return;
    pending.push(entry);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = pending;
      pending = [];
      persistSync(batch);
    }, FLUSH_MS);
  }

  function debugLine(e) {
    const d = new Date(e.ts);
    const p = (n) => String(n).padStart(2, '0');
    const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    const scopeMark =
      e.scope === 'content'
        ? `[TAB${e.tabId != null ? ' ' + e.tabId : ''}]`
        : `[${(e.scope || 'ext').toUpperCase()}]`;
    const urlMark = e.url ? ` (${e.url})` : '';
    return `[${t}] [${e.level}] ${scopeMark}${urlMark} ${e.text}`;
  }

  function recent(n = 30) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(LOG_KEY, (v) => {
          const arr = Array.isArray(v && v[LOG_KEY]) ? v[LOG_KEY] : [];
          resolve(arr.slice(-n));
        });
      } catch {
        resolve([]);
      }
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
    setEnabled(v) {
      enabled = !!v;
      try {
        chrome.storage.local.set({ [ENABLE_KEY]: enabled });
      } catch {
        /* storage 미사용 환경 무해 */
      }
      return enabled;
    },
    debug(...a) {
      enqueue('DEBUG', a, console.log);
    },
    info(...a) {
      enqueue('INFO', a, console.log);
    },
    warn(...a) {
      enqueue('WARN', a, console.warn);
    },
    error(...a) {
      enqueue('ERROR', a, console.error);
    },
    perf(label, ms) {
      enqueue('PERF', [`${label} ${ms.toFixed(1)}ms`], console.log);
    },
    cache(label, ms) {
      enqueue('CACHE', [`${label} ${ms.toFixed(1)}ms`], console.log);
    },
    feature(...a) {
      enqueue('FEATURE', a, console.log);
    },
    recent,
    list(n = 2000) {
      return recent(n);
    },
    clear() {
      pending = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      try {
        chrome.storage.local.set({ [LOG_KEY]: [] });
      } catch {
        /* 무해 */
      }
    },
    format(entry) {
      return debugLine(entry);
    },
    scope,
  };
})();
  }

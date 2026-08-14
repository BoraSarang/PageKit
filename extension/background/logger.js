// background/logger.js — BGLogger (DebugLogger 래핑, AGENTS.md 19장 DebugPanel 표준)
// 모든 로그는 debug.js의 DebugLogger 경유 → chrome.storage.local["debugLog"] 누적 + 콘솔 출력.
// 레벨: DEBUG < INFO < WARN < ERROR, 태그: [PERF]/[CACHE]/[FEATURE]

import { DebugLogger } from '../debug-module.js' ;

const BGLogger = {
  debug: (tag, msg, meta) => DebugLogger.debug(`[${tag}] ${msg}`, meta ? `meta=${JSON.stringify(meta)}` : ''),
  info: (tag, msg, meta) => DebugLogger.info(`[${tag}] ${msg}`, meta ? `meta=${JSON.stringify(meta)}` : ''),
  warn: (tag, msg, meta) => DebugLogger.warn(`[${tag}] ${msg}`, meta ? `meta=${JSON.stringify(meta)}` : ''),
  error: (tag, msg, meta) => DebugLogger.error(`[${tag}] ${msg}`, meta ? `meta=${JSON.stringify(meta)}` : ''),
  perf: (tag, msg, meta) => DebugLogger.perf(`[${tag}] ${msg}`, meta?.ms ?? 0),
  cache: (tag, msg, meta) => DebugLogger.cache(`[${tag}] ${msg}`, meta?.ms ?? 0),
  feature: (tag, msg, meta) => DebugLogger.feature(`[${tag}] ${msg}`, meta ? `meta=${JSON.stringify(meta)}` : ''),
} ;

export { BGLogger } ;
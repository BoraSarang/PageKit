// content/web-vitals.js — Core Web Vitals 실측 (PerformanceObserver 기반, 전역 window.__pkCWV에 저장)

(() => {
  if (globalThis.__pkWebVitalsLoaded) return;
  globalThis.__pkWebVitalsLoaded = true;

  const metrics = { lcp: null, inp: null, cls: 0, fcp: null, ttfb: null };
  let clsSessionValue = 0;
  let clsSessionEntries = [];

  // ---------- LCP ----------
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        metrics.lcp = Math.round(last.startTime);
        DebugLogger.debug('CWV', `LCP: ${metrics.lcp}ms`);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { DebugLogger.warn('CWV', `LCP observer 실패: ${e.message}`); }

  // ---------- FCP ----------
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcp = entries.find(e => e.name === 'first-contentful-paint');
      if (fcp) {
        metrics.fcp = Math.round(fcp.startTime);
        DebugLogger.debug('CWV', `FCP: ${metrics.fcp}ms`);
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch (e) { DebugLogger.warn('CWV', `FCP observer 실패: ${e.message}`); }

  // ---------- CLS ----------
  try {
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsSessionValue += entry.value;
          clsSessionEntries.push(entry);
        }
      }
      metrics.cls = Number(clsSessionValue.toFixed(4));
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (e) { DebugLogger.warn('CWV', `CLS observer 실패: ${e.message}`); }

  // ---------- INP (Interaction to Next Paint) ----------
  // PerformanceEventTiming (Chrome 96+) 사용
  try {
    const inpObserver = new PerformanceObserver((list) => {
      let maxInp = 0;
      for (const entry of list.getEntries()) {
        if (entry.interactionId) {
          const inp = entry.duration;
          if (inp > maxInp) maxInp = inp;
        }
      }
      if (maxInp > (metrics.inp || 0)) {
        metrics.inp = Math.round(maxInp);
        DebugLogger.debug('CWV', `INP: ${metrics.inp}ms`);
      }
    });
    inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch (e) {
    DebugLogger.warn('CWV', `INP observer 실패: ${e.message}`);
    // 폴백: 첫 입력 지연 (FID) 측정
    try {
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-input') {
            metrics.inp = Math.round(entry.processingStart - entry.startTime);
            DebugLogger.debug('CWV', `FID(폴백): ${metrics.inp}ms`);
          }
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch {}
  }

  // ---------- TTFB ----------
  try {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      const nav = navEntries[0];
      metrics.ttfb = Math.round(nav.responseStart - nav.requestStart);
      DebugLogger.debug('CWV', `TTFB: ${metrics.ttfb}ms`);
    }
  } catch {}

  // 전역 저장 (품질 분석기가 읽음)
  window.__pkCWV = metrics;

  // 페이지 언로드 시 최종 값 저장
  window.addEventListener('beforeunload', () => {
    window.__pkCWV = { ...metrics };
  });

  DebugLogger.feature('CWV', 'Core Web Vitals 측정기 로드 완료');
})();
// shared/quality-rules.js — 품질 진단 룰 엔진 (JSON 기반, 설정 연동)

// 모듈별 기본 설정 (옵션 페이지에서 덮어씀)
const DEFAULT_QUALITY_CONFIG = {
  enabled: true,
  autoRun: false,
  modules: {
    seoMeta: true,
    headings: true,
    structuredData: true,
    imageSEO: true,
    linkSEO: true,
    contentQuality: true,
    coreWebVitals: true,
    resourceTiming: true,
    a11yScan: true,
  },
  thresholds: {
    lcp: 2500,      // ms
    inp: 200,       // ms
    cls: 0.1,
    a11yScore: 90,
    seoScore: 80,
  },
  axeCore: { enabled: true },
  exportFormat: 'json',
};

// 모듈 메타데이터 (UI용)
const MODULE_META = {
  seoMeta: { label: '메타 태그', category: 'SEO', order: 1 },
  headings: { label: '헤딩 계층', category: 'SEO', order: 2 },
  structuredData: { label: '구조화 데이터', category: 'SEO', order: 3 },
  imageSEO: { label: '이미지 SEO', category: 'SEO', order: 4 },
  linkSEO: { label: '링크 분석', category: 'SEO', order: 5 },
  contentQuality: { label: '콘텐츠 품질', category: 'Content', order: 6 },
  coreWebVitals: { label: 'Core Web Vitals', category: 'Performance', order: 7 },
  resourceTiming: { label: '리소스 타이밍', category: 'Performance', order: 8 },
  a11yScan: { label: '접근성', category: 'Accessibility', order: 9 },
};

// 심각도
const SEVERITY = {
  CRITICAL: 'critical',   // 🔴 즉시 수정 필요 (색인/접근 차단)
  MAJOR: 'major',         // 🟠 중요 (순위/사용성 영향)
  MINOR: 'minor',         // 🟡 개선 권장
  INFO: 'info',           // 🔵 정보
};

// 이슈 생성 헬퍼
function createIssue(module, severity, location, message, fix, meta = {}) {
  return { module, severity, location, message, fix, meta, timestamp: Date.now() };
}

// 점수 계산 (모듈별 가중치)
const MODULE_WEIGHTS = {
  seoMeta: 0.15,
  headings: 0.10,
  structuredData: 0.10,
  imageSEO: 0.10,
  linkSEO: 0.10,
  contentQuality: 0.10,
  coreWebVitals: 0.15,
  resourceTiming: 0.10,
  a11yScan: 0.10,
};

// 전체 점수 계산 (100점 만점)
function calculateOverallScore(moduleScores, enabledModules) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [mod, score] of Object.entries(moduleScores)) {
    if (!enabledModules[mod]) continue;
    const w = MODULE_WEIGHTS[mod] || 0;
    totalWeight += w;
    weightedSum += score * w;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

// 카테고리별 점수
function calculateCategoryScores(moduleScores, enabledModules) {
  const cats = { SEO: [], Performance: [], Accessibility: [], Content: [] };
  for (const [mod, score] of Object.entries(moduleScores)) {
    if (!enabledModules[mod]) continue;
    const meta = MODULE_META[mod];
    if (meta?.category && cats[meta.category] !== undefined) {
      cats[meta.category].push(score);
    }
  }
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  // UI·리포트가 읽는 소문자 camelCase 키로 정규화
  return {
    seo: avg(cats.SEO),
    performance: avg(cats.Performance),
    accessibility: avg(cats.Accessibility),
    content: avg(cats.Content),
  };
}

// 임계값 체크
function checkThresholds(metrics, thresholds) {
  const issues = [];
  if (metrics.lcp != null && metrics.lcp > thresholds.lcp) {
    issues.push(createIssue('coreWebVitals', 'MAJOR', 'LCP',
      `LCP ${metrics.lcp}ms 초과 (기준 ${thresholds.lcp}ms)`,
      '이미지 최적화, 서버 응답 시간 단축, 렌더링 차단 리소스 제거'));
  }
  if (metrics.inp != null && metrics.inp > thresholds.inp) {
    issues.push(createIssue('coreWebVitals', 'MAJOR', 'INP',
      `INP ${metrics.inp}ms 초과 (기준 ${thresholds.inp}ms)`,
      '긴 작업 분할, 불필요한 JS 지연/제거, 웹 워커 활용'));
  }
  if (metrics.cls != null && metrics.cls > thresholds.cls) {
    issues.push(createIssue('coreWebVitals', 'MAJOR', 'CLS',
      `CLS ${metrics.cls} 초과 (기준 ${thresholds.cls})`,
      '이미지/광고/임베드 크기 예약, 폰트 로딩 최적화'));
  }
  return issues;
}

// 결과 시리얼라이즈 (내보내기용)
function serializeResult(result) {
  return JSON.stringify(result, null, 2);
}

// HTML 리포트 생성
function generateHtmlReport(result) {
  const { scores, coreWebVitals, modules, analyzedAt, url } = result;
  const catScores = result.categoryScores || {};
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>PageKit 품질 진단 리포트</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:900px;margin:2rem auto;padding:0 1.5rem;line-height:1.6;color:#1f2937}
h1,h2,h3{color:#111827}.score{font-size:3rem;font-weight:700;text-align:center;margin:1rem 0}
.score-excellent{color:#059669}.score-good{color:#0d9488}.score-fair{color:#d97706}.score-poor{color:#dc2626}
.card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1.5rem;margin:1rem 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1rem 0}
.metric{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:1rem;text-align:center}
.metric .val{font-size:2rem;font-weight:700}.metric .lbl{color:#6b7280;font-size:.875rem}
.issue{padding:.75rem 1rem;margin:.5rem 0;border-radius:6px;border-left:4px solid}
.issue-critical{border-color:#dc2626;background:#fef2f2}.issue-major{border-color:#d97706;background:#fffbeb}
.issue-minor{border-color:#0d9488;background:#f0fdfa}.issue-info{border-color:#3b82f6;background:#eff6ff}
.issue .sev{font-weight:600;text-transform:uppercase;font-size:.75rem;margin-right:.5rem}
.issue .loc{font-family:monospace;font-size:.875rem;color:#6b7280}
.meta{color:#6b7280;font-size:.875rem;margin-top:1rem}
</style></head><body>
<h1>PageKit 품질 진단 리포트</h1>
<p class="meta">URL: ${url} | 분석 시각: ${new Date(analyzedAt).toLocaleString('ko-KR')} | PageKit v${typeof chrome!=='undefined'?chrome.runtime.getManifest().version:'0.7'}</p>

<div class="score score-${scores.overall>=90?'excellent':scores.overall>=70?'good':scores.overall>=50?'fair':'poor'}">${scores.overall}/100</div>

<div class="grid">
  <div class="metric"><div class="val">${scores.seo??'-'}</div><div class="lbl">SEO</div></div>
  <div class="metric"><div class="val">${scores.performance??'-'}</div><div class="lbl">성능</div></div>
  <div class="metric"><div class="val">${scores.accessibility??'-'}</div><div class="lbl">접근성</div></div>
  <div class="metric"><div class="val">${scores.content??'-'}</div><div class="lbl">콘텐츠</div></div>
</div>

<h2>Core Web Vitals</h2>
<div class="grid">
  <div class="metric"><div class="val">${coreWebVitals.lcp??'-'}ms</div><div class="lbl">LCP</div></div>
  <div class="metric"><div class="val">${coreWebVitals.inp??'-'}ms</div><div class="lbl">INP</div></div>
  <div class="metric"><div class="val">${coreWebVitals.cls??'-'}</div><div class="lbl">CLS</div></div>
  <div class="metric"><div class="val">${coreWebVitals.fcp??'-'}ms</div><div class="lbl">FCP</div></div>
  <div class="metric"><div class="val">${coreWebVitals.ttfb??'-'}ms</div><div class="lbl">TTFB</div></div>
</div>

${Object.entries(modules||{}).map(([k,v])=>v?`<div class="card"><h3>${k} <span style="font-weight:400;color:#6b7280">(${v.score}/100)</span></h3>${v.issues?.map(i=>`<div class="issue issue-${i.severity}"><span class="sev">${i.severity}</span>${i.location?'<span class="loc">'+i.location+'</span> ':''}${i.message}<br><small>${i.fix}</small></div>`).join('')||'<p style="color:#059669">이슈 없음</p>'}</div>`:'').join('')}

</body></html>`;
}

// 전역으로 노출 (content scripts가 import 없이 사용 가능하도록)
globalThis.pkQualityRules = {
  DEFAULT_QUALITY_CONFIG,
  MODULE_META,
  SEVERITY,
  createIssue,
  calculateOverallScore,
  calculateCategoryScores,
  checkThresholds,
  serializeResult,
  generateHtmlReport,
  MODULE_WEIGHTS,
};
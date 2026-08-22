// content/quality-analyzer.js — 페이지 품질 진단 엔진 (모듈형, 설정 연동, iframe 협업)

(() => {
  if (globalThis.__pkQualityLoaded) return;
  globalThis.__pkQualityLoaded = true;

  // quality-rules.js는 FRAME_SCRIPTS로 선행 주입되어 전역에서 사용 가능
  const { DEFAULT_QUALITY_CONFIG, MODULE_META, SEVERITY, createIssue, calculateOverallScore, calculateCategoryScores, checkThresholds, serializeResult, generateHtmlReport } = globalThis.pkQualityRules || {};

  // ---------- 설정 로드 ----------
  async function getConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'pk.quality.getConfig' }, (resp) => {
        if (resp?.ok) {
          resolve({ ...DEFAULT_QUALITY_CONFIG, ...resp.data });
        } else {
          resolve(DEFAULT_QUALITY_CONFIG);
        }
      });
    });
  }

  // ---------- 유틸 ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const idleCallback = (fn) => ('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 1);

  // ---------- 모듈: SEO 메타 ----------
  async function collectSEOMeta() {
    const issues = [];
    const meta = {};
    const head = document.head;

    // title
    const title = document.title;
    meta.title = title;
    if (!title || title.trim().length === 0) {
      issues.push(createIssue('seoMeta', SEVERITY.CRITICAL, 'head > title', '제목(title) 태그가 없습니다.', '페이지마다 고유하고 설명적인 title을 추가하세요.'));
    } else if (title.length > 60) {
      issues.push(createIssue('seoMeta', SEVERITY.MINOR, 'head > title', `제목이 ${title.length}자로 깁니다 (권장 50~60자).`, '핵심 키워드를 앞쪽에 두고 60자 내외로 줄이세요.'));
    }

    // meta description
    const descEl = head.querySelector('meta[name="description"]');
    meta.description = descEl?.getAttribute('content') || '';
    if (!meta.description) {
      issues.push(createIssue('seoMeta', SEVERITY.MAJOR, 'meta[name="description"]', '메타 설명(description)이 없습니다.', '150~160자 내외로 페이지 요약을 작성하세요.'));
    } else if (meta.description.length > 160) {
      issues.push(createIssue('seoMeta', SEVERITY.MINOR, 'meta[name="description"]', `메타 설명이 ${meta.description.length}자로 깁니다 (권장 150~160자).`, '핵심 내용을 160자 내외로 요약하세요.'));
    }

    // canonical
    const canonicalEl = head.querySelector('link[rel="canonical"]');
    meta.canonical = canonicalEl?.getAttribute('href') || '';
    if (!meta.canonical) {
      issues.push(createIssue('seoMeta', SEVERITY.MAJOR, 'link[rel="canonical"]', 'Canonical URL이 없습니다.', '중복 콘텐츠 방지를 위해 self-referencing canonical을 추가하세요.'));
    }

    // robots
    const robotsEl = head.querySelector('meta[name="robots"]');
    meta.robots = robotsEl?.getAttribute('content') || '';
    if (meta.robots.toLowerCase().includes('noindex')) {
      issues.push(createIssue('seoMeta', SEVERITY.CRITICAL, 'meta[name="robots"]', 'noindex가 설정되어 있습니다.', '의도적이지 않다면 noindex를 제거하세요.'));
    }

    // viewport
    const viewportEl = head.querySelector('meta[name="viewport"]');
    meta.viewport = viewportEl?.getAttribute('content') || '';
    if (!meta.viewport) {
      issues.push(createIssue('seoMeta', SEVERITY.MAJOR, 'meta[name="viewport"]', 'viewport 메타 태그가 없습니다.', '모바일 친화적 viewport를 설정하세요: width=device-width, initial-scale=1'));
    }

    // charset
    const charsetEl = head.querySelector('meta[charset]');
    meta.charset = charsetEl?.getAttribute('charset') || '';
    if (!meta.charset || meta.charset.toLowerCase() !== 'utf-8') {
      issues.push(createIssue('seoMeta', SEVERITY.MINOR, 'meta[charset]', 'UTF-8 charset이 명시되지 않았습니다.', '<meta charset="UTF-8">를 head 최상단에 추가하세요.'));
    }

    // Open Graph
    const ogTags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'];
    meta.og = {};
    for (const prop of ogTags) {
      const el = head.querySelector(`meta[property="${prop}"]`);
      meta.og[prop] = el?.getAttribute('content') || '';
      if (!meta.og[prop]) {
        issues.push(createIssue('seoMeta', SEVERITY.MINOR, `meta[property="${prop}"]`, `Open Graph ${prop} 태그가 없습니다.`, `소셜 공유 최적화를 위해 og:${prop.split(':')[1]}를 추가하세요.`));
      }
    }

    // Twitter Cards
    const twitterTags = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
    meta.twitter = {};
    for (const name of twitterTags) {
      const el = head.querySelector(`meta[name="${name}"]`);
      meta.twitter[name] = el?.getAttribute('content') || '';
      if (!meta.twitter[name]) {
        issues.push(createIssue('seoMeta', SEVERITY.MINOR, `meta[name="${name}"]`, `Twitter Card ${name} 태그가 없습니다.`, 'Twitter 공유 최적화를 위해 추가하세요.'));
      }
    }

    // hreflang
    const hreflangEls = head.querySelectorAll('link[rel="alternate"][hreflang]');
    meta.hreflang = Array.from(hreflangEls).map((el) => ({
      hreflang: el.getAttribute('hreflang'),
      href: el.getAttribute('href'),
    }));
    if (hreflangEls.length === 0) {
      issues.push(createIssue('seoMeta', SEVERITY.INFO, 'link[rel="alternate"][hreflang]', 'hreflang 태그가 없습니다.', '다국어 사이트라면 hreflang을 추가하세요.'));
    }

    // meta refresh
    const refreshEl = head.querySelector('meta[http-equiv="refresh"]');
    if (refreshEl) {
      issues.push(createIssue('seoMeta', SEVERITY.MAJOR, 'meta[http-equiv="refresh"]', '메타 리프레시가 사용되었습니다.', '301 리다이렉트나 자바스크립트 리다이렉트 대신 사용하지 마세요.'));
    }

    return { issues, meta };
  }

  // ---------- 모듈: 헤딩 계층 ----------
  async function collectHeadings() {
    const issues = [];
    const headings = [];
    let h1Count = 0;
    let lastLevel = 0;

    for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = parseInt(el.tagName[1], 10);
      const text = (el.textContent || '').trim().slice(0, 120);
      headings.push({ level, text, selector: getSelector(el) });

      if (level === 1) h1Count++;

      if (lastLevel > 0 && level > lastLevel + 1) {
        issues.push(createIssue('headings', SEVERITY.MAJOR, getSelector(el),
          `헤딩 레벨이 ${lastLevel}에서 ${level}으로 건너뛰었습니다 (H${lastLevel} → H${level}).`,
          '헤딩 레벨은 한 단계씩만 올라가도록 구성하세요 (H2 → H3 → H4...).'));
      }
      lastLevel = level;
    }

    if (h1Count === 0) {
      issues.push(createIssue('headings', SEVERITY.CRITICAL, 'h1', 'H1 태그가 없습니다.', '페이지마다 하나 이상의 H1을 포함하세요.'));
    } else if (h1Count > 1) {
      issues.push(createIssue('headings', SEVERITY.MAJOR, 'h1', `H1 태그가 ${h1Count}개 있습니다.`, '페이지당 H1은 하나만 사용하세요.'));
    }

    // 헤딩 순서 검증
    let inOrder = true;
    let prevLevel = 0;
    for (const h of headings) {
      if (prevLevel && h.level < prevLevel) inOrder = false;
      prevLevel = h.level;
    }
    if (!inOrder) {
      issues.push(createIssue('headings', SEVERITY.MAJOR, 'document', '헤딩 계층 순서가 올바르지 않습니다.', 'H1 → H2 → H3 순서로 논리적으로 구성하세요.'));
    }

    return { issues, headings, h1Count };
  }

  // ---------- 모듈: 구조화 데이터 ----------
  async function collectStructuredData() {
    const issues = [];
    const structuredData = [];

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    if (scripts.length === 0) {
      issues.push(createIssue('structuredData', SEVERITY.MAJOR, 'script[type="application/ld+json"]', 'JSON-LD 구조화 데이터가 없습니다.', '페이지 성격에 맞는 Schema.org 타입(Product, Article, WebPage 등)을 JSON-LD로 추가하세요.'));
      return { issues, structuredData: [] };
    }

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        structuredData.push(data);

        // 기본 검증
        if (!data['@context'] || !data['@context'].includes('schema.org')) {
          issues.push(createIssue('structuredData', SEVERITY.MAJOR, 'script[type="application/ld+json"]', '@context에 schema.org가 없습니다.', '@context를 "https://schema.org"로 설정하세요.'));
        }
        if (!data['@type']) {
          issues.push(createIssue('structuredData', SEVERITY.MAJOR, 'script[type="application/ld+json"]', '@type이 누락되었습니다.', '페이지 성격에 맞는 @type(Product, Article, WebPage 등)을 지정하세요.'));
        }

        // 타입별 필수 필드 검증
        const type = data['@type'];
        if (type === 'Product' && !data.offers) {
          issues.push(createIssue('structuredData', SEVERITY.MAJOR, 'Product', 'Product 타입에 offers가 없습니다.', '가격/재고 정보를 담은 offers를 포함하세요.'));
        }
        if (type === 'Article' && !data.author) {
          issues.push(createIssue('structuredData', SEVERITY.MINOR, 'Article', 'Article 타입에 author가 없습니다.', '작성자 정보를 추가하세요.'));
        }
        if (type === 'WebPage' && !data.name) {
          issues.push(createIssue('structuredData', SEVERITY.MINOR, 'WebPage', 'WebPage 타입에 name이 없습니다.', '페이지 이름을 추가하세요.'));
        }

      } catch (e) {
        issues.push(createIssue('structuredData', SEVERITY.CRITICAL, 'script[type="application/ld+json"]', `JSON 파싱 오류: ${e.message}`, 'JSON 문법을 수정하세요.'));
      }
    }

    return { issues, structuredData };
  }

  // ---------- 모듈: 이미지 SEO ----------
  async function analyzeImageSEO() {
    const issues = [];
    const images = [];

    for (const img of document.images) {
      const url = img.currentSrc || img.src;
      if (!url || !url.startsWith('http')) continue;

      const alt = img.alt || '';
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const loading = img.loading || '';
      const srcset = img.srcset || '';

      const imgData = { url, w, h, alt: alt.slice(0, 100), loading, hasSrcset: !!srcset };
      images.push(imgData);

      if (!alt) {
        issues.push(createIssue('imageSEO', SEVERITY.MAJOR, getSelector(img), 'alt 텍스트가 없습니다.', '이미지 내용을 설명하는 alt 텍스트를 추가하세요.'));
      } else if (alt.length > 125) {
        issues.push(createIssue('imageSEO', SEVERITY.MINOR, getSelector(img), `alt 텍스트가 ${alt.length}자로 깁니다 (권장 125자 이내).`, '간결하고 핵심적으로 작성하세요.'));
      }

      if (!loading || loading === 'auto') {
        // viewport 밖 이미지는 lazy 권장
        const rect = img.getBoundingClientRect();
        if (rect.top > window.innerHeight) {
          issues.push(createIssue('imageSEO', SEVERITY.MINOR, getSelector(img), '화면 밖 이미지에 lazy-loading이 없습니다.', 'loading="lazy"를 추가하세요.'));
        }
      }

      // WebP/AVIF 포맷 권장 — 실제 확장자 패턴(마지막 세그먼트 끝 2~5자 영숫자)일 때만 검사.
      // 확장자 없는 경로(예: 구글 프록시 ...=S64-C-MO)는 경로 전체가 '확장자'로 잡히는 오탐 방지
      const lastSeg = new URL(url).pathname.split('/').pop() || '';
      const extMatch = lastSeg.match(/\.([a-z0-9]{2,5})$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : null;
      if (ext && !['webp', 'avif'].includes(ext)) {
        issues.push(createIssue('imageSEO', SEVERITY.INFO, getSelector(img), `이미지 포맷이 ${ext.toUpperCase()}입니다.`, 'WebP 또는 AVIF 포맷으로 변환하면 용량 절감 가능.'));
      }

      // srcset 확인
      if (!img.srcset && w > 800) {
        issues.push(createIssue('imageSEO', SEVERITY.INFO, getSelector(img), '큰 이미지에 srcset이 없습니다.', '반응형 이미지를 위해 srcset을 제공하세요.'));
      }
    }

    return { issues, images, totalImages: images.length };
  }

  // ---------- 모듈: 링크 분석 ----------
  async function analyzeLinkSEO() {
    const issues = [];
    const links = [];

    for (const a of document.querySelectorAll('a[href]')) {
      const url = a.href;
      if (!url || !url.startsWith('http')) continue;

      const text = (a.textContent || '').trim().slice(0, 100);
      const rel = a.rel || '';
      const isInternal = new URL(url).origin === location.origin;
      const relVals = rel.split(/\s+/).filter(Boolean);

      const linkData = { url, text: text.slice(0, 80), internal: isInternal, rel: relVals };
      links.push(linkData);

      // 내부 링크에 nofollow가 있으면 경고
      if (isInternal && relVals.includes('nofollow')) {
        issues.push(createIssue('linkSEO', SEVERITY.MINOR, getSelector(a), '내부 링크에 nofollow가 있습니다.', '내부 링크에는 nofollow를 사용하지 마세요.'));
      }

      // 외부 링크에 noopener/noreferrer 확인
      if (!isInternal && !relVals.includes('noopener')) {
        issues.push(createIssue('linkSEO', SEVERITY.MINOR, getSelector(a), '외부 링크에 rel="noopener"가 없습니다.', '보안/성능을 위해 rel="noopener noreferrer"를 추가하세요.'));
      }

      // 앵커 텍스트 검사
      if (!text || text.length < 2) {
        issues.push(createIssue('linkSEO', SEVERITY.MINOR, getSelector(a), '앵커 텍스트가 없거나 너무 짧습니다.', '링크 목적지를 설명하는 의미 있는 앵커 텍스트를 사용하세요.'));
      }
    }

    // 리다이렉트 체인 감지는 백그라운드에서 HEAD 요청으로 수행 (여기서는 생략)

    return { issues, links, totalLinks: links.length, internal: links.filter(l => l.internal).length, external: links.filter(l => !l.internal).length };
  }

  // ---------- 모듈: 콘텐츠 품질 ----------
  async function analyzeContentQuality() {
    const issues = [];
    const bodyText = (document.body?.innerText || '').trim();
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
    const charCount = bodyText.length;

    // 가독성 (Flesch-Kincaid 간단 버전)
    const sentences = bodyText.split(/[.!?。！？]/).filter(s => s.trim().length > 0).length;
    const words = wordCount;
    const avgWordsPerSentence = sentences > 0 ? words / sentences : 0;
    const flesch = sentences > 0 ? 206.835 - 1.015 * avgWordsPerSentence - 84.6 * (words / sentences) : 0; // 간단화

    // 키워드 밀도 (상위 5개 단어)
    const wordFreq = {};
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','her','its','our','their']);
    for (const w of bodyText.toLowerCase().match(/\b\w{2,}\b/g) || []) {
      if (!stopWords.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
    const topKeywords = Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w,c])=>({word:w,count:c}));

    // 얇은 콘텐츠 감지
    if (wordCount < 300) {
      issues.push(createIssue('contentQuality', SEVERITY.MAJOR, 'body', `본문 단어 수가 ${wordCount}개로 적습니다 (권장 300자 이상).`, '충분한 깊이의 콘텐츠를 작성하세요.'));
    }

    // 키워드 스터핑 감지
    for (const {word, count} of topKeywords) {
      const density = (count / words * 100).toFixed(1);
      if (count > 10 && density > 3) {
        issues.push(createIssue('contentQuality', SEVERITY.MINOR, 'body', `키워드 "${word}" 밀도가 ${density}%로 높습니다.`, '자연스러운 문맥에서 키워드를 사용하세요.'));
      }
    }

    return {
      issues,
      stats: { wordCount, charCount, sentences, avgWordsPerSentence: Math.round(avgWordsPerSentence*10)/10, fleschScore: Math.round(flesch*10)/10 },
      topKeywords,
    };
  }

  // ---------- 셀렉터 생성 ----------
  function getSelector(el) {
    if (el.id) return `#${el.id}`;
    let path = [];
    let cur = el;
    while (cur && cur !== document.body) {
      let sel = cur.tagName.toLowerCase();
      if (cur.className) {
        const classes = cur.className.split(/\s+/).filter(c => c && !c.startsWith('pk-'));
        if (classes.length) sel += '.' + classes[0];
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(c => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          sel += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(sel);
      cur = parent;
    }
    return path.join(' > ').slice(0, 200);
  }

  // ---------- Core Web Vitals ----------
  // web-vitals.js에서 별도 측정 후 여기서 결과만 받음

  // ---------- 리소스 타이밍 ----------
  async function collectResourceTiming() {
    const issues = [];
    const resources = performance.getEntriesByType('resource');
    const summary = {
      total: resources.length,
      totalBytes: 0,
      byType: {},
      slowest: [],
      uncompressed: [],
      noCache: [],
    };

    for (const r of resources) {
      const size = r.transferSize || r.encodedBodySize || 0;
      summary.totalBytes += size;
      const type = r.initiatorType || 'other';
      summary.byType[type] = (summary.byType[type] || 0) + size;

      // 압축 확인
      if (r.encodedBodySize && r.decodedBodySize && r.encodedBodySize === r.decodedBodySize && r.encodedBodySize > 1024) {
        summary.uncompressed.push(r.name);
      }

      // 캐시 확인
      if (r.transferSize === 0 && r.decodedBodySize > 0) {
        // 캐시 히트
      } else if (r.transferSize > 0 && !r.toJSON().hasOwnProperty('cache')) {
        // 캐시 헤더 확인 불가 (PerformanceResourceTiming에 cache 상태 없음)
      }
    }

    // 상위 5개 느린 리소스
    summary.slowest = resources
      .filter(r => r.duration > 100)
      .sort((a,b) => b.duration - a.duration)
      .slice(0, 5)
      .map(r => ({ url: r.name.slice(0,100), duration: Math.round(r.duration), size: r.transferSize }));

    if (summary.uncompressed.length > 0) {
      issues.push(createIssue('resourceTiming', SEVERITY.MAJOR, 'response headers',
        `${summary.uncompressed.length}개 리소스가 압축되지 않았습니다 (gzip/br).`,
        '서버에서 gzip 또는 Brotli 압축을 활성화하세요.'));
    }

    return { issues, summary };
  }

  // ---------- 메인 분석 실행 ----------
  async function runQualityAnalysis(enabledModules = {}) {
    const config = await getConfig();
    const activeModules = { ...DEFAULT_QUALITY_CONFIG.modules, ...enabledModules };

    const results = { modules: {}, issues: [] };
    const startTime = performance.now();

    // 모듈 실행 순서 (의존성 고려)
    const moduleOrder = [
      'seoMeta', 'headings', 'structuredData', 'imageSEO', 'linkSEO',
      'contentQuality', 'coreWebVitals', 'resourceTiming', 'a11yScan'
    ];

    for (const mod of moduleOrder) {
      if (!activeModules[mod]) continue;

      await idleCallback(() => {});
      try {
        let modResult = {};
        switch (mod) {
          case 'seoMeta': modResult = await collectSEOMeta(); break;
          case 'headings': modResult = await collectHeadings(); break;
          case 'structuredData': modResult = await collectStructuredData(); break;
          case 'imageSEO': modResult = await analyzeImageSEO(); break;
          case 'linkSEO': modResult = await analyzeLinkSEO(); break;
          case 'contentQuality': modResult = await analyzeContentQuality(); break;
          case 'resourceTiming': modResult = await collectResourceTiming(); break;
          case 'coreWebVitals': modResult = { cwv: await getCWV() }; break;
          case 'a11yScan': modResult = await runA11yScan(); break;
        }
        results.modules[mod] = modResult;
        if (modResult.issues) results.issues.push(...modResult.issues);
      } catch (e) {
        DebugLogger.error('QUALITY', `모듈 ${mod} 실행 오류: ${e.message}`);
        results.modules[mod] = { error: e.message };
      }
    }

    // CWV 임계값 체크
    if (activeModules.coreWebVitals && results.modules.coreWebVitals?.cwv) {
      const threshIssues = checkThresholds(results.modules.coreWebVitals.cwv, DEFAULT_QUALITY_CONFIG.thresholds);
      results.issues.push(...threshIssues);
    }

    // 점수 계산
    const moduleScores = {};
    for (const [mod, data] of Object.entries(results.modules)) {
      if (!activeModules[mod]) continue;
      moduleScores[mod] = calculateModuleScore(mod, data);
    }

    const overall = calculateOverallScore(moduleScores, activeModules);
    const categoryScores = calculateCategoryScores(moduleScores, activeModules);

    const result = {
      url: location.href,
      title: document.title,
      analyzedAt: Date.now(),
      duration: Math.round(performance.now() - startTime),
      scores: { overall, ...categoryScores, ...moduleScores },
      coreWebVitals: results.modules.coreWebVitals?.cwv || {},
      modules: results.modules,
      issues: results.issues,
      totalIssues: results.issues.length,
      config: { modules: activeModules },
    };

    return result;
  }

  // 모듈별 점수 계산
  function calculateModuleScore(mod, data) {
    if (!data || data.error) return 0;
    const base = 100;
    const issues = data.issues || [];
    let penalty = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case SEVERITY.CRITICAL: penalty += 25; break;
        case SEVERITY.MAJOR: penalty += 15; break;
        case SEVERITY.MINOR: penalty += 5; break;
        case SEVERITY.INFO: penalty += 1; break;
      }
    }
    return Math.max(0, base - penalty);
  }

  // CWV 측정 (web-vitals.js에서 제공)
  async function getCWV() {
    // web-vitals가 __pkCWV를 즉시 노출하더라도 옵저버 버퍼 전달은 비동기 —
    // LCP 도착(또는 타임아웃)까지 폴링해야 null 대신 실측값이 반환된다
    const start = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const cwv = window.__pkCWV;
        if (cwv && cwv.lcp != null) { resolve(cwv); return; }
        if (Date.now() - start >= 1000) {
          if (!cwv) DebugLogger.warn('QUALITY', '__pkCWV 미노출 — web-vitals 주입 확인 필요');
          resolve(cwv || {});
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  // a11y 스캔 (a11y-scan.js에서 제공)
  async function runA11yScan() {
    return new Promise((resolve) => {
      if (window.__pkA11y) {
        window.__pkA11y().then(resolve).catch(() => resolve({ issues: [] }));
      } else {
        setTimeout(() => resolve({ issues: [], note: 'axe-core not ready' }), 100);
      }
    });
  }

  // ---------- iframe 협업 ----------
  // 메인 프레임에서 iframe에 품질 분석 요청
  async function collectFrameQuality(mainResult) {
    if (window !== window.top) return;

    const frames = [...document.querySelectorAll('iframe[src]')].filter(f => f.src.startsWith('http'));
    if (!frames.length) return;

    const requestId = `q-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const received = new Map();
    const pending = new Set(frames);

    const onMsg = (e) => {
      if (e.data?.type !== 'pk.quality.frame.result' || e.data.requestId !== requestId) return;
      const f = frames.find(fr => fr.contentWindow === e.source);
      if (!f || !pending.has(f)) return;
      received.set(e.source, e.data.quality);
      pending.delete(f);
      if (!pending.size) finish();
    };

    const send = () => {
      for (const f of frames) {
        if (!pending.has(f)) continue;
        try { f.contentWindow.postMessage({ type: 'pk.quality.frame.analyze', requestId }, '*'); }
        catch { pending.delete(f); }
      }
    };

    const finish = () => {
      window.removeEventListener('message', onMsg);
      for (const q of received.values()) {
        if (!q) continue;
        // iframe 결과를 메인 결과에 병합 (모듈별로 issues 합치기)
        for (const [mod, data] of Object.entries(q.modules || {})) {
          if (!mainResult.modules[mod]) mainResult.modules[mod] = { issues: [] };
          if (data.issues) mainResult.modules[mod].issues.push(...data.issues);
        }
        if (q.issues) mainResult.issues.push(...q.issues);
      }
      // 점수 재계산
      mainResult.scores.overall = calculateOverallScore(
        Object.fromEntries(Object.entries(mainResult.modules).map(([k,v])=>[k,calculateModuleScore(k,v)])),
        DEFAULT_QUALITY_CONFIG.modules
      );
      mainResult.categoryScores = calculateCategoryScores(
        Object.fromEntries(Object.entries(mainResult.modules).map(([k,v])=>[k,calculateModuleScore(k,v)])),
        DEFAULT_QUALITY_CONFIG.modules
      );
    };

    window.addEventListener('message', onMsg);
    send();
    setTimeout(() => { if (pending.size) send(); }, 1000);
    setTimeout(finish, 3000);
  }

  // ---------- 메시지 리스너 ----------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'pk.quality.analyze') {
      if (window !== window.top) return false; // 메인 프레임만
      const enabledModules = message.payload?.modules || {};
      runQualityAnalysis(message.payload?.modules).then(async (result) => {
        await collectFrameQuality(result);
        sendResponse({ ok: true, data: result });
      });
      return true;
    }

    if (message?.type === 'pk.quality.getConfig') {
      getConfig().then(config => sendResponse({ ok: true, data: config }));
      return true;
    }

    // iframe에서 분석 요청 수신
    if (message?.type === 'pk.quality.frame.analyze') {
      if (window === window.top) return false;
      runQualityAnalysis(message.payload?.modules).then(result => {
        window.parent.postMessage({
          type: 'pk.quality.frame.result',
          requestId: message.requestId,
          quality: result,
        }, '*');
      });
      return true;
    }

    return false;
  });

  DebugLogger.feature('QUALITY', '품질 진단 엔진 로드 완료');
})();
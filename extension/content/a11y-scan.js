// content/a11y-scan.js — axe-core 래퍼
// axe-core(content/axe.min.js)는 service-worker가 격리 월드에 주입 → globalThis.axe 직접 사용
// 미주입 시 최소 검사 로직으로 폴백

(() => {
  if (globalThis.__pkA11yLoaded) return;
  globalThis.__pkA11yLoaded = true;

  let axeCore = null;
  let axeLoaded = false;

  // axe-core는 service-worker가 content/axe.min.js를 격리 월드에 주입 → globalThis.axe 직접 사용
  function loadAxeCore() {
    if (axeLoaded) return axeCore;
    axeCore = globalThis.axe || null;
    if (axeCore) {
      axeLoaded = true;
      DebugLogger.feature('A11Y', 'axe-core 로드 완료');
    } else {
      DebugLogger.warn('A11Y', 'axe-core 미주입 - 최소 검사로 폴백');
    }
    return axeCore;
  }

  // 최소 접근성 검사 (axe-core 로드 실패 시 폴백)
  function runMinimalA11y() {
    const issues = [];

    // 1) 이미지 alt 텍스트
    for (const img of document.images) {
      if (!img.alt && !img.hasAttribute('role') || img.getAttribute('role') === 'presentation') {
        continue;
      }
      if (!img.alt) {
        issues.push({
          id: 'image-alt',
          impact: 'critical',
          message: '이미지에 alt 속성이 없습니다.',
          selector: getSelector(img),
          help: '이미지 내용을 설명하는 alt 텍스트를 추가하세요.',
        });
      }
    }

    // 2) 폼 레이블
    for (const input of document.querySelectorAll('input, select, textarea')) {
      if (input.type === 'hidden') continue;
      const id = input.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');
      const title = input.title;
      if (!label && !ariaLabel && !ariaLabelledby && !title) {
        issues.push({
          id: 'label',
          impact: 'critical',
          message: '폼 컨트롤에 접근 가능한 이름이 없습니다.',
          selector: getSelector(input),
          help: '<label for="...">, aria-label, aria-labelledby 또는 title 속성으로 레이블을 제공하세요.',
        });
      }
    }

    // 3) 색상 대비 (간단 체크 - 계산은 복잡하므로 플래그만)
    // 실제 대비 계산은 axe-core에 위임

    // 4) 문서 언어
    if (!document.documentElement.lang) {
      issues.push({
        id: 'html-has-lang',
        impact: 'serious',
        message: 'HTML 문서에 lang 속성이 없습니다.',
        selector: 'html',
        help: '<html lang="ko">와 같이 문서 언어를 지정하세요.',
      });
    }

    // 5) 페이지 제목
    if (!document.title || document.title.trim().length === 0) {
      issues.push({
        id: 'document-title',
        impact: 'serious',
        message: '페이지에 제목(title)이 없습니다.',
        selector: 'title',
        help: '페이지 내용을 요약하는 고유한 title을 추가하세요.',
      });
    }

    // 6) 헤딩 순서 (기본 체크)
    let lastLevel = 0;
    for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = parseInt(h.tagName[1], 10);
      if (lastLevel > 0 && level > lastLevel + 1) {
        issues.push({
          id: 'heading-order',
          impact: 'moderate',
          message: `헤딩 레벨이 건너뛰었습니다 (H${lastLevel} → H${level}).`,
          selector: getSelector(h),
          help: '헤딩 레벨은 한 단계씩만 올라가도록 구성하세요.',
        });
      }
      lastLevel = level;
    }

    // 6) 랜드마크
    const landmarks = document.querySelectorAll('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="search"], [role="complementary"], header, nav, main, footer, aside, search');
    if (landmarks.length === 0) {
      issues.push({
        id: 'landmark-one-main',
        impact: 'moderate',
        message: '페이지에 랜드마크 영역이 없습니다.',
        selector: 'body',
        help: '<header>, <nav>, <main>, <footer> 또는 role 속성으로 랜드마크를 제공하세요.',
      });
    }

    // axe 포맷으로 변환
    const violations = issues.map(issue => ({
      id: issue.id,
      impact: issue.impact,
      description: issue.message,
      help: issue.help,
      nodes: [{ target: [issue.selector], html: '', failureSummary: issue.message }],
    }));

    return { violations, passes: [], incomplete: [], inapplicable: [], timestamp: Date.now() };
  }

  // 전체 a11y 스캔 실행
  window.__pkA11y = async function runA11yScan() {
    const axe = await loadAxeCore();
    if (axe) {
      try {
        // axe-core 실행 (전체 페이지)
        const results = await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
          resultTypes: ['violations', 'passes', 'incomplete', 'inapplicable'],
        });
        return {
          violations: results.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.map(n => ({
              target: n.target,
              html: n.html?.slice(0, 200),
              failureSummary: n.failureSummary,
            })),
          })),
          passes: results.passes.map(p => ({ id: p.id, impact: p.impact })),
          incomplete: results.incomplete,
          inapplicable: results.inapplicable,
          timestamp: Date.now(),
        };
      } catch (e) {
        DebugLogger.error('A11Y', `axe-core 실행 오류: ${e.message}`);
      }
    }

    // 폴백: 최소 검사
    DebugLogger.warn('A11Y', 'axe-core 사용 불가 - 최소 검사 실행');
    return runMinimalA11y();
  };

  // 셀렉터 헬퍼
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
          sel += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
      }
      path.unshift(sel);
      cur = parent;
    }
    return path.join(' > ').slice(0, 200);
  }

  DebugLogger.feature('A11Y', '접근성 스캔 모듈 로드 완료 (axe-core 내장 + 최소 폴백)');
})();
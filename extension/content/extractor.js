// content/extractor.js — 페이지 분석 실행 (F2/F3/F4)
// ANALYZE_PAGE 메시지 수신 → 본문(readability) + 미디어/링크 수집 → 결과 반환
// 주의: 원본 DOM 비파괴 (clone 사용), payload ≤1MB

(() => {
  if (globalThis.__pkExtractorLoaded) return ;
  globalThis.__pkExtractorLoaded = true ;

  const T0 = performance.now() ;

  // ---------- 안전한 sanitize (script/iframe/form 등 제거) ----------
  const FORBID_TAGS = new Set(['script', 'style', 'iframe', 'form', 'input', 'button', 'noscript']) ;
  const FORBID_ATTR = /^on|^style$/i ;

  function sanitize(root) {
    const stack = [root] ;
    while (stack.length) {
      const node = stack.pop() ;
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (FORBID_TAGS.has(node.tagName.toLowerCase())) {
          node.remove() ;
          continue ;
        }
        for (const attr of [...node.attributes]) {
          if (FORBID_ATTR.test(attr.name)) node.removeAttribute(attr.name) ;
        }
        stack.push(...node.children) ;
      }
    }
    return root ;
  }

  // ---------- 본문 추출 (Readability, clone 기반) ----------
  function extractArticle() {
    const ReadabilityCtor = globalThis.Readability || (globalThis.Readability && globalThis.Readability.default) ;
    if (!ReadabilityCtor) return null ;
    const clone = document.cloneNode(true) ;
    sanitize(clone.documentElement) ;
    try {
      const reader = new ReadabilityCtor(clone, { charThreshold: 500, keepClasses: false }) ;
      return reader.parse() ;
    } catch (e) {
      return null ;
    }
  }

  // ---------- 본문 내 URL 집합 (inArticle 판정용) ----------
  function collectArticleUrls(articleHtml) {
    const container = document.createElement('div') ;
    container.innerHTML = articleHtml || '' ;
    const urls = new Set() ;
    for (const img of container.querySelectorAll('img')) {
      const u = firstHttp(img.currentSrc, img.src, img.dataset?.src) ;
      if (u) urls.add(u) ;
    }
    for (const a of container.querySelectorAll('a[href]')) {
      const u = a.href ;
      if (u && u.startsWith('http')) urls.add(u) ;
    }
    for (const v of container.querySelectorAll('video source[src], video[src], audio source[src], audio[src], iframe[src]')) {
      const u = v.src || v.getAttribute('src') ;
      if (u && u.startsWith('http')) urls.add(u) ;
    }
    return urls ;
  }

  // ---------- 미디어/링크 수집 ----------
  function pickLargestSrcset(img) {
    const srcset = img.getAttribute('srcset') ;
    if (!srcset) return null ;
    let best = null, bestW = 0 ;
    for (const part of srcset.split(',')) {
      const [url, desc] = part.trim().split(/\s+/) ;
      const w = desc?.endsWith('w') ? parseInt(desc, 10) : 0 ;
      if (url && w > bestW) { best = url; bestW = w ; }
    }
    return best ;
  }

  // http URL 우선 선택: 스마트에디터 등 src가 data:(1px placeholder)이고 data-src에 실제 URL이 있는 구조 대응
  function firstHttp(...urls) {
    for (const u of urls) if (u && u.startsWith('http')) return u ;
    return null ;
  }

  // ---------- 다운로드 가능성 판정 ----------
  // 기준: 실제 미디어/파일 URL만 다운로드 가능.
  // m3u8(HLS)은 세그먼트 병합 저장 지원 → 가능 (CORS 허용 CDN 전제, 차단 사이트는 실패 안내).
  // mpd(DASH)는 세그먼트 병합 미구현 → 불가. kind='og'(embed 페이지 URL), 'iframe'(플레이어 페이지)도 저장 시 HTML이 받아짐 → 불가능.
  function downloadableOf(url, kind) {
    if (!url || !url.startsWith('http')) return false ;
    if (/\.(m3u8|mpd)(\?|#|$)/i.test(url)) return true ;
    if (kind === 'dash' || kind === 'stream' || kind === 'og' || kind === 'iframe') return false ;
    if (kind === 'video' || kind === 'source' || kind === 'player' || kind === 'audio') return true ;
    if (kind === 'img' || kind === 'bg' || kind === 'poster') return true ;
    return false ;
  }

  function collectImages() {
    const images = [] ;
    const seen = new Set() ;
    const add = (el, url, source) => {
      if (!url || !url.startsWith('http') || seen.has(url)) return ;
      // 자기 페이지를 가리키는 img src 제외 (유튜브 shorts: src="https://.../shorts/<id>" —
      // 이미지가 아닌 페이지 URL을 이미지로 추출하는 것 방지)
      try {
        const u = new URL(url) ;
        if (u.origin === location.origin && imageTypeOf(url) === 'unknown' && u.pathname.startsWith(location.pathname)) return ;
      } catch { /* 잘못된 URL 무시 */ }
      seen.add(url) ;
      const rect = el.getBoundingClientRect() ;
      // naturalWidth 우선: 로드된 이미지는 실제 원본 크기, 미로드/스크롤 전이면 DOM 크기
      const nw = el.naturalWidth || 0 ;
      const nh = el.naturalHeight || 0 ;
      images.push({
        id: `i${images.length}`,
        url,
        source, // 'img' | 'bg' | 'poster'
        w: nw || (rect.width > 0 ? Math.round(rect.width) : 0),
        h: nh || (rect.height > 0 ? Math.round(rect.height) : 0),
        alt: el.alt || '',
        type: imageTypeOf(url),
        downloadable: downloadableOf(url, 'img'),
      }) ;
    } ;
    for (const img of document.images) {
      add(img, firstHttp(pickLargestSrcset(img), img.currentSrc, img.src, img.dataset?.src), 'img') ;
    }

    // og:image 대표 이미지 우선 배치 (YouTube 썸네일 등 — DOM에 없어도 메타로 보장)
    const ogImage = (() => {
      for (const m of document.querySelectorAll('meta[property="og:image"], meta[property="og:image:url"], meta[property="og:image:secure_url"]')) {
        const c = m.content ;
        if (c && c.startsWith('http')) return c ;
      }
      return null ;
    })() ;
    if (ogImage) {
      // 캐시 버스팅 쿼리 등으로 og:image와 DOM img의 URL이 달라도 같은 이미지로 판정 (쿼리 제거 비교)
      const ogBase = ogImage.split('?')[0] ;
      const idx = images.findIndex((i) => i.url.split('?')[0] === ogBase) ;
      if (idx === -1) {
        images.unshift({ id: 'i0', url: ogImage, source: 'og', w: 0, h: 0, alt: '', type: imageTypeOf(ogImage) }) ;
      } else if (idx > 0) {
        images.unshift(images.splice(idx, 1)[0]) ;
      }
      images.forEach((im, i) => { im.id = `i${i}` ; }) ;
    }
    return images ;
  }

  function collectVideos() {
    const videos = [] ;
    const seen = new Set() ;
    // blob:/data: 재생(YouTube 등) 대응 — og:video 메타에서 원본 URL 폴백
    const ogVideo = (() => {
      for (const m of document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"]')) {
        const c = m.content ;
        if (c && c.startsWith('http')) return c ;
      }
      return null ;
    })() ;
    const push = (el, url, kind) => {
      if (!url || !url.startsWith('http') || seen.has(url)) return ;
      seen.add(url) ;
      const lower = url.toLowerCase() ;
      videos.push({
        id: `v${videos.length}`,
        url,
        kind, // 'video' | 'source' | 'hls' | 'dash' | 'og'
        type: lower.endsWith('.m3u8') ? 'hls' : lower.endsWith('.mpd') ? 'dash' : (url.split('?')[0].split('.').pop() || 'mp4').toLowerCase(),
        label: '',
        inArticle: false,
        downloadable: downloadableOf(url, kind),
      }) ;
    } ;
    for (const v of document.querySelectorAll('video')) {
      const src = v.currentSrc || v.src ;
      // blob:/data: 등 http가 아닌 재생 소스는 og:video로 대체 (kind='og' — 페이지 대표 동영상)
      const realSrc = (src && src.startsWith('http')) ? src : null ;
      push(v, realSrc || ogVideo, realSrc ? 'video' : 'og') ;
      for (const s of v.querySelectorAll('source[src]')) push(s, s.src, 'source') ;
    }

    // blob: 재생(JW Player 등) 대응 — 플레이어 API/설정/네트워크에서 실제 파일 URL 폴백
    const playerUrls = new Set() ;
    try {
      // 1) jwplayer 플레이리스트 (현재 재생 중인 항목의 소스 목록)
      if (globalThis.jwplayer && typeof globalThis.jwplayer === 'function') {
        const pl = globalThis.jwplayer()?.getPlaylist?.() || [] ;
        for (const item of pl) {
          const sources = item.sources || (item.file ? [{ file: item.file }] : []) ;
          for (const s of sources) {
            if (s.file && s.file.startsWith('http')) playerUrls.add(s.file) ;
          }
        }
      }
    } catch {}
    try {
      // 2) 인라인 설정 스크립트: file/source/src 키의 mp4·m3u8·mpd URL
      const rx = /(?:file|source|src)\s*[:=]\s*["'](https?:\/\/[^"']+?\.(?:mp4|m3u8|mpd)(?:\?[^"']*)?)["']/gi ;
      for (const s of document.querySelectorAll('script:not([src])')) {
        for (const m of s.textContent.matchAll(rx)) playerUrls.add(m[1]) ;
      }
    } catch {}
    try {
      // 3) blob: 재생 중일 때 실제 네트워크 미디어 요청 후보 (performance entries)
      // 시그니처 쿼리(토큰)는 다운로드 시 필수 — 제거하지 않고 전체 URL 보존
      // 확장자 없는 서명 CDN(틱톡 v16-webapp-prime 등) 대응 — 실제 미디어 호스트 + xhr/fetch/미디어 리소스로 선별.
      // transferSize는 SW/캐시 경유 시 0으로 보고되므로 사용하지 않음 (API json 등은 호스트 필터로 차단)
      const MEDIA_HOST = /\/(?:[^/]+\.)*(v\d+-webapp-?prime|v\d+-webapp|tiktokcdn|googlevideo|cdn-video)\./i ;
      const NON_MEDIA = /\.(js|css|png|jpe?g|svg|gif|webp|ico|json|woff2?|wasm|html?)(\?|$)/i ;
      for (const e of performance.getEntriesByType('resource')) {
        const n = e.name ;
        if (/\.(mp4|m3u8|mpd|ts|webm|mov)(\?|$)/i.test(n)) { playerUrls.add(n) ; continue ; }
        if (!NON_MEDIA.test(n) && (e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch' || e.initiatorType === 'video' || e.initiatorType === 'audio') && MEDIA_HOST.test(n)) {
          playerUrls.add(n) ;
        }
      }
    } catch {}
    for (const u of playerUrls) push(null, u, 'player') ;
    // 플레이어 폴백 URL은 다운로드 시 CDN Referer 체크 대비 — 출처 페이지 기록
    for (const v of videos) {
      if (v.kind === 'player' && !v.referer) v.referer = location.href ;
    }

    // 교차 오리진 iframe 내부 플레이어 (blob 재생) — DOM 접근 불가, embed URL을 동영상 후보로 표시
    try {
      for (const f of document.querySelectorAll('iframe[src]')) {
        const u = f.src ;
        if (u && u.startsWith('http')) {
          const p = new URL(u).pathname ;
          if (/embed|player|stream|watch/i.test(p)) {
            const before = videos.length ;
            push(null, u, 'iframe') ;
            if (videos.length > before) {
              const item = videos[videos.length - 1] ;
              item.type = 'iframe' ;
              item.label = '플레이어(iframe)' ;
              // embed 플레이어는 주 콘텐츠가 대부분 — 본문 판정 밖이어도 "본문만" 필터에서 제외되지 않도록 표시
              item.inArticle = true ;
            }
          }
        }
      }
    } catch {}
    // 매니페스트(m3u8/mpd)는 동영상이 아닌 스트림으로 분리 — 어느 경로(playerUrls/iframe 협업 등)로
    // 발견돼도 스트림 탭에 통일 (동영상 탭 = 실제 재생 소스만)
    const manifestVideos = [] ;
    for (let i = videos.length - 1 ; i >= 0 ; i--) {
      if (/\.(m3u8|mpd)(\?|#|$)/i.test(videos[i].url)) {
        const mv = videos.splice(i, 1)[0] ;
        mv.protocol = mv.url.toLowerCase().endsWith('.mpd') ? 'dash' : 'hls' ;
        manifestVideos.push(mv) ;
      }
    }
    manifestVideos.reverse() ;
    return { videos, manifestVideos } ;
  }

  function collectAudio() {
    const audios = [] ;
    const seen = new Set() ;
    for (const a of document.querySelectorAll('audio')) {
      const src = a.currentSrc || a.src ;
      if (src?.startsWith('http') && !seen.has(src)) {
        seen.add(src) ;
        audios.push({
          id: `a${audios.length}`,
          url: src,
          type: (src.split('?')[0].split('.').pop() || 'mp3').toLowerCase(),
          inArticle: false,
          downloadable: downloadableOf(src, 'audio'),
        }) ;
      }
      for (const s of a.querySelectorAll('source[src]')) {
        const u = s.src ;
        if (u?.startsWith('http') && !seen.has(u)) {
          seen.add(u) ;
          audios.push({ id: `a${audios.length}`, url: u, type: 'audio', inArticle: false, downloadable: downloadableOf(u, 'audio') }) ;
        }
      }
    }
    return audios ;
  }

  function collectLinks() {
    const links = [] ;
    const seen = new Set() ;
    const FILE_RE = /\.(pdf|zip|rar|7z|tar|gz|mp4|webm|mkv|mp3|wav|flac|xlsx?|docx?|pptx?|csv|json|xml)(\?|#|$)/i ;
    for (const a of document.querySelectorAll('a[href]')) {
      const url = a.href ;
      if (!url || !url.startsWith('http') || seen.has(url)) continue ;
      seen.add(url) ;
      const m = url.match(FILE_RE) ;
      links.push({
        id: `l${links.length}`,
        url,
        text: (a.textContent || '').trim().slice(0, 120),
        type: m ? m[1].toLowerCase() : 'html',
        inArticle: false,
        downloadable: m !== null,
      }) ;
    }
    return links ;
  }

  // ---------- HLS/DASH 후보: DOM 소스 + 선언된 <link> preload ----------
  function streamName(url) {
    try {
      const base = new URL(url).pathname.split('/').filter(Boolean).pop() || 'stream' ;
      return decodeURIComponent(base).replace(/\.(m3u8|mpd)$/i, '').replace(/[\\/:*?"<>|]/g, '_') ;
    } catch { return 'stream' ; }
  }

  function collectStreams() {
    const streams = [] ;
    const seen = new Set() ;
    const candidates = [
      ...document.querySelectorAll('video[src*=".m3u8"], video source[src*=".m3u8"], video[src*=".mpd"], video source[src*=".mpd"]'),
      ...document.querySelectorAll('link[rel="preload"][href*=".m3u8"], link[rel="preload"][href*=".mpd"]'),
    ] ;
    for (const el of candidates) {
      const url = el.src || el.href || el.getAttribute('src') || el.getAttribute('href') ;
      if (url?.startsWith('http') && !seen.has(url)) {
        seen.add(url) ;
        streams.push({
          id: `s${streams.length}`,
          url,
          name: streamName(url),
          protocol: url.toLowerCase().endsWith('.mpd') ? 'dash' : 'hls',
          qualities: [],
          inArticle: false,
          downloadable: url.toLowerCase().endsWith('.mpd') ? false : true, // m3u8 = 세그먼트 병합 저장 가능, mpd는 미지원
        }) ;
      }
    }
    return streams ;
  }

  // ---------- 이미지 확장자 판정 ----------
  // 확장자를 추출해도 이미지 종류가 아니면 'unknown' (파일명 뒷자리 노출 방지)
  const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'bmp', 'ico', 'tif', 'tiff', 'jfif', 'heic', 'heif']) ;
  function imageTypeOf(url) {
    const ext = (String(url).split('?')[0].split('.').pop() || '').toLowerCase() ;
    return IMAGE_EXTS.has(ext) ? ext : 'unknown' ;
  }

  // ---------- 본문 배경 이미지 스캔 (성능 보호: 본문 컨테이너 + 인라인 bg 전역 + 필요 시 computed 후보) ----------
  function collectBgImages(articleContainer, extraScan) {
    const out = [] ;
    const bgRe = /url\(["']?([^"')]+)["']?\)/g ;
    const seen = new Set() ;
    const pushFrom = (el) => {
      const bg = el.style?.backgroundImage || getComputedStyle(el).backgroundImage ;
      if (!bg || bg === 'none') return ;
      let m ;
      while ((m = bgRe.exec(bg)) !== null) {
        const url = new URL(m[1], location.href).href ;
        if (url.startsWith('http') && !seen.has(url)) {
          seen.add(url) ;
          out.push({ id: `i${out.length}`, url, source: 'bg', w: 0, h: 0, alt: '', type: imageTypeOf(url) }) ;
        }
      }
    } ;
    if (articleContainer) {
      for (const el of articleContainer.querySelectorAll('*')) pushFrom(el) ;
    }
    // 인라인 background-image 전역 (쇼핑몰 등 인라인 스타일 이미지 — 저비용)
    for (const el of document.querySelectorAll('[style*="background-image"], [style*="background"]')) pushFrom(el) ;
    // 이미지가 거의 없는 페이지(유튜브 shorts 피드 등 og:image 없음 + 클래스 CSS bg 썸네일):
    // 썸네일/이미지 후보 요소의 computed bg 스캔 (스캔 범위 제한으로 성능 보호)
    if (extraScan) {
      for (const el of document.querySelectorAll('ytd-thumbnail, [class*="thumb"], [class*="image"], [class*="img"], [class*="photo"], [id*="thumb"]')) pushFrom(el) ;
    }
    return out ;
  }

  // ---------- 실행 ----------
  function analyze() {
    const t0 = performance.now() ;
    const article = extractArticle() ;
    const articleUrls = collectArticleUrls(article?.content) ;

    // Readability 실패 또는 본문 미디어가 너무 적을 때 폴백 보강:
    // 공통 본문/상품 컨테이너 후보에서 URL 수집 (쿠팡·쇼핑몰 등 Readability가
    // 상품 이미지를 본문에 못 담는 사이트 대응)
    let articleFallback = null ;
    const mediaUrlRe = /\.(jpe?g|png|webp|gif|avif|svg|mp4|webm|ogg|mp3|m4a|aac|m3u8|mpd)(\?|#|$)/i ;
    const articleMedia = [...articleUrls].filter((u) => mediaUrlRe.test(u)) ;
    if (!article || articleMedia.length < 10) {
      const sel = 'article, main, [role="main"], .post-content, .entry-content, .article-body, .product-info, .goods-detail, .detail-area, .xans-product-detail, .xans-product-image, .product-image, .prod-atf, [class*="product-image"], [class*="prod-image"], #content, .content' ;
      for (const el of document.querySelectorAll(sel)) {
        if (el && (el.textContent || '').trim().length > 300) {
          articleFallback = el ;
          break ;
        }
      }
      // 일반화 폴백: 스마트스토어 등 해시 클래스 쇼핑몰 대응 — 이미지 10개 이상 + 텍스트 500자 이상인
      // 최대 이미지 컨테이너를 본문으로 간주 (상품 갤러리/상세가 Readability에 안 담기는 사이트)
      if (!articleFallback) {
        let best = null, bestImgs = 0 ;
        for (const el of document.querySelectorAll('div, section, main, article, [role="main"]')) {
          if (el === document.body) continue ;
          const imgs = el.querySelectorAll('img').length ;
          if (imgs >= 10 && imgs > bestImgs && (el.textContent || '').trim().length > 500) {
            best = el ;
            bestImgs = imgs ;
          }
        }
        if (best) articleFallback = best ;
      }
      if (articleFallback) {
        for (const u of collectArticleUrls(articleFallback.outerHTML)) articleUrls.add(u) ;
      }
    }

    const images = collectImages() ;
    const { videos, manifestVideos } = collectVideos() ;
    const audios = collectAudio() ;
    const links = collectLinks() ;
    const streams = collectStreams() ;
    // collectVideos에서 분리된 매니페스트를 스트림에 병합 (DOM 선언 수집과 중복 제거)
    if (manifestVideos.length) {
      const seen = new Set(streams.map((s) => s.url)) ;
      for (const mv of manifestVideos) {
        if (seen.has(mv.url)) continue ;
        seen.add(mv.url) ;
        mv.id = `s${streams.length}` ;
        if (!mv.name) mv.name = streamName(mv.url) ;
        streams.push(mv) ;
      }
    }

    let articleContainer = null ;
    if (article?.content) {
      articleContainer = document.createElement('div') ;
      articleContainer.innerHTML = article.content ;
    }
    const bgImages = collectBgImages(articleContainer, images.length < 3) ;
    images.push(...bgImages) ;

    const mark = (item) => {
      // embed 플레이어는 본문 밖이어도 "본문만" 필터에서 제외되지 않도록 유지
      if (item.kind === 'iframe') return item ;
      // og:video 폴백(blob 재생 페이지의 대표 동영상)은 페이지 주 콘텐츠 — 본문으로 판정
      if (item.kind === 'og') { item.inArticle = true ; return item ; }
      item.inArticle = articleUrls.has(item.url) || (item.source === 'bg') ;
      return item ;
    } ;
    images.forEach(mark) ;
    videos.forEach(mark) ;
    audios.forEach(mark) ;
    links.forEach(mark) ;
    streams.forEach(mark) ;

    const perf = performance.now() - t0 ;
    const fallbackInfo = articleFallback
      ? { tag: articleFallback.tagName, cls: String(articleFallback.className || '').slice(0, 50), imgs: articleFallback.querySelectorAll('img').length }
      : null ;
    const result = {
      url: location.href,
      title: document.title,
      analyzedAt: Date.now(),
      article: article
        ? { found: true, title: article.title, byline: article.byline || '', excerpt: (article.excerpt || '').slice(0, 200), bodyTextLen: article.textContent?.length || 0 }
        : { found: false, fallback: Boolean(articleFallback) },
      debug: {
        articleMediaCount: articleMedia.length,
        fallback: fallbackInfo,
      },
      media: { images, videos, audios, streams },
      links,
      stats: {
        totalImages: images.length,
        totalVideos: videos.length,
        totalAudios: audios.length,
        totalStreams: streams.length,
        totalLinks: links.length,
        articleFound: Boolean(article) || Boolean(articleFallback),
      },
    } ;

    // 크기 가드: 1MB 초과 시 링크/이미지 절단
    if (JSON.stringify(result).length > 1_000_000) {
      result.links = result.links.slice(0, 2000) ;
      result.media.images = result.media.images.slice(0, 2000) ;
      BGLogger?.warn?.('EXTRACT', '결과 1MB 초과 — 샘플링 적용') ;
    }
    DebugLogger.info(`[EXTRACT] 분석 완료 (${perf.toFixed(1)}ms, img=${images.length} vid=${videos.length} links=${links.length} article=${Boolean(article)})`) ;
    DebugLogger.perf('분석 소요시간', perf) ;
    return result ;
  }

  // ---------- 교차 오리진 iframe 협업 분석 ----------
  // 메인 프레임이 iframe에 분석을 요청(postMessage)하면 iframe 내 extractor가 자기 미디어를 분석해 응답
  window.addEventListener('message', (e) => {
    const d = e.data ;
    if (!d || d.type !== 'pk.frame.analyze') return ;
    if (e.source !== window.parent) return ;
    try {
      const r = analyze() ;
      e.source.postMessage({
        type: 'pk.frame.result',
        requestId: d.requestId,
        ref: location.href,
        media: { videos: r.media.videos, audios: r.media.audios, streams: r.media.streams },
      }, '*') ;
    } catch {
      e.source.postMessage({ type: 'pk.frame.result', requestId: d.requestId, media: null }, '*') ;
    }
  }) ;

  // 메인 프레임: 모든 http iframe에 분석을 요청하고 응답을 병합
  // iframe이 아직 로드 중이면 postMessage가 유실될 수 있으므로, 미응답 iframe에 1초 후 한 번 더 요청 (타임아웃 3초)
  function collectFrameMedia(result) {
    return new Promise((resolve) => {
      if (window !== window.top) return resolve() ;
      const frames = [...document.querySelectorAll('iframe[src]')].filter((f) => f.src.startsWith('http')) ;
      if (!frames.length) return resolve() ;
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ;
      const received = new Map() ;
      const pending = new Set(frames) ;
      let timer = null ;
      let attempt = 0 ;

      const onMsg = (e) => {
        if (e.data?.type !== 'pk.frame.result' || e.data.requestId !== requestId) return ;
        const f = frames.find((fr) => fr.contentWindow === e.source) ;
        if (!f || !pending.has(f)) return ;
        received.set(e.source, e.data.media) ;
        pending.delete(f) ;
        if (!pending.size) finish() ;
      } ;
      const send = () => {
        for (const f of frames) {
          if (!pending.has(f)) continue ;
          try { f.contentWindow.postMessage({ type: 'pk.frame.analyze', requestId }, '*') ; }
          catch { pending.delete(f) ; }
        }
      } ;
      const finish = () => {
        clearTimeout(timer) ;
        window.removeEventListener('message', onMsg) ;
        for (const media of received.values()) {
          if (!media) continue ;
          for (const key of ['videos', 'audios', 'streams']) {
            for (const it of media[key]) {
              it.inArticle = true ; // iframe 내 미디어는 페이지 주 콘텐츠로 간주
              if (it.downloadable === undefined) it.downloadable = downloadableOf(it.url, it.kind) ; // 옛 iframe 스크립트 결과 보정
              if (!it.referer && media.ref) it.referer = media.ref ; // 다운로드 시 CDN Referer 체크 대비
              // 매니페스트(m3u8/mpd)는 videos/audios로 와도 스트림으로 통일
              if ((key === 'videos' || key === 'audios') && /\.(m3u8|mpd)(\?|#|$)/i.test(it.url)) {
                if (!it.protocol) it.protocol = it.url.toLowerCase().endsWith('.mpd') ? 'dash' : 'hls' ;
                if (!it.name) it.name = streamName(it.url) ;
                result.media.streams.push(it) ;
                continue ;
              }
              result.media[key].push(it) ;
            }
          }
        }
        const idChar = { videos: 'v', audios: 'a', streams: 's' } ;
        for (const key of ['videos', 'audios', 'streams']) {
          result.media[key].forEach((it, i) => { it.id = `${idChar[key]}${i}` ; }) ;
          result.stats[`total${key[0].toUpperCase()}${key.slice(1)}`] = result.media[key].length ;
        }
        DebugLogger.feature('EXTRACT', `iframe 병합 완료 (${received.size}/${frames.length}, 시도 ${attempt + 1}회)`, result.stats) ;
        resolve() ;
      } ;

      window.addEventListener('message', onMsg) ;
      send() ;
      // 1차: iframe이 아직 로드 중일 수 있으므로 1초 후 재전송
      const retry1 = setTimeout(() => {
        if (pending.size && attempt === 0) {
          attempt = 1 ;
          send() ;
        }
      }, 1000) ;
      // 2차: 재전송에도 미응답이면 iframe에 extractor가 없는 것(주입 이후 로드) → BG에 iframe 재주입 요청 후 재시도
      const retry2 = setTimeout(() => {
        if (pending.size && attempt === 1) {
          attempt = 2 ;
          chrome.runtime.sendMessage({ type: 'pk.inject.frames' }, (inj) => {
            if (inj?.ok && pending.size) send() ;
          }) ;
        }
      }, 2000) ;
      timer = setTimeout(() => { clearTimeout(retry1) ; clearTimeout(retry2) ; finish() ; }, 4500) ;
    }) ;
  }

  // 스마트스토어 등 navertv VOD 대응: 플레이어가 재생 전에 호출하는 vodplay 메타 API 응답에서 m3u8/mpd 추출
  // (video src가 blob:이라 http 필터에서 누락되고, 재생 전 성능 엔트리에는 확장자 없는 vodplay 요청만 남음)
  async function collectNaverVod(result) {
    try {
      // navertv 플레이어가 있는 페이지에서만 (없으면 무해하게 즉시 종료)
      const player = document.querySelector('.webplayer-internal-video, video[poster*="tvcast"], video[poster*="pstatic"]') ;
      if (!player) return ;
      // vodplay 메타 요청은 페이지 로드 후 ~2초에 플레이어가 자동 호출 — 아직 없으면 잠시 대기 후 재확인
      let req = performance.getEntriesByType('resource').find((e) => e.name.includes('neonplayer/vodplay/')) ;
      for (let i = 0; i < 6 && !req; i++) {
        await new Promise((r) => setTimeout(r, 500)) ;
        req = performance.getEntriesByType('resource').find((e) => e.name.includes('neonplayer/vodplay/')) ;
      }
      if (!req) return ;
      const r = await fetch(req.name, { credentials: 'include' }) ;
      if (!r.ok) return ;
      const text = await r.text() ;
      const urls = [...new Set((text.match(/https?:[^"'\s\\]+?\.(?:m3u8|mpd)(?:\?[^"'\s\\]*)?/gi) || []))] ;
      if (!urls.length) return ;
      const seen = new Set(result.media.streams.map((s) => s.url.split('?')[0])) ;
      for (const url of urls.slice(0, 4)) {
        const base = url.split('?')[0] ;
        if (seen.has(base)) continue ;
        seen.add(base) ;
        result.media.streams.push({
          id: `s${result.media.streams.length}`,
          url,
          name: streamName(url),
          protocol: base.toLowerCase().endsWith('.mpd') ? 'dash' : 'hls',
          qualities: [],
          inArticle: true,
          downloadable: !base.toLowerCase().endsWith('.mpd'), // m3u8 = 세그먼트 병합 저장 가능, mpd는 미지원
          referer: location.href, // VOD 메타는 페이지(스마트스토어) Referer로만 유효
        }) ;
      }
      DebugLogger.feature('EXTRACT', `navertv VOD 추출 (스트림 ${result.media.streams.length}건)`) ;
    } catch {
      /* vodplay 미호출/실패 시 무시 — 재생 후 재분석으로 대응 */
    }
  }

  // 유튜브 무로그인 UMP 전면 전환 대응 (v0.5): 웹 플레이어는 SABR만 제공 → innertube player API를
  // ANDROID_SDKLESS 클라이언트(20.10.38, PO Token 불필요 — yt-dlp #14693 검증)로 직접 호출해
  // adaptiveFormats URL을 획득. same-origin(youtube.com) fetch라 CORS 통과.
  // 결과: formats(progressive) + adaptiveFormats(video-only/audio-only)를 스트림으로 병합.
  async function mergeYoutubePlayerFormats(result) {
    try {
      if (!/^(?:www\.)?youtube\.com$/i.test(location.hostname)) return ;
      const videoId = new URLSearchParams(location.search).get('v') || (location.pathname.match(/^\/shorts\/([\w-]+)/) || [])[1] ;
      if (!videoId) return ;
      // 페이지 재생 중 이미 API 호출이 있으면 재사용 (ytcfg 캐시 응답은 URL 미포함 — 직접 호출이 확실)
      const body = {
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            osName: 'Android',
            osVersion: '11',
            androidSdkVersion: 30,
            hl: 'ko',
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      } ;
      const resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) ;
      if (!resp.ok) return ;
      const json = await resp.json() ;
      const st = json.streamingData || {} ;
      const all = [...(st.formats || []), ...(st.adaptiveFormats || [])]
        .filter((f) => f.url && /^https:\/\//.test(f.url))
        .sort((a, b) => (parseInt(b.bitrate || 0, 10) - parseInt(a.bitrate || 0, 10))) ;
      if (!all.length) return ;
      const seen = new Set(result.media.streams.map((s) => s.url)) ;
      const seenItag = new Set() ; // 같은 itag(코덱 변형 제외) 중복 방지 — 서명 URL이라 같은 itag는 대표 1개만
      const title = (document.title || '').replace(/\s*-\s*YouTube\s*$/, '').trim() || videoId ;
      for (const f of all) {
        if (seen.has(f.url)) continue ;
        if (f.itag) {
          if (seenItag.has(f.itag)) continue ;
          seenItag.add(f.itag) ;
        }
        seen.add(f.url) ;
        const mime = f.mimeType?.split(';')[0] || '' ;
        const isVideo = mime.startsWith('video') ;
        const isAudio = mime.startsWith('audio') ;
        const res = f.width && f.height ? `${f.height}p${f.fps > 30 ? f.fps : ''}` : (isAudio ? '오디오' : '') ;
        const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : 'm4a' ;
        const size = f.contentLength ? ` · ${(Number(f.contentLength) / 1048576).toFixed(1)}MB` : '' ;
        const kind = !isVideo && !isAudio ? '' : isAudio ? ' (오디오 전용)' : ' (영상 전용)' ;
        const cm = f.mimeType?.match(/codecs="([^"]+)"/) ;
        const codec = cm ? (cm[1].split('.')[0] === 'avc1' ? 'H.264' : cm[1].split('.')[0] === 'av01' ? 'AV1' : cm[1].split('.')[0] === 'vp9' ? 'VP9' : cm[1].split('.')[0] === 'vp8' ? 'VP8' : cm[1].split('.')[0] === 'mp4a' ? 'AAC' : cm[1].split('.')[0] === 'opus' ? 'Opus' : cm[1].split('.')[0]) : '' ;
        result.media.streams.push({
          id: `s${result.media.streams.length}`,
          url: f.url,
          name: `유튜브 ${res}${kind} · ${ext}${codec ? ` · ${codec}` : ''}${size}`,
          protocol: 'direct',
          format: isAudio ? 'audio-only' : isVideo ? 'video-only' : 'progressive',
          itag: f.itag,
          qualities: [],
          inArticle: true,
          downloadable: true,
          source: 'youtube-player',
          referer: location.href,
        }) ;
      }
      DebugLogger.feature('EXTRACT', `유튜브 player API 병합 (${all.length}건) — ${title.slice(0, 30)}`) ;
    } catch (e) {
      DebugLogger.debug('EXTRACT', `유튜브 player API 병합 실패: ${e.message}`) ;
    }
  }

  // 유튜브 watch/shorts 대응: blob 재생이라 성능 엔트리에서 확장자 매칭 불가 → BG가 webRequest로
  // 캡처한 googlevideo.com media 요청(서명 URL)을 스트림으로 병합 (streamDetect 옵션 ON일 때 수집됨)
  async function mergeCapturedStreams(result) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'pk.stream.captured.get' }) ;
      const caps = resp?.ok ? resp.data : [] ;
      if (!Array.isArray(caps) || !caps.length) return ;
      const seen = new Set(result.media.streams.map((s) => s.url)) ;
      for (const c of caps) {
        if (seen.has(c.url)) continue ;
        seen.add(c.url) ;
        const kind = c.format === 'audio-only' ? ' (오디오 전용)' : c.format === 'progressive' ? ' (영상+오디오)' : c.format === 'video-only' ? ' (영상 전용)' : '' ;
        const item = {
          id: `s${result.media.streams.length}`,
          url: c.url,
          name: `유튜브 ${c.label || '동영상'}${kind}`,
          protocol: 'direct',
          format: c.format || 'progressive',
          itag: c.itag,
          qualities: [],
          inArticle: true,
          downloadable: true,
          source: 'youtube-capture',
          capturedAt: c.capturedAt,
        } ;
        // 같은 itag의 player 포맷 항목이 있으면 URL만 신선한 캡처 URL로 갱신 (재생 세션 — 다운로드 성공 보장)
        if (c.itag) {
          const pIdx = result.media.streams.findIndex((s) => s.itag === c.itag && s.source === 'youtube-player') ;
          if (pIdx >= 0) {
            result.media.streams[pIdx].url = c.url ;
            result.media.streams[pIdx].capturedAt = c.capturedAt ;
            continue ;
          }
          // 같은 itag의 이전 캡처가 있으면 URL/이름만 갱신 (분석 반복 시 캡처 중복 누적 방지)
          const prev = result.media.streams.findIndex((s) => s.source === 'youtube-capture' && s.itag === c.itag) ;
          if (prev >= 0) {
            result.media.streams[prev] = item ;
            continue ;
          }
        }
        result.media.streams.push(item) ;
      }
      DebugLogger.feature('EXTRACT', `유튜브 캡처 병합 (${caps.length}건)`) ;
    } catch { /* BG 미응답/오류 시 캡처 없음으로 처리 */ }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'pk.ping') {
      // 스크립트 생존 확인 (주입 스킵 판단용) — 메인 프레임만 응답
      if (window !== window.top) return false ;
      sendResponse({ ok: true }) ;
      return false ;
    }
    if (message?.type === 'pk.fetch.stream') {
      // 유튜브 googlevideo 등 서명 URL 폴백: 페이지 오리진 fetch (쿠키/Referer/Origin이 재생과 동일)
      // → 한정 Range로 청크 수신 → base64 반환 (다운로더 창이 병합)
      if (window !== window.top) return false ;
      const u = message.payload?.url, rng = message.payload?.range ?? null ;
      const fetchOne = async (url) => {
        const r = await fetch(url, { credentials: 'include', headers: rng ? { Range: rng } : {} }) ;
        if (!r.ok) return { ok: false, status: r.status } ;
        const buf = new Uint8Array(await r.arrayBuffer()) ;
        let bin = '' ;
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)) ;
        const cr = r.headers.get('content-range') || '' ;
        const m = cr.match(/\/(\d+)\s*$/) ;
        return {
          ok: true, status: r.status,
          mime: r.headers.get('content-type') || '',
          b64: btoa(bin), size: buf.length,
          total: m ? Number(m[1]) : 0,
        } ;
      } ;
      ;(async () => {
        try {
          let res = await fetchOne(u) ;
          // 유튜브: 분석 시점에 발급된 서명 URL은 재생 세션과 무관하면 401/403 — 재생 중 실제로 요청된 googlevideo URL로 재시도
          if (!res.ok && (res.status === 401 || res.status === 403)) {
            const itag = (new URL(u).searchParams.get('itag') || '').toString() ;
            const live = performance.getEntriesByType('resource')
              .map((e) => e.name)
              .filter((n) => /googlevideo\.com\/videoplayback/.test(n)) ;
            const same = live.filter((n) => new URL(n).searchParams.get('itag')?.toString() === itag) ;
            const alt = (same.length ? same : live).pop() ;
            if (alt && alt !== u) res = await fetchOne(alt) ;
          }
          sendResponse(res) ;
        } catch (e) {
          sendResponse({ ok: false, error: String(e) }) ;
        }
      })() ;
      return true ;
    }
    if (message?.type === 'pk.analyze.page') {
      // iframe 컨텍스트는 협업 요청(postMessage)으로만 분석 응답 — 직접 메시지에는 응답하지 않음
      if (window !== window.top) return false ;
      DebugLogger.info('[EXTRACT] 분석 시작', { url: location.href }) ;
// lazy 이미지 등 페이지 안정화 대기: DOM img 개수가 일정하고 미로드(pending)가 0이며,
// iframe 개수도 안정되면 진행 (최대 12초) — iframe은 뒤늦게 추가되는 경우가 많아 협업 분석 전에 대기해야 함
  function waitPageStable(maxMs = 12000) {
    return new Promise((resolve) => {
      const start = performance.now() ;
      let lastImgs = -1, lastFrames = -1, stable = 0 ;
      const iv = setInterval(() => {
        const imgs = [...document.images] ;
        const pending = imgs.filter((i) => !i.complete).length ;
        const frames = [...document.querySelectorAll('iframe[src]')].length ;
        if (imgs.length === lastImgs && frames.length === lastFrames && pending === 0) stable += 1 ;
        else stable = 0 ;
        lastImgs = imgs.length ; lastFrames = frames.length ;
        if (stable >= 3 || performance.now() - start >= maxMs) {
          clearInterval(iv) ;
          resolve() ;
        }
      }, 400) ;
    }) ;
  }

  ;(async () => {
    try {
      // 페이지 로드 완료까지 대기 (lazy 이미지/iframe 로드 보장, 최대 8초) — 로드 중 분석하면 빈약한 결과가 나오므로
      if (document.readyState !== 'complete') {
        await new Promise((res) => {
          const t = setTimeout(res, 8000) ;
          window.addEventListener('load', () => { clearTimeout(t) ; res() }, { once: true }) ;
        }) ;
      }
      // readyState가 complete여도 lazy 이미지 로드가 남아 있을 수 있음 — 이미지 안정화까지 추가 대기
      await waitPageStable() ;
          const result = analyze() ;
          await collectNaverVod(result) ; // navertv VOD는 먼저 (frameId 재할당은 collectFrameMedia가 수행)
          await collectFrameMedia(result) ;
          await mergeYoutubePlayerFormats(result) ; // 유튜브 player API(ANDROID_SDKLESS) adaptiveFormats 병합
          await mergeCapturedStreams(result) ; // 유튜브 googlevideo webRequest 캡처 병합
          // async 수집(navertv VOD/iframe 협업)이 media에 push한 항목을 stats에 최종 동기화
          // (collectFrameMedia는 iframe이 없으면 조기 종료되어 stats를 갱신하지 않음)
          result.stats.totalImages = result.media.images.length ;
          result.stats.totalVideos = result.media.videos.length ;
          result.stats.totalAudios = result.media.audios.length ;
          result.stats.totalStreams = result.media.streams.length ;
          DebugLogger.feature('EXTRACT', '분석 결과 반환', result.stats) ;
          sendResponse({ ok: true, data: result }) ;
        } catch (e) {
          DebugLogger.error('[EXTRACT] 분석 실패', `${e.name}: ${e.message}`, { code: 'E-CHR-NET-1001' }) ;
          sendResponse({ ok: false, error: { code: 'E-CHR-NET-1001', message: '페이지 분석에 실패했습니다.' } }) ;
        }
      })() ;
      return true ; // async 응답 유지
    }
    return false ;
  }) ;

  const t1 = performance.now() ;
  DebugLogger.feature('EXTRACT', `extractor 로드 완료 (${(t1 - T0).toFixed(1)}ms)`) ;
})() ;
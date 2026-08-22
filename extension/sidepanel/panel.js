// sidepanel/panel.js — 사이드 패널 메인 로직 (분류 탭 + 검색/필터 + 선택 + 다운로드)

import { MSG } from '../shared/messages.js';
import { fetchStreamText, parseM3U8 } from '../shared/m3u8.js';

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 앞 줄임 주소 표시: 파일명(쿼리 제외) 끝부분만 보존 — "앞부분…파일명끝" 양끝 표시
function shortenUrl(s, max = 38) {
  s = String(s || '');
  if (s.length <= max) return s;
  const q = s.indexOf('?');
  const path = q === -1 ? s : s.slice(0, q);
  const name = path.split('/').filter(Boolean).pop() || s.slice(-24);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const tail = (base.length > 10 ? base.slice(-10) : base) + ext;
  const headLen = Math.max(0, max - tail.length - 1);
  return (headLen > 0 ? s.slice(0, headLen) : '') + '…' + tail;
}

let analysis = null;
let currentTab = 'images';
let selection = new Set();
// 현재 표시 중인 분석의 출처 (자동 갱신 중복 방지용)
let analysisSource = { tabId: null, url: '' };

// ---------- 분석 실행 ----------
async function analyze(force = false) {
  let tab;
  // 컨텍스트 메뉴("PageKit으로 분석")로 열렸으면 우클릭한 탭을 분석 (1회용 — 사용 후 제거)
  const ctx = await chrome.storage.session.get('contextTarget');
  const ct = ctx.contextTarget;
  if (ct?.tabId != null) {
    await chrome.storage.session.remove('contextTarget');
    const t = await chrome.tabs.get(ct.tabId).catch(() => null);
    if (t?.url && /^https?:/.test(t.url)) tab = t;
  }
  if (!tab) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    // 패널(확장 페이지)이 활성 탭이면 같은 창의 웹 탭으로 폴백
    if (active?.url && /^https?:/.test(active.url)) tab = active;
    else {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      tab = tabs.find((t) => t.url && /^https?:/.test(t.url)) || null;
    }
  }
  // 빈 URL/특수 페이지(확장 페이지, 새 탭 등)는 분석 불가 — 주입 시도 자체를 생략
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return;
  // 같은 탭·같은 URL이면 이미 표시 중 — 중복 분석 방지 (force면 무조건 재실행)
  if (!force && analysisSource.tabId === tab.id && analysisSource.url === (tab.url || '')) return;
  DebugLogger.info('[PANEL] 분석 시작', { url: tab.url || '' });
  // 시작 시점에 출처 선점 (분석 중 중복 이벤트 트리거 방지)
  analysisSource = { tabId: tab.id, url: tab.url || '' };
  showAnalyzing();
  try {
    // 콘텐츠 스크립트 미주입 시 BG에 주입 요청 (패널 메시지엔 sender.tab이 없으므로 tabId 명시)
    const ensure = await chrome.runtime.sendMessage({ type: MSG.ENSURE_INJECTED, tabId: tab.id });
    if (!ensure?.ok) {
      DebugLogger.error('[PANEL] 스크립트 주입 실패', ensure?.error, { code: 'E-CHR-PERM-1001' });
      analysisSource = { tabId: null, url: '' }; // 실패 → 다음 이벤트에서 재분석 가능
      toast('분석 실패: 스크립트 주입에 실패했습니다. 페이지를 새로고침 후 시도하세요.');
      return;
    }
    const resp = await chrome.tabs.sendMessage(tab.id, { type: MSG.ANALYZE_PAGE }, { frameId: 0 });
    if (resp?.ok) {
      analysis = resp.data;
      selection = new Set();
      render();
      // 화질 변형 통합은 비동기 — 즉시 렌더 후 갱신 (CDN 응답 지연이 UI를 막지 않게)
      mergeStreamVariants()
        .then(() => render())
        .catch(() => {});
      DebugLogger.feature('PANEL', '분석 표시됨', analysis.stats);
      chrome.storage.session
        .set({ lastAnalysis: { tabId: tab.id, url: tab.url || '', result: resp.data } })
        .catch(() => {});
      const a = analysis.article || {};
      if (!a.found) {
        toast(
          a.fallback
            ? '본문 구조를 감지해 일부 항목만 본문으로 표시합니다.'
            : '본문을 찾지 못해 본문/외부 구분 없이 표시합니다.'
        );
      }
    } else {
      DebugLogger.warn('[PANEL] 분석 결과 없음', { code: 'E-CHR-NET-1001' });
      analysisSource = { tabId: null, url: '' }; // 실패 → 다음 이벤트에서 재분석 가능
      toast('분석 실패: 결과가 없습니다. 페이지를 새로고침 후 시도하세요.');
    }
  } catch (e) {
    DebugLogger.error('[PANEL] 분석 실패', `${e.name}: ${e.message}`, { code: 'E-CHR-NET-1001' });
    analysisSource = { tabId: null, url: '' }; // 실패 → 다음 이벤트에서 재분석 가능
    toast('분석 실패: 페이지를 새로고침 후 시도하세요.');
  } finally {
    hideAnalyzing();
  }
}

// 분석 중 전체 오버레이 (탭/페이지 변경 자동 갱신 시 "분석 중…" 표시)
function showAnalyzing() {
  const ov = $('pk-overlay');
  if (ov) ov.hidden = false;
}
function hideAnalyzing() {
  const ov = $('pk-overlay');
  if (ov) ov.hidden = true;
}

// ---------- 아이템 구성 ----------
// 스트림 화질 변형 통합: 마스터 m3u8를 fetch해 파싱 → 그 변형 url과 일치하는 항목은
// 같은 영상의 화질로 보고 숨김 처리 (마스터 항목이 대표). fetch 실패 CDN은 원본 유지.
async function mergeStreamVariants() {
  const streams = analysis?.media?.streams;
  if (!streams || streams.length < 2) return;
  const m3u8 = streams.filter((s) => isM3u8Url(s.url));
  if (m3u8.length < 2) return;
  // 병렬 판별 + 짧은 타임아웃 (WAF가 느린 CDN 대비 — 실패 항목은 변형 판별 생략)
  const found = await Promise.all(
    m3u8.map(async (it) => {
      try {
        const m = parseM3U8(await fetchStreamText(it.url, 6000), it.url);
        return m.isMaster && m.variants.length
          ? { id: it.id, urls: new Set(m.variants.map((v) => v.url)) }
          : null;
      } catch {
        return null;
      }
    })
  );
  const masters = found.filter(Boolean);
  if (!masters.length) return;
  const variantUrls = new Set();
  for (const mt of masters) for (const u of mt.urls) variantUrls.add(u);
  const masterIds = new Set(masters.map((mt) => mt.id));
  let merged = 0;
  for (const it of streams) {
    if (!masterIds.has(it.id) && variantUrls.has(it.url)) {
      it.variantOf = true;
      merged++;
    }
  }
  if (merged) {
    for (const id of masterIds) {
      const mIt = streams.find((s) => s.id === id);
      if (mIt) mIt.mergedCount = merged;
    }
    DebugLogger.feature('PANEL', `스트림 화질 변형 통합 (${merged}건 숨김)`);
  }
}

function setCategory(tab) {
  currentTab = tab;
  const isQuick = tab === 'images' || tab === 'videos' || tab === 'streams';
  $('pk-cat-images').classList.toggle('is-active', tab === 'images');
  $('pk-cat-videos').classList.toggle('is-active', tab === 'videos');
  $('pk-cat-streams').classList.toggle('is-active', tab === 'streams');
  if (isQuick) $('pk-cat-select').value = 'all';
  $('pk-type-filter').hidden = !(tab === 'images' || tab === 'links');
  $('pk-size-filter').hidden = !(tab === 'images');
  $('pk-hide-icons-wrap').hidden = !(tab === 'images');
  $('pk-export-csv').hidden = tab !== 'links';
  DebugLogger.debug('[PANEL] 카테고리 변경', { tab: currentTab });
  render();
}

function allItems() {
  if (!analysis) return [];
  return [
    ...analysis.media.images.map((i) => ({ ...i, cat: 'images', size: i.size || 0 })),
    ...analysis.media.videos.map((v) => ({ ...v, cat: 'videos', size: 0 })),
    ...analysis.media.audios.map((a) => ({ ...a, cat: 'audios', size: 0 })),
    ...analysis.media.streams.map((s) => ({ ...s, cat: 'streams', size: 0 })),
    ...analysis.links.map((l) => ({ ...l, cat: 'links', size: 0 })),
  ];
}

function tabItems() {
  const q = $('pk-search').value.trim().toLowerCase();
  const articleUsable = analysis?.article?.found !== false;
  const articleOnly = articleUsable && $('pk-article-only').checked;
  const type = $('pk-type-filter').value;
  const size = parseInt($('pk-size-filter').value, 10) || 0;
  const hideIcons = $('pk-hide-icons').checked;
  return allItems().filter((it) => {
    if (currentTab !== 'all' && it.cat !== currentTab) return false;
    // 스트림은 재생 중일 때만 잡히는 실용 항목 — 본문 판정과 무관하게 항상 표시
    if (articleOnly && !it.inArticle && it.cat !== 'streams') return false;
    if (it.variantOf) return false; // 마스터로 통합된 화질 변형은 숨김
    if (type && it.type !== type) return false;
    if (size && Math.max(it.w || 0, it.h || 0) < size) return false;
    if (hideIcons && isIcon(it)) return false;
    if (
      q &&
      !(it.url || '').toLowerCase().includes(q) &&
      !(it.text || '').toLowerCase().includes(q)
    )
      return false;
    return true;
  });
}

// 아이콘 판정: 파일명 패턴(아이콘류) 또는 svg 또는 크기 확인된 48px 이하 이미지
// (크기 미확인 이미지는 이름/URL 패턴으로만 판정)
const ICON_NAME_RE =
  /(^|[/\-_. ])(icon|ico|logo|arrow|jiantou|btn|button|chevron|menu|close|spinner|sprite|prev|next|back-to-top|sort|gear|cog|heart|star|like|share|play|pause|check|dot|point|nav|pager|slide|setting)([-_.\d]|$)/i;
function isIcon(it) {
  const hay = `${it.name || ''} ${it.text || ''} ${it.url || ''}`.toLowerCase();
  if (ICON_NAME_RE.test(hay)) return true;
  if (!it.w && !it.h) return false;
  return it.type === 'svg' || Math.max(it.w || 0, it.h || 0) <= 48;
}

// ---------- 렌더링 ----------
function formatSize(bytes) {
  if (!bytes) return '';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function formatDim(it) {
  const dim = it.w && it.h ? `${it.w}×${it.h}` : '';
  const type = it.type && it.type !== 'unknown' ? it.type : '알수없음';
  return [dim, formatSize(it.size), type].filter(Boolean).join(' · ');
}

function thumbFor(it) {
  if (it.cat === 'images' && it.url.startsWith('http')) {
    return `<div class="pk-thumb pk-thumb--img" style="background-image:url(&quot;${esc(it.url)}&quot;)" data-url="${esc(it.url)}"></div>`;
  }
  const emoji =
    { images: '🖼', videos: '🎬', audios: '🎵', streams: '📡', links: '🔗' }[it.cat] || '📄';
  return `<div class="pk-thumb">${emoji}</div>`;
}

// ---------- 스트림 그룹 (해상도별 펼침 목록) ----------
const RES_GROUPS = [
  ['4K', 2160],
  ['1440p', 1440],
  ['1080p', 1080],
  ['720p', 720],
  ['480p', 480],
  ['360p', 360],
  ['240p', 240],
  ['144p', 144],
  ['오디오 전용', 0],
  ['기타', -1],
];
function streamGroupKey(it) {
  if (it.format === 'audio-only') return '오디오 전용';
  if (!it.w || !it.h) return '기타';
  for (const [label, min] of RES_GROUPS) if (it.h >= min) return label;
  return '기타';
}
function groupStreams(items) {
  const byKey = new Map();
  for (const it of items) {
    const k = streamGroupKey(it);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  }
  return RES_GROUPS.filter(([label]) => byKey.has(label)).map(([label]) => ({
    label,
    list: byKey.get(label),
  }));
}

function itemHtml(it) {
  const kind = it.format === 'progressive' ? '<span class="pk-tag">영상+오디오</span>' : '';
  return `
    <label class="pk-item ${it.inArticle ? '' : 'is-out'}" data-id="${it.id}">
      ${thumbFor(it)}
      <div class="pk-info">
        <div class="pk-name" title="${esc(it.url || it.text)}">${esc(shortenUrl(it.name || it.text || it.url))}</div>
        <div class="pk-meta">${formatDim(it)}</div>
      </div>
      <span class="pk-tag">${it.inArticle ? '본문' : '외부'}</span>
      ${kind}
      ${it.mergedCount ? `<span class="pk-tag" title="같은 영상의 화질 변형 ${it.mergedCount}건을 하나로 통합했습니다">화질 ${it.mergedCount}개 통합</span>` : ''}
      ${it.downloadable === false ? '<span class="pk-tag pk-tag-no" title="실제 파일이 아니거나 매니페스트라 저장할 수 없습니다">저장 불가</span>' : ''}
      <input type="checkbox" data-id="${it.id}" ${selection.has(it.id) ? 'checked' : ''} ${it.downloadable === false ? 'disabled' : ''} />
    </label>`;
}

function render() {
  if (!analysis) {
    $('pk-empty').innerHTML = '분석 결과가 없습니다.<br />상단 ⟳ 버튼으로 페이지를 분석하세요.';
    $('pk-empty').hidden = false;
    $('pk-list').innerHTML = '';
    return;
  }
  $('pk-empty').hidden = true;
  $('pk-page-title').textContent = analysis.title || analysis.url;
  $('pk-type-filter').hidden = !(currentTab === 'images' || currentTab === 'links');
  $('pk-size-filter').hidden = !(currentTab === 'images');
  $('pk-hide-icons-wrap').hidden = !(currentTab === 'images');
  $('pk-export-csv').hidden = currentTab !== 'links';

  // 카운트 배지 = 실제 추출 개수 (stats) → 팝업 요약과 일치
  const articleUsable = analysis.article?.found !== false;
  const cb = $('pk-article-only');
  if (!articleUsable && cb.checked) cb.checked = false;
  cb.disabled = !articleUsable;
  const s = analysis.stats;
  const isQuick = currentTab === 'images' || currentTab === 'videos' || currentTab === 'streams';
  $('pk-cat-images').classList.toggle('is-active', currentTab === 'images');
  $('pk-cat-videos').classList.toggle('is-active', currentTab === 'videos');
  $('pk-cat-streams').classList.toggle('is-active', currentTab === 'streams');
  $('pk-c-images').textContent = s.totalImages;
  $('pk-c-videos').textContent = s.totalVideos;
  $('pk-c-streams').textContent = s.totalStreams;
  const cat = [
    ['all', '전체', allItems().length],
    ['audios', '오디오', s.totalAudios],
    ['links', '링크', s.totalLinks],
  ];
  $('pk-cat-select').innerHTML = cat
    .map(
      ([v, label, n]) =>
        `<option value="${v}" ${!isQuick && currentTab === v ? 'selected' : ''}>${label} (${n})</option>`
    )
    .join('');

  const items = tabItems();
  // 필터 적용 요약: "본문만 · 26/69 표시"
  const total = allItems().length;
  const filters = [];
  if (articleUsable && cb.checked) filters.push('본문만');
  if ($('pk-type-filter').value) filters.push(`형식 ${$('pk-type-filter').value}`);
  if ($('pk-size-filter').value) filters.push(`크기 ${$('pk-size-filter').value}px+`);
  if ($('pk-hide-icons').checked) filters.push('아이콘 숨김');
  if ($('pk-search').value.trim()) filters.push(`검색 "${$('pk-search').value.trim()}"`);
  const info = $('pk-filter-info');
  if (filters.length && items.length !== total) {
    info.textContent = `${filters.join(' · ')} · ${items.length}/${total} 표시`;
    info.hidden = false;
  } else {
    info.hidden = true;
  }

  // 빈 결과 안내: 필터/검색으로 0건이면 "검색된 데이터가 없습니다" (유튜브 스트림 안내가 우선이면 생략)
  const youtubeHint =
    currentTab === 'streams' &&
    items.length === 0 &&
    /^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(analysis.url || '');
  if (items.length === 0 && !youtubeHint) {
    $('pk-empty').innerHTML =
      '검색된 데이터가 없습니다.<br />검색어·필터를 해제하거나 다른 카테고리를 확인해 보세요.';
    $('pk-empty').hidden = false;
  } else {
    $('pk-empty').hidden = true;
  }

  const maxItems = 500;
  let inner;
  if (currentTab === 'streams') {
    inner =
      groupStreams(items.slice(0, maxItems))
        .map(
          (g) => `
      <div class="pk-group">
        <div class="pk-group-title" role="button" title="클릭하여 펼치기/접기">
          <span class="pk-arrow">▾</span> ${g.label}
          <span class="pk-group-count">${g.list.length}</span>
        </div>
        <div class="pk-group-body">${g.list.map(itemHtml).join('')}</div>
      </div>`
        )
        .join('') +
      (items.length > maxItems ? '<div class="pk-empty">500개까지만 표시됩니다.</div>' : '');
  } else {
    inner =
      items.slice(0, maxItems).map(itemHtml).join('') +
      (items.length > maxItems ? '<div class="pk-empty">500개까지만 표시됩니다.</div>' : '');
  }
  $('pk-list').innerHTML =
    inner +
    // 유튜브 캡처 안내: 스트림 탭이 비었고 유튜브 페이지면 재생 안내
    // (webRequest 캡처는 media 요청이 발생하는 재생 시에만 수집 — shorts는 스크롤 시 자동 재생으로 자연 캡처)
    (currentTab === 'streams' &&
    items.length === 0 &&
    /^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(analysis.url || '')
      ? '<div class="pk-empty">📡 동영상을 재생하면 스트림이 자동 캡처됩니다.<br>캡처 후 ⟳ 버튼으로 다시 분석해 주세요.<br><span style="opacity:.6;font-size:11px">(설정 › 스트림 감지 ON 필요)</span></div>'
      : '');

  updateSelectionUI();
  fixImageDims();
  ensureThumbs();
}

// ---------- 썸네일 폴백 ----------
// WAF가 확장 오리진 이미지 로드를 403 차단하는 사이트(토렌트씨 등) 대응:
// 오프스크린 preload 실패분만 페이지 컨텍스트에서 120px dataURL로 가져와 bg-image 교체
const _thumbCache = new Map(); // url -> dataURL
let _thumbsRunning = false; // 재진입 가드: 탭 전환/분석 표시/리로드가 겹치면 3중 요청으로 WAF 차단 악화
async function ensureThumbs() {
  if (_thumbsRunning) return;
  _thumbsRunning = true;
  try {
    await doEnsureThumbs();
  } finally {
    _thumbsRunning = false;
  }
}
async function doEnsureThumbs() {
  const els = [...document.querySelectorAll('.pk-thumb--img[data-url]')];
  // 1) 이미 캐시된 dataURL은 즉시 적용 (이전 분석에서 폴백된 URL이 새 렌더에서도 사용될 수 있음)
  let applied = 0;
  for (const el of els) {
    const data = _thumbCache.get(el.dataset.url);
    if (data) {
      el.style.backgroundImage = `url("${data}")`;
      applied += 1;
    }
  }
  // 2) 미캐시 URL만 preload → 실패분 폴백
  // 이미 dataURL로 교체된 썸네일(패널 리로드/재분석 등으로 _thumbCache가 비어 있어도)은 재요청하지 않음
  const need = els
    .filter((el) => {
      const u = el.dataset.url;
      return (
        u &&
        u.startsWith('http') &&
        !_thumbCache.has(u) &&
        !el.style.backgroundImage.startsWith('url("data:')
      );
    })
    .map((el) => el.dataset.url);
  if (!need.length) return;
  DebugLogger.info('[PANEL] 썸네일 검사 시작', {
    total: need.length,
    tabId: analysisSource.tabId,
    applied,
  });
  const failed = [];
  await Promise.all(
    need.map(
      (u) =>
        new Promise((res) => {
          const img = new Image();
          const t = setTimeout(() => {
            failed.push(u);
            res();
          }, 8000);
          img.onload = () => {
            clearTimeout(t);
            res();
          };
          img.onerror = () => {
            clearTimeout(t);
            failed.push(u);
            res();
          };
          img.src = u;
        })
    )
  );
  DebugLogger.info('[PANEL] 썸네일 preload', { failed: failed.length });
  let ok = 0;
  for (let i = 0; i < failed.length; i += 10) {
    const batch = failed.slice(i, i + 10);
    const resp = await chrome.runtime.sendMessage({
      type: MSG.THUMB_FETCH,
      payload: { tabId: analysisSource.tabId, urls: batch },
    });
    const map = resp?.ok ? resp.data : {};
    for (const u of batch)
      if (map[u]) {
        _thumbCache.set(u, map[u]);
        ok += 1;
      }
  }
  DebugLogger.info('[PANEL] 썸네일 폴백 완료', { failed: failed.length, ok });
  if (failed.length > 0 && ok === 0) showAdblockHint(failed.length);
  else $('pk-adblock-hint').hidden = true; // 성공/부분 성공 시 남아 있던 안내 배너 제거
  for (const el of document.querySelectorAll('.pk-thumb--img[data-url]')) {
    const data = _thumbCache.get(el.dataset.url);
    if (data) el.style.backgroundImage = `url("${data}")`;
  }
}

// ---------- 광고 차단 의심 힌트 ----------
// 페이지 컨텍스트 fetch + <img> + BG(확장)까지 전부 실패하면 브라우저 필터(ADGuard 등)가
// 이미지 요청을 차단 중일 가능성이 높음 — 세션당 1회 안내 배너 표시
let _adblockHintShown = false;
function showAdblockHint(failedCount) {
  if (_adblockHintShown) return;
  _adblockHintShown = true;
  DebugLogger.warn('[PANEL] 광고 차단 의심: 썸네일 요청 전 경로 실패 — 브라우저 필터 확인 안내', {
    failed: failedCount,
  });
  const hintEl = $('pk-adblock-hint');
  hintEl.querySelector('.pk-adblock-count').textContent = `요청 ${failedCount}건 모두 실패 — `;
  hintEl.hidden = false;
}

// ---------- 이미지 크기 보정 ----------
// 스마트에디터 등 placeholder(1×1)로 로드된 lazy 이미지: 실제 URL을 Image로 로드해 크기 갱신 (1회만, 최대 60개)
// 주의: allItems()는 복사본을 만들므로 원본(analysis.media.images)을 직접 갱신해야 render()에 반영됨
const _fixedDims = new Set();
function fixImageDims() {
  const targets = (analysis.media.images || [])
    .filter((it) => it.w === 1 && it.h === 1 && it.url.startsWith('http') && !_fixedDims.has(it.id))
    .slice(0, 60);
  for (const it of targets) {
    _fixedDims.add(it.id);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 1 && img.naturalHeight > 1) {
        it.w = img.naturalWidth;
        it.h = img.naturalHeight;
        render();
      }
    };
    img.onerror = () => {};
    img.src = it.url;
  }
}

function updateSelectionUI() {
  const items = allItems().filter((it) => selection.has(it.id));
  $('pk-selected-count').textContent = items.length;
  $('pk-selected-size').textContent =
    formatSize(items.reduce((a, b) => a + (b.size || 0), 0)) || '0B';
  $('pk-download').disabled = items.length === 0;
  $('pk-copy-links').disabled = items.length === 0;
}

function toast(msg) {
  const el = $('pk-toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

// ---------- 이벤트 ----------
// 컨텍스트 메뉴("PageKit으로 분석")로 분석 대상이 지정되면 즉시 재분석 (패널이 이미 열려 있을 때)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.contextTarget?.newValue) {
    DebugLogger.debug('[PANEL] 컨텍스트 대상 탭 감지 → 재분석');
    analyze(true);
  }
});

$('pk-reload').addEventListener('click', () => {
  // 수동 새로고침 = 강제 재분석 (같은 탭·같은 URL이어도 재실행)
  analysisSource = { tabId: null, url: '' };
  analyze(true);
});
$('pk-search').addEventListener('input', render);
$('pk-article-only').addEventListener('change', render);
$('pk-type-filter').addEventListener('change', render);
$('pk-size-filter').addEventListener('change', render);
$('pk-hide-icons').addEventListener('change', render);
$('pk-cat-images').addEventListener('click', () => setCategory('images'));
$('pk-cat-videos').addEventListener('click', () => setCategory('videos'));
$('pk-cat-streams').addEventListener('click', () => setCategory('streams'));
$('pk-cat-select').addEventListener('change', (e) => setCategory(e.target.value));
$('pk-adblock-close').addEventListener('click', () => {
  $('pk-adblock-hint').hidden = true;
});

$('pk-list').addEventListener('click', (e) => {
  const gh = e.target.closest('.pk-group-title');
  if (gh) {
    const g = gh.closest('.pk-group');
    g.classList.toggle('is-collapsed');
    gh.querySelector('.pk-arrow').textContent = g.classList.contains('is-collapsed') ? '▸' : '▾';
    return;
  }
  const box = e.target.closest('input[type="checkbox"]');
  if (!box) return;
  const id = box.dataset.id;
  if (box.checked) selection.add(id);
  else selection.delete(id);
  updateSelectionUI();
});

// 호버 팝오버: 이미지 썸네일에 마우스 오버 시 대형 미리보기
const pop = $('pk-pop');
$('pk-list').addEventListener('mouseover', (e) => {
  const t = e.target.closest('.pk-thumb--img');
  if (t) {
    pop.style.backgroundImage = `url("${t.dataset.url}")`;
    pop.hidden = false;
  }
});
$('pk-list').addEventListener('mouseout', (e) => {
  if (!e.target.closest('.pk-thumb--img')) pop.hidden = true;
});

// 클립보드 복사: Clipboard API 우선, 실패 시 execCommand 폴백 (포커스 없는 환경 대응)
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

$('pk-copy-links').addEventListener('click', async () => {
  const items = allItems().filter((it) => selection.has(it.id));
  const text = items.map((i) => i.url).join('\n');
  DebugLogger.feature('PANEL', `링크 복사 요청 (${items.length}건)`);
  if (await copyText(text)) {
    toast(`링크 ${items.length}건 복사됨`);
  } else {
    DebugLogger.error('[PANEL] 링크 복사 실패', 'Clipboard API/execCommand 모두 실패', {
      code: 'E-CHR-UI-1002',
    });
    toast('복사 실패 — 다시 시도해 주세요.');
  }
});

// CSV 내보내기 (T-55): 검색·필터가 적용된 현재 탭 목록을 CSV로 저장 (링크 탭에서만)
$('pk-export-csv').addEventListener('click', () => {
  const items = tabItems();
  if (!items.length) {
    toast('내보낼 항목이 없습니다.');
    return;
  }
  const csvEsc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['URL', '이름', '형식', '카테고리', '크기(byte)', '폭', '높이', '본문', '출처'];
  const rows = items.map((it) =>
    [
      it.url,
      it.name || it.text || '',
      it.type || '',
      it.cat,
      it.size || 0,
      it.w || '',
      it.h || '',
      it.inArticle ? '본문' : '외부',
      it.source || '',
    ].map(csvEsc)
  );
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.join(',')).join('\r\n'); // BOM — Excel 한글 깨짐 방지
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  let host = 'page';
  try {
    host = new URL(analysis?.url || '').hostname.replace(/^www\./, '') || 'page';
  } catch {}
  const filename = `PageKit/${host}/links/${new Date().toISOString().slice(0, 10)}_pagekit.csv`;
  chrome.downloads.download({ url: objectUrl, filename, conflictAction: 'uniquify' }, (id) => {
    URL.revokeObjectURL(objectUrl);
    if (chrome.runtime.lastError) {
      DebugLogger.error('[PANEL] CSV 저장 실패', chrome.runtime.lastError.message, {
        code: 'E-CHR-DL-1002',
      });
      toast('CSV 저장 실패 — 다시 시도해 주세요.');
      return;
    }
    DebugLogger.feature('PANEL', `CSV 내보내기 완료 (${items.length}건, 필터 적용) → ${filename}`);
    toast(`CSV ${items.length}건 저장됨`);
  });
});

$('pk-download').addEventListener('click', async () => {
  const items = allItems().filter((it) => selection.has(it.id));
  DebugLogger.feature('PANEL', `다운로드 시작 요청 (${items.length}건)`, {
    urls: items.slice(0, 5).map((i) => i.url),
  });
  const streamItems = items.filter(
    (it) =>
      isStreamManifestUrl(it.url) ||
      it.source === 'youtube-capture' ||
      it.source === 'youtube-player'
  ); // m3u8/mpd 병합 + 유튜브(직접 수신)는 작업 창에서
  const normalItems = items.filter((it) => !isStreamManifestUrl(it.url));
  for (const it of streamItems) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: MSG.DOWNLOAD_STREAM,
        payload: {
          url: it.url,
          name: it.name || '',
          title: analysis?.title || document.title || '',
          folder: it.folder || new URL(it.url).hostname.replace(/^www\./, ''),
          referer: it.referer || location.href,
          tabId: analysisSource.tabId, // 페이지 컨텍스트 fetch 폴백용 (유튜브 googlevideo 등)
        },
      });
      if (!resp?.ok) {
        DebugLogger.error('[PANEL] 스트림 다운로드 거부', resp?.error?.message, resp?.error);
        toast(resp?.error?.message || '스트림 다운로드를 시작할 수 없습니다.');
      } else {
        DebugLogger.feature('PANEL', `스트림 다운로드 작업 창 열림 (${it.url.slice(0, 70)})`);
      }
    } catch (e) {
      DebugLogger.error('[PANEL] 스트림 다운로드 요청 실패', e.message, { code: 'E-CHR-DL-1004' });
      toast('스트림 다운로드 요청에 실패했습니다.');
    }
  }
  if (!normalItems.length) {
    if (streamItems.length) toast('스트림 다운로드 창을 엽니다.');
    return;
  }
  const zipMode = $('pk-zip-pack')?.checked === true;
  // 일반 동영상/오디오도 스트림처럼 독립 작업 창에서 (v0.7.10 브라우저 다운로더 폴백 + 진행 표시)
  const isVideoLike = (it) =>
    (it.cat === 'videos' || it.cat === 'audios') &&
    !streamItems.includes(it) &&
    it.downloadable !== false;
  const videoItems = normalItems.filter(isVideoLike);
  const otherItems = zipMode ? normalItems : normalItems.filter((it) => !isVideoLike(it));
  if (!zipMode && videoItems.length) {
    for (const it of videoItems) {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: MSG.DOWNLOAD_STREAM,
          payload: {
            url: it.url,
            name: it.name || '',
            title: analysis?.title || document.title || '',
            folder: it.folder || new URL(it.url).hostname.replace(/^www\./, ''),
            referer: it.referer || location.href,
            tabId: analysisSource.tabId, // 페이지 컨텍스트 fetch 폴백용
          },
        });
        if (resp?.ok) {
          DebugLogger.feature(
            'PANEL',
            `동영상 다운로드 작업 창 열림 (${(it.name || it.url).slice(0, 50)})`
          );
        } else {
          DebugLogger.error('[PANEL] 동영상 다운로드 거부', resp?.error?.message, resp?.error);
          toast(resp?.error?.message || '다운로드를 시작할 수 없습니다.');
        }
      } catch (e) {
        DebugLogger.error('[PANEL] 동영상 다운로드 요청 실패', e.message, {
          code: 'E-CHR-DL-1004',
        });
        toast('다운로드 요청에 실패했습니다.');
      }
    }
    if (!otherItems.length) {
      if (streamItems.length) toast('다운로드 창을 엽니다.');
      return;
    }
  }
  const resp = await chrome.runtime.sendMessage({
    type: MSG.DOWNLOAD_START,
    payload: { tabId: analysisSource.tabId, items: otherItems, zip: zipMode },
  });
  if (resp?.ok) {
    DebugLogger.feature(
      'PANEL',
      `다운로드 시작됨 (${otherItems.length}건${zipMode ? ' · ZIP 패키징' : ''})`
    );
    toast(
      zipMode
        ? `ZIP 패키징 시작 (${otherItems.length}건)`
        : `다운로드 시작 (${otherItems.length}건)`
    );
  } else {
    DebugLogger.error('[PANEL] 다운로드 시작 실패', resp?.error?.message, resp?.error, {
      code: 'E-CHR-DL-1001',
    });
    toast(resp?.error?.message || '다운로드 실패');
  }
});

// 다운로드 진행 수신 (BG broadcast 대신 session 폴링)
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.downloadJobs) {
    const jobs = changes.downloadJobs.newValue || [];
    const active = jobs.filter((j) => j.state === 'active');
    $('pk-reload').textContent = active.length ? `${active.length}⬇` : '⟳';
  }
});

// ---------- 스트림(m3u8) 처리 ----------
// 스트림 병합 저장은 독립 작업 창(downloader.html)에서 수행 — BG의 DOWNLOAD_STREAM 핸들러가 창을 열고,
// 진행률은 배지, 완료는 시스템 알림 + 10초 후 자동 닫기 (패널 닫힘/페이지 클릭과 무관하게 지속).

function isM3u8Url(url) {
  return /\.m3u8(\?|#|$)/i.test(url || '');
}

function isMpdUrl(url) {
  return /\.mpd(\?|#|$)/i.test(url || '');
}

function isStreamManifestUrl(url) {
  return isM3u8Url(url) || isMpdUrl(url);
}

// 초기 로드: 패널이 열릴 때마다 자동 재분석 (사용자가 새로고침하지 않아도 최신 수집)
DebugLogger.feature('PANEL', '사이드 패널 로드 완료');
const pkVersionEl = document.getElementById('pk-version');
if (pkVersionEl) pkVersionEl.textContent = `v${chrome.runtime.getManifest().version}`;
(async () => {
  analyze(true);
})();

// ---------- 자동 갱신 ----------
// 패널이 열린 상태에서 활성 탭 전환/URL 변경 시 자동 재분석 (사이드바 갱신)// 주의: changeInfo.url은 tabs 권한 없이는 오지 않으므로 status만 사용 (URL 비교는 활성 탭 재조회로 수행)
function maybeReanalyze() {
  chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (!tab?.id) return;
      if (analysisSource.tabId === tab.id && analysisSource.url === (tab.url || '')) return; // 이미 표시 중
      analyze(true);
    })
    .catch(() => {});
}
chrome.tabs.onActivated.addListener(() => maybeReanalyze());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete') maybeReanalyze();
});

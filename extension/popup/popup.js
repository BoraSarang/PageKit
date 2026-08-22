// popup/popup.js — 팝업 로직 (진입점 ① 아이콘 → 팝업, ④ [전체 보기 →])

import { MSG } from '../shared/messages.js' ;

const $ = (id) => document.getElementById(id) ;

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab) ;
}

async function analyzeCurrentTab() {
  const tab = await getActiveTab() ;
  // 빈 URL/특수 페이지는 분석 불가 — 주입 시도 생략
  if (!tab?.id || !tab?.url || !/^https?:/.test(tab.url)) return null ;
  DebugLogger.info('[POPUP] 분석 시작', { url: tab.url || '' }) ;
  try {
    // 콘텐츠 스크립트가 없으면 BG에 주입 요청 후 재시도 (팝업 메시지엔 sender.tab이 없으므로 tabId 명시 전달)
    const ensure = await chrome.runtime.sendMessage({ type: MSG.ENSURE_INJECTED, tabId: tab.id }) ;
    if (!ensure?.ok) {
      DebugLogger.error('[POPUP] 스크립트 주입 실패', ensure?.error, { code: 'E-CHR-PERM-1001' }) ;
      return null ;
    }
    // 팝업 → content 직접 분석 요청 (읽기 전용, BG 경유 불필요) — 메인 프레임만 (frameId: 0)
    let content ;
    try {
      content = await chrome.tabs.sendMessage(tab.id, { type: MSG.ANALYZE_PAGE }, { frameId: 0 }) ;
    } catch (e) {
      // 페이지 리로드 등으로 콘텐츠 스크립트가 사라진 경우 → 강제 재주입 후 1회 재시도
      DebugLogger.warn('[POPUP] 콘텐츠 스크립트 없음 — 강제 재주입 후 재시도', `${e.name}: ${e.message}`) ;
      const reinject = await chrome.runtime.sendMessage({ type: MSG.ENSURE_INJECTED, tabId: tab.id, force: true }) ;
      if (!reinject?.ok) throw e ;
      content = await chrome.tabs.sendMessage(tab.id, { type: MSG.ANALYZE_PAGE }, { frameId: 0 }) ;
    }
    if (content?.ok) {
      DebugLogger.feature('POPUP', '분석 완료', content.data.stats) ;
      // 패널이 재사용하도록 마지막 분석 결과 공유 (팝업=패널 숫자 일치)
      chrome.storage.session.set({ lastAnalysis: { tabId: tab.id, url: tab.url || '', result: content.data } }).catch(() => {}) ;
      return content.data ;
    }
    DebugLogger.warn('[POPUP] 분석 결과 없음', { code: 'E-CHR-NET-1001' }) ;
    return null ;
  } catch (e) {
    DebugLogger.error('[POPUP] 분석 실패', `${e.name}: ${e.message}`, { code: 'E-CHR-NET-1001' }) ;
    return null ;
  }
}

function renderSummary(result) {
  const section = $('pk-summary') ;
  if (!result) {
    section.hidden = true ;
    return ;
  }
  section.hidden = false ;
  $('pk-page-title').textContent = result.title || result.url ;

  const s = result.stats || {} ;
  $('pk-stats').innerHTML = [
    `<span class="chip">📷 이미지 ${s.totalImages ?? 0}</span>`,
    `<span class="chip">🎬 동영상 ${s.totalVideos ?? 0}</span>`,
    `<span class="chip">🔊 오디오 ${s.totalAudios ?? 0}</span>`,
    `<span class="chip">🔗 링크 ${s.totalLinks ?? 0}</span>`,
    `<span class="chip">🌐 스트림 ${s.totalStreams ?? 0}</span>`,
  ].join('') ;

  const a = result.article ;
  $('pk-article').textContent = a?.found ? `✅ 본문 감지 (${(a.bodyTextLen / 1000).toFixed(1)}K자) · ${a.title || ''}` : '⚠️ 본문 영역을 찾지 못했습니다.' ;
}

function renderDownloads(jobs) {
  const section = $('pk-dl-section') ;
  const badge = $('pk-dl-badge') ;
  const list = $('pk-dl-list') ;
  const active = (jobs || []).filter((j) => j.state === 'active' || j.state === 'paused') ;
  if (!active.length) {
    section.hidden = true ;
    badge.hidden = true ;
    return ;
  }
  section.hidden = false ;
  badge.hidden = false ;
  badge.textContent = String(active.length) ;
  list.innerHTML = active.map((j) => `
    <div class="pk-dl-item">
      <div>${j.name || j.folder || ''}</div>
      <div class="bar"><span style="width:${j.progress ?? 0}%"></span></div>
    </div>`).join('') ;
}

async function init() {

  // 분석 실행
  $('pk-analyze').addEventListener('click', async () => {
    DebugLogger.feature('POPUP', '분석 실행 (버튼 클릭)') ;
    $('pk-analyze').textContent = '⏳ 분석 중...' ;
    $('pk-analyze').disabled = true ;
    const result = await analyzeCurrentTab() ;
    if (result) {
      $('pk-analyze').textContent = '🔍 이 페이지 분석' ;
    } else {
      $('pk-analyze').textContent = '❌ 분석 실패 — 재시도' ;
    }
    $('pk-analyze').disabled = false ;
    renderSummary(result) ;
  }) ;

  // 사이드 패널 열기 (뷰 지정) — 팝업에서 직접 호출 (BG 경유 시 사용자 제스처 상실로 실패 가능)
  async function openPanelWith(view) {
    DebugLogger.feature('POPUP', `사이드 패널 열기 요청 view=${view}`) ;
    const tab = await getActiveTab() ;
    if (!tab?.windowId) {
      DebugLogger.error('[POPUP] 패널 열기 실패', 'windowId 없음', { code: 'E-CHR-UI-1001' }) ;
      return ;
    }
    try {
      const paths = {
        media: 'sidepanel/panel.html',
        quality: 'sidepanel/quality-tab.html?auto=1',
      } ;
      // 패널 경로 전환 후 오픈 (품질 진단 = 단독 패널, auto=1은 즉시 분석 플래그)
      await chrome.sidePanel.setOptions({ path: paths[view] || paths.media }) ;
      await chrome.sidePanel.open({ windowId: tab.windowId }) ;
      window.close() ;
    } catch (e) {
      DebugLogger.error('[POPUP] 패널 열기 실패', `${e.name}: ${e.message}`, { code: 'E-CHR-UI-1001' }) ;
    }
  }

  $('pk-panel-media').addEventListener('click', () => openPanelWith('media')) ;
  $('pk-panel-quality').addEventListener('click', () => openPanelWith('quality')) ;

  $('pk-open-options').addEventListener('click', (e) => {
    e.preventDefault() ;
    chrome.runtime.openOptionsPage() ;
  }) ;

  // 세션의 다운로드 상태 복원
  const jobs = await chrome.storage.session.get('downloadJobs').then((v) => v.downloadJobs || []) ;
  renderDownloads(jobs) ;

  // 자동 분석 없음 — "이 페이지 분석" 버튼 클릭 시에만 실행 (요구사항: 툴바 클릭 = 메뉴 노출만)
}

init() ;
// popup/popup.js — 팝업 로직 (사이드 패널 진입 메뉴 + 다운로드 상태)

const $ = (id) => document.getElementById(id);

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
}

function renderDownloads(jobs) {
  const section = $('pk-dl-section');
  const badge = $('pk-dl-badge');
  const list = $('pk-dl-list');
  const active = (jobs || []).filter((j) => j.state === 'active' || j.state === 'paused');
  if (!active.length) {
    section.hidden = true;
    badge.hidden = true;
    return;
  }
  section.hidden = false;
  badge.hidden = false;
  badge.textContent = String(active.length);
  list.innerHTML = active
    .map(
      (j) => `
    <div class="pk-dl-item">
      <div>${j.name || j.folder || ''}</div>
      <div class="bar"><span style="width:${j.progress ?? 0}%"></span></div>
    </div>`
    )
    .join('');
}

async function init() {
  // 버전 표시 (manifest 실시간 조회 — bump 시 자동 갱신)
  $('pk-version').textContent = `v${chrome.runtime.getManifest().version}`;

  // 사이드 패널 열기 (뷰 지정) — 팝업에서 직접 호출 (BG 경유 시 사용자 제스처 상실로 실패 가능)
  async function openPanelWith(view) {
    DebugLogger.feature('POPUP', `사이드 패널 열기 요청 view=${view}`);
    const tab = await getActiveTab();
    if (!tab?.windowId) {
      DebugLogger.error('[POPUP] 패널 열기 실패', 'windowId 없음', { code: 'E-CHR-UI-1001' });
      return;
    }
    try {
      const paths = {
        media: 'sidepanel/panel.html',
        quality: 'sidepanel/quality-tab.html?auto=1',
      };
      // 패널 경로 전환 후 오픈 (품질 진단 = 단독 패널, auto=1은 즉시 분석 플래그)
      await chrome.sidePanel.setOptions({ path: paths[view] || paths.media });
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    } catch (e) {
      DebugLogger.error('[POPUP] 패널 열기 실패', `${e.name}: ${e.message}`, {
        code: 'E-CHR-UI-1001',
      });
    }
  }

  $('pk-panel-media').addEventListener('click', () => openPanelWith('media'));
  $('pk-panel-quality').addEventListener('click', () => openPanelWith('quality'));

  $('pk-open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 세션의 다운로드 상태 복원
  const jobs = await chrome.storage.session.get('downloadJobs').then((v) => v.downloadJobs || []);
  renderDownloads(jobs);

  // 자동 분석 없음 — "이 페이지 분석" 버튼 클릭 시에만 실행 (요구사항: 툴바 클릭 = 메뉴 노출만)
}

init();

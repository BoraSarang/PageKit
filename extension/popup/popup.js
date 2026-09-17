// popup/popup.js — 팝업 로직 (사이드 패널 진입 메뉴 + 다운로드 상태)

import { openPanelFromGesture } from '../shared/panel-host.js';
import { extApi, supportsSidePanel } from '../shared/browser-shim.js';

const $ = (id) => document.getElementById(id);

function getActiveTab() {
  // Safari 툴바 팝업: 팝업 윈도우와 무관하게 마지막 포커스 창의 탭 조회 (T-SAF-07)
  const scope = supportsSidePanel() ? { currentWindow: true } : { lastFocusedWindow: true };
  return extApi()
    .tabs.query({ active: true, ...scope })
    .then(([tab]) => tab);
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
  // Safari는 panel-host가 팝업 윈도우로 폴백 (v1.0.12)
  async function openPanelWith(view) {
    DebugLogger.feature('POPUP', `사이드 패널 열기 요청 view=${view}`);
    const tab = await getActiveTab();
    if (!tab?.windowId) {
      DebugLogger.error('[POPUP] 패널 열기 실패', 'windowId 없음', { code: 'E-CHR-UI-1001' });
      return;
    }
    try {
      const r = await openPanelFromGesture(view, tab.windowId);
      if (!r.ok) {
        DebugLogger.error('[POPUP] 패널 열기 실패', r.error?.code || 'unknown', {
          code: r.error?.code || 'E-CHR-UI-1001',
        });
        return;
      }
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

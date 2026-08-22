// background/sidepanel-controller.js — 사이드 패널 진입점 5종 공통 헬퍼
// 진입점: icon / context / shortcut / popup / float (docs/DESIGN.md 6장)

import { BGLogger } from './logger.js';
import { PANEL_SOURCES } from '../shared/messages.js';

let lastOpenAt = 0;

// 패널 뷰별 경로 (quality는 단독 패널 모드 — ?auto=1로 즉시 분석 + 탭 추적)
const PANEL_VIEW_PATHS = {
  media: 'sidepanel/panel.html',
  quality: 'sidepanel/quality-tab.html?auto=1',
};

export async function openSidePanel(source, windowId, view = 'media') {
  if (!PANEL_SOURCES.includes(source)) {
    BGLogger.warn('PANEL', `알 수 없는 진입점 source=${source}`);
    source = 'icon';
  }
  const panelPath = PANEL_VIEW_PATHS[view] || PANEL_VIEW_PATHS.media;
  try {
    // 제스처 유지: windowId를 받으면 tabs.query(await) 없이 즉시 호출
    let wId = windowId;
    if (wId == null) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      wId = tab?.windowId;
    }
    if (wId == null) {
      BGLogger.warn('PANEL', '활성 탭 없음');
      return {
        ok: false,
        error: { code: 'E-CHR-UI-1001', message: '사이드 패널을 열 수 없습니다.' },
      };
    }
    // 연속 호출 방지 (1초 내 중복)
    const now = Date.now();
    if (now - lastOpenAt < 1000) {
      BGLogger.debug('PANEL', '연속 호출 무시 (debounce)');
      return { ok: true };
    }
    lastOpenAt = now;
    // 제스처 보존: setOptions를 대기 없이 병행 실행. await가 open 앞에 끼면
    // 컨텍스트 메뉴·단축키의 사용자 제스처가 소멸해 open 실패 → 새탭 폴백이 발생함.
    chrome.sidePanel
      .setOptions({ path: panelPath })
      .catch((e2) => BGLogger.warn('PANEL', `패널 경로 전환 실패 (${e2.message})`));
    await chrome.sidePanel.open({ windowId: wId });
    BGLogger.feature('PANEL', `사이드 패널 열림 source=${source} view=${view}`);
    return { ok: true };
  } catch (e) {
    BGLogger.error('PANEL', `사이드 패널 열기 실패 (${e.message})`);
    // content script(플로팅) 경유는 MV3에서 user gesture가 전달되지 않아 sidePanel.open()이 항상 실패함.
    // "반응 없음" 방지: 기존 패널 탭이 있으면 활성화, 없으면 새 탭으로 폴백.
    try {
      const basePath = chrome.runtime.getURL(panelPath.split('?')[0]);
      const targetUrl = chrome.runtime.getURL(panelPath);
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
      const panelCtx = ctxs.find(
        (c) => c.documentUrl?.split('?')[0] === basePath || c.documentUrl?.startsWith(basePath)
      );
      if (panelCtx?.tabId != null) {
        await chrome.tabs.update(panelCtx.tabId, { active: true });
        BGLogger.warn('PANEL', '사이드 패널 열기 실패 → 기존 패널 탭 활성화 (fallback=tab)');
      } else {
        await chrome.tabs.create({ url: targetUrl, active: true });
        BGLogger.warn('PANEL', '사이드 패널 열기 실패 → 패널 탭 생성 (fallback=tab)');
      }
      return { ok: true, fallback: 'tab' };
    } catch (e2) {
      BGLogger.error('PANEL', `패널 탭 폴백 실패 (${e2.message})`);
    }
    return {
      ok: false,
      error: {
        code: 'E-CHR-UI-1001',
        message: '사이드 패널을 열 수 없습니다. 다시 시도해 주세요.',
      },
    };
  }
}

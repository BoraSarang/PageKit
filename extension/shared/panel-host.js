// shared/panel-host.js — 패널 호스트 추상화 (v1.0.12, Safari macOS 대응)
// 원칙: 동일 문서 + 다른 호스트. Chrome=sidePanel 도킹, Safari=팝업 윈도우.
// 분기는 이 파일에만 격리 — 호출자는 openPanelFromGesture(view) 하나만 사용한다.

import { extApi, supportsSidePanel } from './browser-shim.js';

export const PANEL_VIEW_PATHS = {
  media: 'sidepanel/panel.html',
  quality: 'sidepanel/quality-tab.html?auto=1',
};

function logFeature(msg) {
  try {
    if (globalThis.DebugLogger && typeof globalThis.DebugLogger.feature === 'function') {
      globalThis.DebugLogger.feature('PANEL', msg);
      return;
    }
  } catch {}
  try {
    console.log(`[FEATURE] [PANEL] ${msg}`);
  } catch {}
}

function logError(msg, code) {
  try {
    if (globalThis.DebugLogger && typeof globalThis.DebugLogger.error === 'function') {
      globalThis.DebugLogger.error('[PANEL] 패널 열기 실패', msg, { code });
      return;
    }
  } catch {}
  try {
    console.error(`[PANEL] ${msg} (${code})`);
  } catch {}
}

// Safari 등 sidePanel 미지원 환경의 대체 UI 설명 (팝업 버튼 안내용)
export function panelAvailability() {
  if (supportsSidePanel()) return { available: true, docked: true };
  return {
    available: true,
    docked: false,
    note: '이 브라우저에는 도킹 패널이 없어 별도 창으로 열립니다.',
  };
}

// 사용자 제스처(클릭·단축키·컨텍스트 메뉴) 안에서 호출해야 한다.
// await를 open 앞에 두면 제스처가 소멸하므로 fire-and-forget 원칙 유지.
export async function openPanelFromGesture(view = 'media', windowId = null) {
  const api = extApi();
  const panelPath = PANEL_VIEW_PATHS[view] || PANEL_VIEW_PATHS.media;
  if (supportsSidePanel()) {
    let wId = windowId;
    if (wId == null) {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      wId = tab && tab.windowId;
    }
    if (wId == null) {
      logError('windowId 없음', 'E-CHR-UI-1001');
      return { ok: false, error: { code: 'E-CHR-UI-1001' } };
    }
    try {
      api.sidePanel.setOptions({ path: panelPath }).catch(() => {});
      await api.sidePanel.open({ windowId: wId });
      logFeature(`사이드 패널 열림 view=${view}`);
      return { ok: true };
    } catch (e) {
      logError(`${e && e.name}: ${e && e.message}`, 'E-CHR-UI-1001');
      return { ok: false, error: { code: 'E-CHR-UI-1001' } };
    }
  }
  // Safari 경로: 팝업 윈도우에 동일 문서 로드
  try {
    const url = api.runtime.getURL(panelPath);
    await api.windows.create({ url, type: 'popup', width: 420, height: 720 });
    logFeature(`Safari 팝업 윈도우 패널 열림 view=${view}`);
    return { ok: true, fallback: 'window' };
  } catch (e) {
    // 최종 폴백: 새 탭
    try {
      const url = api.runtime.getURL(panelPath);
      await api.tabs.create({ url, active: true });
      logFeature(`Safari 패널 탭 폴백 view=${view}`);
      return { ok: true, fallback: 'tab' };
    } catch (e2) {
      logError(`Safari 패널 열기 실패 (${e2 && e2.message})`, 'E-SAF-UI-1001');
      return { ok: false, error: { code: 'E-SAF-UI-1001' } };
    }
  }
}

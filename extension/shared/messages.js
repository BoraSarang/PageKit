// shared/messages.js — BG↔content↔UI 메시지 타입/상수
// docs/chrome/MESSAGING.md 규약 참조

export const MSG = {
  ANALYZE_PAGE: 'pk.analyze.page',
  ANALYZE_PAGE_RESULT: 'pk.analyze.result',
  ENSURE_INJECTED: 'pk.inject.ensure',
  ENSURE_FRAMES: 'pk.inject.frames',
  OPEN_SIDE_PANEL: 'pk.ui.openPanel',
  DOWNLOAD_START: 'pk.dl.start',
  DOWNLOAD_PROGRESS: 'pk.dl.progress',
  DOWNLOAD_STATE: 'pk.dl.state',
  DOWNLOAD_CANCEL: 'pk.dl.cancel',
  DOWNLOAD_STREAM: 'pk.stream.open',
  STREAM_PROGRESS: 'pk.stream.progress',
  STREAM_DONE: 'pk.stream.done',
  STREAM_FAIL: 'pk.stream.fail',
  STREAM_CANCEL: 'pk.stream.cancel',
  GET_CAPTURED_STREAMS: 'pk.stream.captured.get',
  THUMB_FETCH: 'pk.thumb.fetch',
  HIGHLIGHT_TOGGLE: 'pk.ui.highlight',
  SETTINGS_GET: 'pk.settings.get',
  SETTINGS_SET: 'pk.settings.set',

  // 품질 진단
  QUALITY_ANALYZE: 'pk.quality.analyze',
  QUALITY_GET_CONFIG: 'pk.quality.getConfig',
  QUALITY_EXPORT: 'pk.quality.export',
  QUALITY_FRAME_ANALYZE: 'pk.quality.frame.analyze',
  QUALITY_FRAME_RESULT: 'pk.quality.frame.result',
};

export const PANEL_SOURCES = ['icon', 'context', 'shortcut', 'popup'];

export const MSG_OK = { ok: true };
export function msgOk(data) {
  return data === undefined ? { ok: true } : { ok: true, data };
}
export function msgErr(code, message) {
  return { ok: false, error: { code, message } };
}

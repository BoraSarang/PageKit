// shared/messages.js — BG↔content↔UI 메시지 타입/상수
// docs/chrome/MESSAGING.md 규약 참조

export const MSG = {
  ANALYZE_PAGE: 'pk.analyze.page',
  ANALYZE_PAGE_RESULT: 'pk.analyze.result',
  ENSURE_INJECTED: 'pk.inject.ensure',
  ENSURE_FRAMES: 'pk.inject.frames', // iframe 협업 미응답 시 iframe에 분석 스크립트 재주입 요청
  OPEN_SIDE_PANEL: 'pk.ui.openPanel',
  DOWNLOAD_START: 'pk.dl.start',
  DOWNLOAD_PROGRESS: 'pk.dl.progress',
  DOWNLOAD_STATE: 'pk.dl.state',
  DOWNLOAD_CANCEL: 'pk.dl.cancel',
  DOWNLOAD_STREAM: 'pk.stream.open',     // 스트림 다운로드 작업 창 열기
  STREAM_PROGRESS: 'pk.stream.progress', // 작업 창 → BG 진행률 (배지)
  STREAM_DONE: 'pk.stream.done',         // 작업 창 → BG 완료 (알림 + 10초 후 창 닫기)
  STREAM_FAIL: 'pk.stream.fail',         // 작업 창 → BG 실패 (배지 정리)
  STREAM_CANCEL: 'pk.stream.cancel',     // 작업 창 → BG 취소 (배지 정리)
  THUMB_FETCH: 'pk.thumb.fetch',
  HIGHLIGHT_TOGGLE: 'pk.ui.highlight',
  FLOAT_BUTTON_READY: 'pk.content.floatReady',
  SETTINGS_GET: 'pk.settings.get',
  SETTINGS_SET: 'pk.settings.set',
  UNLOCK_TOGGLE: 'pk.unlock.toggle',
} ;

export const PANEL_SOURCES = ['icon', 'context', 'shortcut', 'popup', 'float'] ;

export const MSG_OK = { ok: true } ;
export function msgOk(data) {
  return data === undefined ? { ok: true } : { ok: true, data } ;
}
export function msgErr(code, message) {
  return { ok: false, error: { code, message } } ;
}
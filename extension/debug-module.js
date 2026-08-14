// debug-module.js — BG 서비스 워커용 DebugLogger re-export
// debug.js는 전역 스크립트이므로 module에서 직접 import 불가.
// side-effect import로 전역에 주입한 뒤 re-export한다.
import './debug.js' ;
export const DebugLogger = globalThis.DebugLogger ;
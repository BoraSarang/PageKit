// shared/dom-utils.js — 공용 DOM 유틸 (classic 전용, ESM은 사이드이펙트 import 후 pkDom 사용)
// 사용법:
//   ESM:      import '../shared/dom-utils.js';  const { $, escapeHtml } = globalThis.pkDom;
//   classic:  <script src="../shared/dom-utils.js"></script> 후 globalThis.pkDom 참조

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]
  );
}

globalThis.pkDom = { $, escapeHtml };

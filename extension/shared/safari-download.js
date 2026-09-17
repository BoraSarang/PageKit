// shared/safari-download.js — downloads API 폴백 (v1.0.12)
// Safari는 downloads 권한·API를 지원하지 않을 수 있으므로 (packager 감사 경고),
// downloads.download 우선 → 없으면 앵커(a[download]) 폴백(DOM 있는 확장 페이지에서만).
// SW 등 DOM 없는 컨텍스트에서는 { ok:false, code:'E-SAF-DL-1001' } 반환 — 호출자가 한국어 안내.

import { extApi, supportsDownloads } from './browser-shim.js';

function baseName(filename) {
  const s = String(filename || 'download');
  const parts = s.split('/');
  return parts[parts.length - 1] || 'download';
}

function anchorDownload(url, filename) {
  return new Promise((resolve, reject) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = baseName(filename);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          a.remove();
        } catch {}
        resolve({ ok: true, fallback: 'anchor' });
      }, 500);
    } catch (e) {
      reject(e);
    }
  });
}

// { url, filename, saveAs } → { ok, id?, fallback? } 또는 예외 (code 부착)
export async function downloadFile({ url, filename, saveAs = false } = {}) {
  const api = extApi();
  if (supportsDownloads()) {
    try {
      const opts = { url, filename, conflictAction: 'uniquify' };
      if (saveAs) opts.saveAs = true;
      // Promise 방식 (MV3) — 콜백 미지원 환경 대응
      const id = await api.downloads.download(opts);
      return { ok: true, id };
    } catch (e) {
      // downloads 호출 실패 → DOM 있으면 앵커 폴백, 없으면 E-SAF 코드로 보고
      if (typeof document === 'undefined') {
        throw Object.assign(new Error(`E-SAF-DL-1001 Safari 다운로드 실패 (${e.message})`), {
          code: 'E-SAF-DL-1001',
        });
      }
      try {
        return await anchorDownload(url, filename);
      } catch (e2) {
        throw Object.assign(new Error(`E-SAF-DL-1001 Safari 다운로드 실패 (${e2.message})`), {
          code: 'E-SAF-DL-1001',
        });
      }
    }
  }
  if (typeof document === 'undefined') {
    throw Object.assign(new Error('E-SAF-DL-1001 이 브라우저는 다운로드를 지원하지 않습니다.'), {
      code: 'E-SAF-DL-1001',
    });
  }
  try {
    return await anchorDownload(url, filename);
  } catch (e) {
    throw Object.assign(new Error(`E-SAF-DL-1001 Safari 다운로드 실패 (${e.message})`), {
      code: 'E-SAF-DL-1001',
    });
  }
}

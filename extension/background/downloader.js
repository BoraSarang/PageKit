// background/downloader.js — 배치 다운로드 + 상태 추적 (T-23/T-24)
// chrome.downloads 사용, 동시 N건, 실패 시 재시도 2회, 상태는 storage.session에 기록.

import { BGLogger } from './logger.js' ;
import * as storage from './storage.js' ;

const MAX_RETRY = 2 ;
let jobSeq = 0 ;
let running = [] ; // [{ jobId, item, retry, downloadId }]

// CDN Referer 체크 대응: 호스트별 Referer/Origin 헤더 주입 (DNR 동적 규칙)
const refererRules = new Map() ; // host -> ruleId
let ruleSeq = 1000 ;

export async function ensureReferer(host, referer) {  const existing = refererRules.get(host) ;
  if (existing) return existing ;
  const ruleId = ++ruleSeq ;
  let origin = referer ;
  try { origin = new URL(referer).origin ; } catch {}
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'referer', operation: 'set', value: referer },
          { header: 'origin', operation: 'set', value: origin },
        ],
      },
      condition: {
        urlFilter: `||${host}/`,
        resourceTypes: ['xmlhttprequest', 'media', 'other'],
      },
    }],
  }) ;
  refererRules.set(host, ruleId) ;
  BGLogger.info('DL', `Referer 규칙 등록 ${host} ← ${origin}`) ;
  return ruleId ;
}

async function releaseReferer(host) {
  const ruleId = refererRules.get(host) ;
  if (!ruleId) return ;
  refererRules.delete(host) ;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] }) ;
  } catch {}
}

function domainFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') || 'page' ; } catch { return 'page' ; }
}

function safeName(url, idx) {
  try {
    const u = new URL(url) ;
    const base = u.pathname.split('/').filter(Boolean).pop() || `file_${idx}` ;
    return decodeURIComponent(base).replace(/[\\/:*?"<>|]/g, '_') ;
  } catch { return `file_${idx}` ; }
}

function categoryOf(item) {
  return item.cat === 'images' ? 'images' : item.cat === 'videos' ? 'videos' : item.cat === 'audios' ? 'audios' : item.cat === 'streams' ? 'streams' : 'links' ;
}

function extOf(url) {
  const m = url.split('?')[0].match(/\.([a-z0-9]{1,6})$/i) ;
  return m ? `.${m[1].toLowerCase()}` : '' ;
}

async function persist() {
  await storage.setSession('downloadJobs', running) ;
}

function broadcast() {
  chrome.runtime.sendMessage({ type: 'pk.dl.progress', payload: running.map((j) => ({
    jobId: j.jobId, name: j.name, folder: j.folder, state: j.state, progress: j.progress,
  })) }).catch(() => {}) ;
  chrome.action.setBadgeText({ text: running.filter((j) => j.state === 'active').length ? String(running.filter((j) => j.state === 'active').length) : '' }).catch(() => {}) ;
}

async function startJob(item, tabId) {
  const job = {
    jobId: `job_${++jobSeq}`,
    item,
    tabId: tabId ?? null,
    name: item.filename || safeName(item.url, jobSeq),
    folder: domainFrom(item.url),
    state: 'active',
    progress: 0,
    retry: 0,
    downloadId: null,
  } ;
  running.push(job) ;
  await persist() ;
  broadcast() ;
  await runDownload(job) ;
}

async function fetchViaPage(tabId, url) {
  // WAF 등이 확장 오리진 요청을 403으로 차단하는 사이트 대응:
  // 페이지 컨텍스트(MAIN world)에서 fetch → base64 → BG가 Blob(objectURL)로 다운로드
  const [res] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    world: 'MAIN',
    func: async (u) => {
      try {
        const r = await fetch(u, { credentials: 'include' }) ;
        if (!r.ok) return { ok: false, status: r.status } ;
        const buf = new Uint8Array(await r.arrayBuffer()) ;
        let bin = '' ;
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)) ;
        return { ok: true, mime: r.headers.get('content-type') || '', b64: btoa(bin), size: buf.length } ;
      } catch (e) {
        return { ok: false, error: String(e) } ;
      }
    },
    args: [url],
  }) ;
  const data = res?.result ;
  if (!data?.ok) throw new Error(`페이지 fetch 실패 status=${data?.status || data?.error || '?'}`) ;
  const bin = atob(data.b64) ;
  const bytes = new Uint8Array(bin.length) ;
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ;
  return { blob: new Blob([bytes], { type: data.mime }), size: data.size } ;
}

// ---------- HLS 스트림 저장 안내 ----------
// 스트림(m3u8) 병합 저장은 사이드 패널이 직접 수행 (SW는 createObjectURL 불가 + Whale offscreen 미지원).
// BG가 직접 받은 스트림 요청(팝업 등)은 패널 사용을 안내.
// CORS를 허용하지 않는 CDN(서버가 다운로드 차단)은 실패하며 E-CHR-DL-1003/1004로 안내.
async function downloadStream(job) {
  throw new Error('E-CHR-DL-1003: 스트림 저장은 사이드 패널에서 실행해 주세요.') ;
}

async function runDownload(job, viaPage = false) {
  const settings = await storage.getSettings() ;
  try {
    const name = job.name ;
    const needsExt = extOf(job.item.url) && !/\.(png|jpe?g|gif|webp|avif|mp4|webm|mp3|m4a|zip|pdf|m3u8|mpd)$/i.test(name) ;
    const filename = `PageKit/${job.folder}/${categoryOf(job.item)}/${name}${needsExt ? extOf(job.item.url) : ''}` ;
    // CDN Referer 체크 대응 — 추출 시 기록한 출처 페이지를 Referer로 주입
    if (job.item.referer && !viaPage) {
      try { await ensureReferer(domainFrom(job.item.url), job.item.referer) ; }
      catch (e) { BGLogger.warn('DL', `Referer 규칙 등록 실패 ${e.message}`) ; }
    }
    let downloadId ;
    if (/\.m3u8(\?|#|$)/i.test(job.item.url)) {
      // HLS 스트림: 매니페스트 → 세그먼트 병합 저장 (확장 오리진 fetch — CORS 허용 CDN만 가능)
      // 저장은 사이드 패널(확장 페이지) 경유: SW는 createObjectURL 불가 + Whale offscreen 미지원
      downloadId = await downloadStream(job) ;
    } else if (viaPage) {
      // WAF가 확장 오리진을 차단하는 사이트: 페이지 컨텍스트 fetch → Blob(objectURL) 다운로드
      const page = await fetchViaPage(job.tabId, job.item.url) ;
      job.item.size = page.size ;
      const objectUrl = URL.createObjectURL(page.blob) ;
      try {
        downloadId = await chrome.downloads.download({
          url: objectUrl,
          filename,
          conflictAction: 'uniquify',
        }) ;
      } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000) ;
      }
    } else {
      downloadId = await chrome.downloads.download({
        url: job.item.url,
        filename,
        conflictAction: 'uniquify',
      }) ;
    }
    job.downloadId = downloadId ;
    job.state = 'active' ;
    await persist() ;
    broadcast() ;
  } catch (e) {
    BGLogger.error('DL', `다운로드 시작 실패 ${job.item.url} (${e.message})`) ;
    await handleFail(job, null, true) ;
  }
}

async function handleFail(job, error = null, fromStart = false) {
  // WAF 403(SERVER_FORBIDDEN) 또는 재시도 소진 시: 페이지 오리진 fetch 폴백 1회
  if ((error === 'SERVER_FORBIDDEN' || job.retry >= MAX_RETRY) && !job.paged) {
    job.paged = true ;
    job.state = 'active' ;
    BGLogger.warn('DL', `페이지 오리진 fetch 폴백 ${job.name}`) ;
    try {
      await runDownload(job, true) ;
      return ;
    } catch (e) {
      BGLogger.error('DL', `폴백 실패 ${job.name} (${e.message})`) ;
    }
  }
  if (job.retry < MAX_RETRY && !fromStart) {
    job.retry += 1 ;
    job.state = 'active' ;
    BGLogger.warn('DL', `재시도 ${job.retry}/${MAX_RETRY} ${job.name}`) ;
    await runDownload(job) ;
  } else {
    job.state = 'failed' ;
    releaseReferer(domainFrom(job.item.url)) ;
    await persist() ;
    broadcast() ;
    BGLogger.error('DL', `다운로드 실패 (${job.name})`, { code: 'E-CHR-DL-1002' }) ;
  }
}

function removeJob(jobId) {
  running = running.filter((j) => j.jobId !== jobId) ;
  persist() ;
  broadcast() ;
}

let ensureInjectedFn = null ;

export function initDownloader(deps = {}) {
  ensureInjectedFn = deps.ensureInjected || null ; // fetchViaPage 폴백용
  chrome.downloads.onChanged.addListener(async (delta) => {
    const job = running.find((j) => j.downloadId === delta.id) ;
    if (!job) return ;

    if (delta.state) {
      if (delta.state.current === 'complete') {
        job.state = 'complete' ;
        job.progress = 100 ;
        BGLogger.info('DL', `완료: ${job.name}`) ;
        releaseReferer(domainFrom(job.item.url)) ;
        await persist() ;
        broadcast() ;
        // 완료 후 약간 지연 제거
        setTimeout(() => removeJob(job.jobId), 8000) ;
      } else if (delta.state.current === 'interrupted') {
        BGLogger.warn('DL', `중단: ${job.name} (${delta.error?.current || 'unknown'})`) ;
        await handleFail(job, delta.error?.current) ;
      }
    }
    if (delta.bytesReceived) {
      const total = job.item.size || 0 ;
      job.progress = total > 0 ? Math.min(99, Math.round((delta.bytesReceived.current / total) * 100)) : job.progress ;
    }
  }) ;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'pk.dl.start') {
      const items = message.payload?.items || [] ;
      const tabId = message.payload?.tabId ?? _sender.tab?.id ?? null ;
      if (!items.length) {
        sendResponse({ ok: false, error: { code: 'E-CHR-DL-1001', message: '선택된 항목이 없습니다.' } }) ;
        return false ;
      }
      const settings = storage.getSettings().then((s) => {
        const queue = [...items] ;
        const workers = Math.min(s.concurrentDownloads || 3, 6) ;
        const run = async () => {
          while (queue.length) {
            const item = queue.shift() ;
            if (!item?.url?.startsWith('http')) continue ;
            if (item.downloadable === false) continue ; // 매니페스트/embed 페이지 등 저장 불가 항목 방어 스킵
            await startJob(item, tabId) ;
            // 순차 진행 대기 (동시성은 상태상 병렬로 보이지만 chrome.downloads가 관리)
          }
        } ;
        Promise.all(Array.from({ length: workers }, run)).then(() => sendResponse({ ok: true, data: { started: items.length } })) ;
      }) ;
      return true ;
    }
    if (message?.type === 'pk.dl.state') {
      sendResponse({ ok: true, data: running.map((j) => ({
        jobId: j.jobId, name: j.name, folder: j.folder, state: j.state, progress: j.progress,
      })) }) ;
      return false ;
    }
    if (message?.type === 'pk.thumb.fetch') {
      // WAF가 확장 오리진 이미지 로드를 403 차단하는 사이트 대응:
      // 페이지 컨텍스트(MAIN)에서 fetch → 120px canvas dataURL로 축소 반환 (패널 썸네일용)
      // MAIN 실패분(유튜브 i.ytimg.com 등 cross-origin CSP/CORS 차단)은
      // BG(확장 오리진) fetch로 재시도 — content script ISOLATED fetch는 페이지 CSP를 받아 실패하므로 BG 직접 수행
      const urls = (message.payload?.urls || []).filter((u) => u?.startsWith('http')) ;
      const tabId = message.payload?.tabId ?? _sender.tab?.id ?? null ;
      BGLogger.info('THUMB', `썸네일 폴백 요청 tab=${tabId} n=${urls.length} first=${urls[0]?.split('/').pop()?.slice(0, 24)}`) ;
      if (!urls.length || !tabId) {
        sendResponse({ ok: true, data: {} }) ;
        return false ;
      }
      const fetchFunc = async (urls) => {
        // 토렌트씨 등 WAF가 짧은 시간 내 연속 요청을 임시 차단(Failed to fetch)하므로
        // 배치 5개 + 배치 간 대기 + 개별 1회 재시도로 서버 부하를 분산
        // fetch 실패 시 <img> 로드+canvas 폴백 (WAF가 Accept:image/* 요청은 허용하는 사이트 대응)
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms)) ;
        const out = [] ;
        const toData = (bmp) => {
          const w = 120, h = Math.max(1, Math.round((bmp.height * w) / bmp.width)) ;
          const c = document.createElement('canvas') ;
          c.width = w ; c.height = h ;
          c.getContext('2d').drawImage(bmp, 0, 0, w, h) ;
          return c.toDataURL('image/jpeg', 0.7) ;
        } ;
        const viaImg = (u) => new Promise((res, rej) => {
          const img = new Image() ;
          img.crossOrigin = 'anonymous' ;
          img.onload = () => {
            try {
              const w = 120, h = Math.max(1, Math.round((img.naturalHeight * w) / img.naturalWidth)) ;
              const c = document.createElement('canvas') ;
              c.width = w ; c.height = h ;
              c.getContext('2d').drawImage(img, 0, 0, w, h) ;
              res(c.toDataURL('image/jpeg', 0.7)) ;
            } catch (e) { rej(e) }
          } ;
          img.onerror = () => rej(new Error('img-load-fail')) ;
          img.src = u ;
        }) ;
        const tryOne = async (u, attempt) => {
          let bmp = null ;
          try {
            const r = await fetch(u, { credentials: 'include' }) ;
            if (r.ok) {
              try { bmp = await createImageBitmap(await r.blob()) ; } catch { bmp = null ; }
            }
          } catch { bmp = null ; }
          if (bmp) return { url: u, data: toData(bmp) } ;
          try {
            const data = await viaImg(u) ;
            if (data) return { url: u, data } ;
          } catch { /* img 폴백 실패 */ }
          if (attempt === 0) { await sleep(1000) ; return tryOne(u, 1) ; }
          return { url: u, err: 'fetch+img 실패' } ;
        } ;
        for (let i = 0 ; i < urls.length ; i += 5) {
          const chunk = urls.slice(i, i + 5) ;
          for (const u of chunk) out.push(await tryOne(u, 0)) ;
          if (i + 5 < urls.length) await sleep(700) ;
        }
        return out ;
      } ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)) ;
      const runFetch = (world, list) =>
        chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world, func: fetchFunc, args: [list] })
          .then(([res]) => res?.result || []) ;
      (async () => {
        const first = await runFetch('MAIN', urls) ;
        const failed = first.filter((it) => !it?.data) ;
        const map = {} ;
        const errs = {} ;
        for (const it of first) {
          if (it?.data) map[it.url] = it.data ;
          else if (it?.err) errs[it.err] = (errs[it.err] || 0) + 1 ;
        }
        if (failed.length) {
          BGLogger.info('THUMB', `MAIN 실패분 확장 오리진(BG) 재시도 n=${failed.length} first=${failed[0]?.url?.split('/').pop()?.slice(0, 24)}`) ;
          const list = failed.map((f) => f.url) ;
          for (let i = 0 ; i < list.length ; i += 5) {
            const chunk = list.slice(i, i + 5) ;
            for (const u of chunk) {
              try {
                const r = await fetch(u, { credentials: 'include' }) ;
                const b = await r.blob() ;
                let bmp = null ;
                try { bmp = await createImageBitmap(b) ; } catch (e) { bmp = null ; }
                if (!r.ok || !bmp) {
                  BGLogger.warn('THUMB', `BG 재시도 실패 ${u.slice(0, 110)} → ${r.status} ${r.headers.get('content-type')} ${b.size}b`) ;
                  errs[`HTTP ${r.status}`] = (errs[`HTTP ${r.status}`] || 0) + 1 ;
                  continue ;
                }
                const w = 120, h = Math.max(1, Math.round((bmp.height * w) / bmp.width)) ;
                const c = new OffscreenCanvas(w, h) ;
                c.getContext('2d').drawImage(bmp, 0, 0, w, h) ;
                const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 }) ;
                const data = await new Promise((res, rej) => {
                  const fr = new FileReader() ;
                  fr.onload = () => res(fr.result) ;
                  fr.onerror = () => rej(fr.error) ;
                  fr.readAsDataURL(blob) ;
                }) ;
                map[u] = data ;
              } catch (e) {
                BGLogger.warn('THUMB', `BG 재시도 예외 ${u.slice(0, 110)} → ${String(e).slice(0, 70)}`) ;
                errs[String(e).slice(0, 90)] = (errs[String(e).slice(0, 90)] || 0) + 1 ;
              }
            }
            if (i + 5 < list.length) await sleep(700) ;
          }
        }
        BGLogger.info('THUMB', `썸네일 폴백 완료 ok=${Object.keys(map).length}/${urls.length} err=${JSON.stringify(errs)}`) ;
        sendResponse({ ok: true, data: map }) ;
      })().catch((e) => {
        BGLogger.error('THUMB', `썸네일 폴백 실패 ${e.message}`, { code: 'E-CHR-PERM-1001' }) ;
        sendResponse({ ok: false, error: String(e) }) ;
      }) ;
      return true ;
    }
    if (message?.type === 'pk.dl.cancel') {
      const job = running.find((j) => j.jobId === message.payload?.jobId) ;
      if (job?.downloadId != null) chrome.downloads.cancel(job.downloadId) ;
      removeJob(message.payload?.jobId) ;
      sendResponse({ ok: true }) ;
      return false ;
    }
    return false ;
  }) ;

  BGLogger.feature('BG', '다운로더 초기화 완료') ;
}
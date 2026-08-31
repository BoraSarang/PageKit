// shared/download-checkpoint.js — 스트림 다운로드 체크포인트(이어받기) 헬퍼
// ┌ 역할 ─────────────────────────────────────────────
// │ 단일 URL 초청크(direct)와 DASH 세그먼트 병합이 중단(서비스워커/브라우저/네트워크)되어도
// │ 받은 바이트/세그먼트를 chrome.storage.local에 기록해 이어받을 수 있게 한다.
// │ Aura(level5 등 패키지)의 download-checkpoint 방식 참고 — PageKit 에러코드/DebugLogger 규약 적용.
// └───────────────────────────────────────────────────

const PREFIX = 'pkdlckpt:';

// 저장 전 값 위생 처리 — 손상/비정상 데이터가 들어와도 안전한 숫자만 보존
function sanitize(value) {
  const bytesWritten =
    Number.isFinite(value.bytesWritten) && value.bytesWritten >= 0
      ? Math.floor(value.bytesWritten)
      : 0;
  const resumeFromSegment =
    Number.isInteger(value.resumeFromSegment) && value.resumeFromSegment >= 0
      ? value.resumeFromSegment
      : -1; // -1 = 세그먼트 병합 미사용 (단일 URL or 미시작)
  const totalBytes =
    Number.isFinite(value.totalBytes) && value.totalBytes >= 0 ? Math.floor(value.totalBytes) : 0;
  return { bytesWritten, resumeFromSegment, totalBytes, updatedAt: Date.now() };
}

function storageKey(key) {
  return `${PREFIX}${key}`;
}

// key → { bytesWritten, resumeFromSegment, totalBytes, updatedAt } (없으면 null)
export async function getDownloadCheckpoint(key) {
  try {
    const stored = await chrome.storage.local.get(storageKey(key));
    const entry = stored?.[storageKey(key)];
    if (!entry || typeof entry !== 'object') return null;
    return sanitize(entry);
  } catch {
    return null;
  }
}

// key에 체크포인트 저장 (머지 정책: resumeFromSegment는 단조 증가만 기록)
export async function setDownloadCheckpoint(key, checkpoint) {
  const clean = sanitize(checkpoint);
  try {
    const prev = (await getDownloadCheckpoint(key)) || sanitize({});
    const merged = {
      bytesWritten: Math.max(prev.bytesWritten, clean.bytesWritten),
      resumeFromSegment: Math.max(prev.resumeFromSegment, clean.resumeFromSegment),
      totalBytes: clean.totalBytes || prev.totalBytes || 0,
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ [storageKey(key)]: merged });
  } catch {
    // 저장은 best-effort — 실패해도 현재 세션 다운로드는 계속 진행
  }
}

export async function clearDownloadCheckpoint(key) {
  try {
    await chrome.storage.local.remove(storageKey(key));
  } catch {
    /* 무시 */
  }
}

// 다운로드 완료/취소 후 호출 — 이어받기 데이터 정리 (프리픽스 충돌 방지를 위해 정확 키만 제거)
export async function clearAllDownloadCheckpoints(key) {
  await clearDownloadCheckpoint(key);
}

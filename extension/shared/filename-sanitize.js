const MAX_FILENAME_LENGTH = 180;
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const TRAILING = /[. ]+$/g;
const RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const FALLBACK_NAME = 'media';

function clip(value, limit) {
  return Array.from(value).slice(0, limit).join('');
}

function cleanName(value) {
  let result = String(value ?? '')
    .replace(INVALID_CHARS, '_')
    .trim()
    .replace(TRAILING, '');
  if (!result || result === '.' || result === '..') return '';
  result = clip(result, MAX_FILENAME_LENGTH).replace(TRAILING, '');
  if (!result || result === '.' || result === '..') return '';
  if (RESERVED_BASENAME.test(result)) result = `_${result}`;
  return clip(result, MAX_FILENAME_LENGTH).replace(TRAILING, '') || '';
}

export function sanitizeFilename(value, fallback = FALLBACK_NAME) {
  return cleanName(value) || cleanName(fallback) || FALLBACK_NAME;
}

export function ensureExtension(filename, ext) {
  const value = String(filename ?? '').trim();
  if (/\.[a-z0-9]{1,8}$/i.test(value)) return value;
  const extClean = String(ext ?? '').replace(/^\.+/, '');
  return extClean ? `${value}.${extClean}` : value;
}

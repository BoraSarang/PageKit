// shared/zip.js — ZIP 패키징 (Store 방식, JSZip 미사용) — BG/패널 공유

const CRC_TABLE = (() => {
  const t = new Uint32Array(256) ;
  for (let n = 0 ; n < 256 ; n++) {
    let c = n ;
    for (let k = 0 ; k < 8 ; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1) ;
    t[n] = c >>> 0 ;
  }
  return t ;
})() ;

export function crc32(data) {
  let c = 0xFFFFFFFF ;
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data) ;
  for (let i = 0 ; i < u8.length ; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8) ;
  return (c ^ 0xFFFFFFFF) >>> 0 ;
}

// [{ name, data (ArrayBuffer|Uint8Array) }] → ZIP Blob (압축 없이 저장)
export function createZip(entries) {
  const enc = new TextEncoder() ;
  const chunks = [] ;
  const central = [] ;
  let offset = 0 ;
  const now = new Date() ;
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1) ;
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate() ;
  for (const e of entries) {
    const name = enc.encode(e.name.replace(/\\/g, '/')) ;
    const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data) ;
    const crc = crc32(data) ;
    const local = new DataView(new ArrayBuffer(30)) ;
    local.setUint32(0, 0x04034B50, true) ;       // PK\x03\x04
    local.setUint16(4, 20, true) ;               // version needed
    local.setUint16(6, 0, true) ;                // flags
    local.setUint16(8, 0, true) ;                // method: store
    local.setUint16(10, dosTime, true) ;
    local.setUint16(12, dosDate, true) ;
    local.setUint32(14, crc, true) ;
    local.setUint32(18, data.length, true) ;     // compressed size = raw
    local.setUint32(22, data.length, true) ;
    local.setUint16(26, name.length, true) ;
    local.setUint16(28, 0, true) ;               // extra len
    chunks.push(local.buffer, name, data) ;
    const cd = new DataView(new ArrayBuffer(46)) ;
    cd.setUint32(0, 0x02014B50, true) ;          // PK\x01\x02
    cd.setUint16(4, 20, true) ;                  // version made by
    cd.setUint16(6, 20, true) ;                  // version needed
    cd.setUint16(8, 0, true) ;
    cd.setUint16(10, 0, true) ;
    cd.setUint16(12, dosTime, true) ;
    cd.setUint16(14, dosDate, true) ;
    cd.setUint32(16, crc, true) ;
    cd.setUint32(20, data.length, true) ;
    cd.setUint32(24, data.length, true) ;
    cd.setUint16(28, name.length, true) ;
    cd.setUint16(30, 0, true) ;                  // extra
    cd.setUint16(32, 0, true) ;                  // comment
    cd.setUint16(34, 0, true) ;                  // disk number
    cd.setUint16(36, 0, true) ;                  // internal attrs
    cd.setUint32(38, 0, true) ;                  // external attrs
    cd.setUint32(42, offset, true) ;             // local header offset
    central.push(cd.buffer, name) ;
    offset += 30 + name.length + data.length ;
  }
  const cdSize = central.reduce((s, c) => s + c.byteLength, 0) ;
  const cdOffset = offset ;
  const eocd = new DataView(new ArrayBuffer(22)) ;
  eocd.setUint32(0, 0x06054B50, true) ;          // PK\x05\x06
  eocd.setUint16(4, 0, true) ;
  eocd.setUint16(6, 0, true) ;
  eocd.setUint16(8, entries.length, true) ;
  eocd.setUint16(10, entries.length, true) ;
  eocd.setUint32(12, cdSize, true) ;
  eocd.setUint32(16, cdOffset, true) ;
  eocd.setUint16(20, 0, true) ;                  // comment len
  return new Blob([...chunks, ...central, eocd.buffer], { type: 'application/zip' }) ;
}
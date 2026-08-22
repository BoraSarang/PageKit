// scripts/strict-check.cjs — vm 기반 엄격 구문 검사기
// node --check는 import/export 파일을 실제 파싱 없이 통과시키는 퀴크가 있어 필수 도구.
// 사용법: node --experimental-vm-modules scripts/strict-check.cjs [대상디렉터리]  (기본: ../extension)
const vm = require('vm');
const fs = require('fs');
const path = require('path');
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') out = out.concat(walk(p)); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const base = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'extension');
let fail = 0;
for (const f of walk(base)) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(base, f);
  let scriptOk = false, moduleOk = false;
  let sErr = '', mErr = '';
  try { new vm.Script(src); scriptOk = true; } catch (e) { sErr = e.message; }
  try { new vm.SourceTextModule(src, { identifier: rel }); moduleOk = true; } catch (e) { mErr = e.message; }
  if (!scriptOk && !moduleOk) {
    fail++;
    console.log(`❌ ${rel}`);
    console.log(`   SCRIPT: ${sErr}`);
    console.log(`   MODULE: ${mErr}`);
  } else {
    console.log(`✅ ${rel} (${scriptOk ? 'script' : 'module'}${moduleOk ? '+module' : ''})`);
  }
}
console.log(fail === 0 ? '\n=== 전체 통과 ===' : `\n=== 실패 ${fail}개 ===`);
process.exit(fail ? 1 : 0);

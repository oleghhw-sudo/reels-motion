#!/usr/bin/env node
// Проверка среды по env.manifest.json. Громкий отказ: печатает ПЕРЕЧЕНЬ всего недостающего и exit 1.
//
//   npm run check                   — scope base+render
//   npm run check -- --scope voice  — плюс то, что нужно для голоса (FISH_API_KEY)
//   npm run check -- --self-test    — позитивный контроль: подсовывает несуществующий бинарь
//                                     и шрифт без кириллицы; ОБЯЗАН упасть (exit 1)

import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const scopeIdx = args.indexOf('--scope');
const manifest = JSON.parse(readFileSync(join(ROOT, 'env.manifest.json'), 'utf8'));
const scopes = new Set(manifest.scopes.default);
if (scopeIdx >= 0 && args[scopeIdx + 1]) scopes.add(args[scopeIdx + 1]);

const missing = [];
const ok = [];
const skipped = [];
const need = (scope) => scope === undefined || scopes.has(scope);

if (selfTest) {
  console.log('SELF-TEST: подменяю бинарь на несуществующий и добавляю шрифт без кириллицы. Ожидаю ПРОВАЛ.\n');
  manifest.binaries.push({ name: 'rm-selftest-nonexistent-binary', args: ['-version'], required_for: 'render', hint: '(self-test)' });
  manifest.fonts.files.push('../../scripts/fixtures/Righteous-Regular.ttf');
}

// 1. Node
const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};
const nodeV = process.versions.node;
if (cmp(nodeV, manifest.runtime.node.min) >= 0) ok.push(`node ${nodeV} ≥ ${manifest.runtime.node.min}`);
else missing.push(`node ${nodeV} < ${manifest.runtime.node.min} — ${manifest.runtime.node.why}`);

// 2. Бинари в PATH
for (const b of manifest.binaries) {
  if (!need(b.required_for)) { skipped.push(`${b.name} (нужен для ${b.required_for})`); continue; }
  const r = spawnSync(b.name, b.args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) missing.push(`бинарь "${b.name}" не найден/не запускается в PATH — ${b.hint}`);
  else ok.push(`${b.name}: ${r.stdout.split('\n')[0].slice(0, 60)}`);
}

// 3. npm-зависимости ровно тех версий, что в package.json
const pkg = JSON.parse(readFileSync(join(ROOT, manifest.npm.source), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
let depOk = 0;
for (const [name, want] of Object.entries(deps)) {
  if (manifest.npm.exact_versions && /^[\^~]/.test(want)) missing.push(`package.json: ${name}@${want} — версия не точная (без ^/~)`);
  const p = join(ROOT, 'node_modules', name, 'package.json');
  if (!existsSync(p)) { missing.push(`npm: ${name} не установлен — ${manifest.npm.hint}`); continue; }
  const have = JSON.parse(readFileSync(p, 'utf8')).version;
  if (have !== want.replace(/^[\^~]/, '')) missing.push(`npm: ${name} установлен ${have}, нужен ${want} — ${manifest.npm.hint}`);
  else depOk++;
}
ok.push(`npm: ${depOk}/${Object.keys(deps).length} зависимостей точных версий`);

// 4. Браузер Remotion
if (need(manifest.remotion_browser.required_for)) {
  const rb = manifest.remotion_browser;
  const custom = process.env[rb.alt_env];
  const downloaded = existsSync(join(ROOT, rb.path)) &&
    spawnSync('find', [join(ROOT, rb.path), '-name', 'chrome-headless-shell', '-type', 'f'], { encoding: 'utf8' }).stdout.trim() !== '';
  if (custom) {
    const r = spawnSync(custom, ['--version'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) missing.push(`${rb.alt_env}=${custom} — не запускается`);
    else ok.push(`браузер из ${rb.alt_env}: ${r.stdout.trim()}`);
  } else if (downloaded) ok.push('Remotion headless browser скачан');
  else missing.push(`Remotion headless browser не скачан — ${rb.hint}`);
  const glv = process.env.REMOTION_GL;
  const allowedGl = manifest.render_env.vars.find((v) => v.name === 'REMOTION_GL').allowed;
  if (glv && !allowedGl.includes(glv)) missing.push(`REMOTION_GL=${glv} — допустимо: ${allowedGl.join(', ')}`);
}

// 5. Шрифты: файл есть, лицензия рядом, глифы ґ є і ї ʼ на месте; реестр fonts.ts покрыт манифестом
let fontkit = null;
try { fontkit = require('fontkit'); } catch { missing.push('npm: fontkit не установлен — нечем проверить глифы (npm install)'); }
const fontsDir = join(ROOT, manifest.fonts.dir);
const glyphs = [...manifest.fonts.required_glyphs];
for (const entry of manifest.fonts.files) {
  // Строка — общий набор глифов; объект {file, required_glyphs, why} — свой набор с обоснованием.
  const rel = typeof entry === 'string' ? entry : entry.file;
  const wantGlyphs = typeof entry === 'string' ? glyphs : [...entry.required_glyphs];
  const file = join(fontsDir, rel);
  if (!existsSync(file)) { missing.push(`шрифт ${rel} отсутствует (${manifest.fonts.source})`); continue; }
  const lic = join(dirname(file), manifest.fonts.license_file);
  const licAlt = file.replace(/\.ttf$/, '-OFL.txt').replace(/-Regular-OFL/, '-OFL');
  if (!existsSync(lic) && !existsSync(licAlt)) missing.push(`шрифт ${rel}: нет файла лицензии ${manifest.fonts.license_file} рядом`);
  if (!fontkit) continue;
  try {
    const f = fontkit.openSync(file);
    const lack = wantGlyphs.filter((ch) => !f.hasGlyphForCodePoint(ch.codePointAt(0)));
    if (lack.length) missing.push(`шрифт ${rel} (${f.familyName}): нет глифов ${lack.join(' ')}`);
    else ok.push(`шрифт ${f.familyName} ${f.subfamilyName}: глифы ${wantGlyphs.join('')} есть${typeof entry === 'string' ? '' : ` (свой набор: ${entry.why})`}`);
  } catch (e) { missing.push(`шрифт ${rel}: не читается (${e.message})`); }
}
const registry = readFileSync(join(ROOT, manifest.fonts.registry), 'utf8');
for (const m of registry.matchAll(/file:\s*'fonts\/([^']+)'/g)) {
  if (!manifest.fonts.files.some((e) => (typeof e === 'string' ? e : e.file) === m[1])) missing.push(`${manifest.fonts.registry} ссылается на fonts/${m[1]}, которого нет в env.manifest.json`);
}

// 6. Переменные .env
const envPath = join(ROOT, manifest.env.file);
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
for (const v of manifest.env.vars) {
  if (!need(v.required_for)) { skipped.push(`${v.name} (нужен для ${v.required_for}; проверка: npm run check -- --scope ${v.required_for})`); continue; }
  const m = envText.match(new RegExp(`^${v.name}=(.+)$`, 'm'));
  if (!m || !m[1].trim()) missing.push(`${manifest.env.file}: нет ${v.name} — ${v.hint}`);
  else ok.push(`${v.name} задан`);
}

// 7. Внешние каталоги данных роликов (BEAUTY_HANDOFF_DIR и т.п.): из окружения процесса или .env.
for (const v of manifest.data_dirs?.vars ?? []) {
  if (!need(v.required_for)) { skipped.push(`${v.name} (нужен для ${v.required_for}; проверка: npm run check -- --scope ${v.required_for})`); continue; }
  const m = envText.match(new RegExp(`^${v.name}=(.+)$`, 'm'));
  const val = process.env[v.name] ?? m?.[1]?.trim();
  if (!val) { missing.push(`${v.name} не задан (ни в окружении, ни в ${manifest.env.file}) — ${v.hint}`); continue; }
  if (v.kind === 'file') {
    // одиночный файл (трек и т.п.): должен существовать и быть файлом, не каталогом
    let isFile = false;
    try { isFile = statSync(val).isFile(); } catch { /* нет */ }
    if (!isFile) missing.push(`${v.name}: файла ${val} нет (или это не файл) — ${v.hint}`);
    else ok.push(`${v.name}: файл на месте`);
    continue;
  }
  const roots = val.split(':').filter(Boolean);
  for (const r of roots) if (!existsSync(r)) missing.push(`${v.name}: каталога ${r} нет`);
  for (const rel of v.must_contain ?? []) {
    if (!roots.some((r) => existsSync(join(r, rel)))) missing.push(`${v.name}: ни в одном из [${roots.join(', ')}] нет ${rel}`);
  }
  ok.push(`${v.name}: ${roots.length} каталог(а), обязательные файлы на месте`);
}

// Итог
for (const s of ok) console.log(`  ✓ ${s}`);
for (const s of skipped) console.log(`  · пропущено: ${s}`);
if (missing.length) {
  console.error(`\nСРЕДА НЕ ГОТОВА — недостаёт (${missing.length}):`);
  for (const s of missing) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`\nOK: среда готова (scopes: ${[...scopes].join(', ')})`);

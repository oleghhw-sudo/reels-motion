#!/usr/bin/env node
// Одобренная озвучка «Юридичний контур АНЦ» (решение Олега 09.11): файлы — вне репо, в репо — только манифест
// videos/yurkontur/voice/approved.json {version, date, path, files[{name, sha256, bytes}]}.
//
//   --approve --version v1 --date 2026-11-09 --dest <каталог версии>
//       копирует текущую озвучку (full.wav, voice/full/* фрагменты и fragments.json, words.json) в <dest> и пишет
//       манифест. Только по действию человека; существующий approved.json не перезаписывается (гейт 5) —
//       новую версию одобряют, переместив старый манифест вручную.
//   (без флагов) — проверка перед рендером: каждый файл версии по sha256, words.json репо == одобренному,
//       затем копия full.wav → public/videos/yurkontur/voice.wav (её же хеш сверяет calculateMetadata композиции).
//       Любое несовпадение — exit 1 с перечнем.
//   --self-test — позитивный контроль: подменённый байт в копии версии обязан уронить проверку.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VOICE = join(ROOT, 'videos/yurkontur/voice');
const MANIFEST = join(VOICE, 'approved.json');
const WORDS = join(VOICE, 'words.json');
const PUB = join(ROOT, 'public/videos/yurkontur/voice.wav');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const expand = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/** Проверка версии по манифесту; возвращает список нарушений (пустой — всё сходится). */
function verify(man, dir) {
  const bad = [];
  if (!existsSync(dir)) return [`нет каталога одобренной озвучки ${dir}`];
  for (const f of man.files) {
    const p = join(dir, f.name);
    if (!existsSync(p)) bad.push(`нет файла ${f.name}`);
    else if (sha256(p) !== f.sha256) bad.push(`${f.name}: sha256 не совпадает с манифестом`);
  }
  const w = man.files.find((f) => f.name === 'words.json');
  if (!w) bad.push('в манифесте нет words.json');
  else if (sha256(WORDS) !== w.sha256) bad.push('videos/yurkontur/voice/words.json в репо отличается от одобренного (ролик размечен не по этой озвучке)');
  if (!man.files.some((f) => f.name === 'full.wav')) bad.push('в манифесте нет full.wav');
  return bad;
}

if (process.argv.includes('--approve')) {
  const version = arg('--version');
  const date = arg('--date');
  const dest = arg('--dest');
  if (!version || !date || !dest) {
    console.error('Использование: voice-approved.mjs --approve --version v1 --date YYYY-MM-DD --dest <каталог>');
    process.exit(1);
  }
  if (existsSync(MANIFEST)) {
    console.error(`${MANIFEST} уже есть — одобренный манифест скрипт не перезаписывает (гейт 5)`);
    process.exit(1);
  }
  const dir = expand(dest);
  if (existsSync(dir)) {
    console.error(`${dir} уже существует — версия не перезаписывается`);
    process.exit(1);
  }
  mkdirSync(join(dir, 'fragments'), { recursive: true });
  const src = [
    ['full.wav', join(VOICE, 'full.wav')],
    ['words.json', WORDS],
    ...readdirSync(join(VOICE, 'full')).sort().map((n) => [`fragments/${n}`, join(VOICE, 'full', n)]),
  ];
  const files = src.map(([name, from]) => {
    copyFileSync(from, join(dir, name));
    return { name, sha256: sha256(join(dir, name)), bytes: statSync(join(dir, name)).size };
  });
  const words = JSON.parse(readFileSync(WORDS, 'utf8'));
  const man = {
    $comment: 'Одобренная озвучка (решение Олега 09.11). Файлы вне репо, по path. Пишет videos/yurkontur/voice-approved.mjs --approve (по действию человека); проверяет он же перед рендером и calculateMetadata композиций (full.wav). Не перезаписывать (гейт 5).',
    version,
    date,
    path: dest,
    voice: words.voice,
    model: words.model,
    durationSec: words.durationSec,
    files,
  };
  writeFileSync(MANIFEST, JSON.stringify(man, null, 1) + '\n');
  console.log(`Одобрено ${version}: ${files.length} файлов → ${dir}\nманифест: ${MANIFEST}`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.error(`нет ${MANIFEST} — озвучка не одобрена`);
  process.exit(1);
}
const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));

if (process.argv.includes('--self-test')) {
  // копия версии во временный каталог, один байт в середине full.wav изменён → проверка обязана найти ровно это
  const tmp = mkdtempSync(join(tmpdir(), 'yur-voice-'));
  for (const f of man.files) {
    mkdirSync(dirname(join(tmp, f.name)), { recursive: true });
    copyFileSync(join(expand(man.path), f.name), join(tmp, f.name));
  }
  const clean = verify(man, tmp);
  const wav = join(tmp, 'full.wav');
  const buf = readFileSync(wav);
  buf[buf.length >> 1] ^= 0xff;
  writeFileSync(wav, buf);
  const bad = verify(man, tmp);
  rmSync(tmp, { recursive: true, force: true });
  const ok = clean.length === 0 && bad.length === 1 && bad[0].startsWith('full.wav');
  console.log(`чистая копия: ${clean.length ? clean.join('; ') : 'OK'}\nподменённый байт: ${bad.join('; ') || 'НЕ НАЙДЕН'}`);
  console.log(ok ? 'self-test: OK (подмена поймана)' : 'self-test: ПРОВАЛ');
  process.exit(ok ? 0 : 1);
}

const dir = expand(man.path);
const bad = verify(man, dir);
if (bad.length) {
  console.error(`Озвучка ${man.version} не сходится с манифестом:\n- ${bad.join('\n- ')}`);
  process.exit(1);
}
mkdirSync(dirname(PUB), { recursive: true });
copyFileSync(join(dir, 'full.wav'), PUB);
console.log(`Озвучка ${man.version} (${man.date}) сверена: ${man.files.length} файлов; ${basename(PUB)} → public/`);

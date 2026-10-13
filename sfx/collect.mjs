#!/usr/bin/env node
// sfx/collect.mjs — сборщик библиотеки звуков анимации (UI-SFX) для reels-motion.
//
// Запуск:  node sfx/collect.mjs            — скачать (если нет), конвертировать, измерить, записать manifest
//          node sfx/collect.mjs --verify   — сверить manifest.json ↔ файлы library (sha256), exit 1 при расхождении
//
// Только встроенные модули Node (>=20) + CLI git / ffmpeg / ffprobe.
// sfx/raw/* — недоверенные данные: из них только читаются файлы, ничего не исполняется.
// Гейт 5: sfx/approved.json создаётся только если отсутствует, никогда не перезаписывается.
// Гейт 6: звук без разрешённой лицензии (CC0 / MIT) не попадает в library.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COLLECTOR_VERSION = '1.0.0';
const SFX_DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(SFX_DIR, 'raw');
const LIB_DIR = path.join(SFX_DIR, 'library');
const MANIFEST = path.join(SFX_DIR, 'manifest.json');
const APPROVED = path.join(SFX_DIR, 'approved.json');

const SR = 48000;
const SILENCE_DB = -50;           // порог обрезки тишины в начале
const TARGET_PEAK_DB = -3;        // нормализация пика
const LUFS_PAD_S = 0.4;           // ebur128 не даёт integrated для <400 мс — добиваем тишиной (она ниже абсолютного гейта −70 и в расчёт не входит)
const ALLOWED_LICENSES = new Set(['CC0', 'MIT']);
const TYPES = ['click', 'toggle', 'pop', 'whoosh', 'keystroke', 'tick', 'notify', 'success', 'error', 'other'];

// Источники закреплены по коммиту: свежий clone даёт те же байты → те же sha256 → approved.json остаётся валидным.
const SOURCES = [
  { id: 'kenney', url: 'https://github.com/Calinou/kenney-interface-sounds.git', commit: '4596a49eaf5a533948d49a47467f606bcdea70ff', license: 'CC0' },
  { id: 'soundkit', url: 'https://github.com/thisuxhq/soundkit.git', commit: '1e1556d7835828a325cf0f4b6cdd68d463164132', license: 'MIT' },
  {
    id: 'remotion', url: 'https://github.com/remotion-dev/remotion.media.git', commit: '2f139eb532a349dd89a393248a018f781416df15',
    license: 'CC0 per sound (generate.ts attribution)',
    // Только полезные; мемные (bruh, vine-boom, windows-xp-error, shutter-old, dialogue) не берём.
    sparse: ['generate.ts', 'whoosh.wav', 'whip.wav', 'ding.wav', 'mouse-click.wav', 'switch.wav', 'page-turn.wav', 'shutter-modern.wav'],
  },
  { id: 'soundcn', url: 'https://github.com/kapishdima/soundcn.git', commit: '7cbfbb3f56e8548b81fb26410bdcea657447d087', license: 'CC0 per sound (registry meta.license); code MIT' },
];
// soundcn: категории вне задачи «мелкие звуки анимации» — речь и музыкальные джинглы. Считаются в отчёте как отброшенные.
const SOUNDCN_EXCLUDED_CATEGORIES = new Set(['voiceover', 'jingles']);

// ---------- утилиты процессов ----------
function run(cmd, args, { input, cwd, encoding } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      const stdout = Buffer.concat(out); const stderr = Buffer.concat(err).toString('utf8');
      if (code !== 0) reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}\n${stderr.slice(-2000)}`));
      else resolve({ stdout: encoding ? stdout.toString(encoding) : stdout, stderr });
    });
    p.stdin.on('error', () => {});
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}
const git = (args, cwd) => run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'advice.detachedHead=false', ...args], { cwd, encoding: 'utf8' });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const exists = (p) => fs.existsSync(p);

async function pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

// ---------- 1. скачивание (идемпотентно) ----------
async function ensureSource(src) {
  const dir = path.join(RAW_DIR, src.id);
  if (!exists(path.join(dir, '.git'))) {
    if (exists(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} существует, но не git-клон — разберитесь вручную`);
    console.log(`↓ ${src.id}: git clone --depth 1 ${src.url}`);
    await git(['clone', '--quiet', '--depth', '1', '--no-checkout', src.url, dir]);
  }
  let head = (await git(['rev-parse', 'HEAD'], dir)).stdout.trim();
  if (head !== src.commit) {
    console.log(`↓ ${src.id}: fetch закреплённого коммита ${src.commit.slice(0, 10)} (HEAD=${head.slice(0, 10)})`);
    await git(['fetch', '--quiet', '--depth', '1', 'origin', src.commit], dir);
    head = src.commit;
  }
  if (src.sparse) {
    const missing = src.sparse.filter((f) => !exists(path.join(dir, f)));
    if (missing.length) await git(['checkout', '--quiet', src.commit, '--', ...missing], dir);
  } else {
    const st = (await git(['status', '--porcelain', '--untracked-files=no'], dir)).stdout.trim();
    const checkedOut = exists(path.join(dir, '.git', 'index'));
    if (!checkedOut || st) await git(['checkout', '--quiet', '--force', '--detach', src.commit], dir);
  }
  return dir;
}

// ---------- 2. адаптеры источников → кандидаты ----------
// Кандидат: { source, name, origName, absPath, license|null, category|null, dropReason? }
const clean = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function kenneyCandidates(dir) {
  const sub = path.join(dir, 'addons', 'kenney_interface_sounds');
  const lic = await fsp.readFile(path.join(sub, 'LICENSE.txt'), 'utf8');
  const license = /Creative Commons Zero, CC0/.test(lic) ? 'CC0' : null;
  return (await fsp.readdir(sub)).filter((f) => f.endsWith('.wav')).sort().map((f) => ({
    source: 'kenney', name: clean(f), origName: f, absPath: path.join(sub, f), license, category: null,
  }));
}

async function soundkitCandidates(dir) {
  const lic = await fsp.readFile(path.join(dir, 'LICENSE'), 'utf8');
  const license = /^MIT License/m.test(lic) ? 'MIT' : null;
  const tier = path.join(dir, 'full-volume-5db');
  const out = [];
  for (const cat of (await fsp.readdir(tier)).sort()) {
    for (const f of (await fsp.readdir(path.join(tier, cat))).filter((x) => x.endsWith('.m4a')).sort()) {
      out.push({ source: 'soundkit', name: clean(f), origName: `${cat}/${f}`, absPath: path.join(tier, cat, f), license, category: cat });
    }
  }
  return out;
}

async function remotionCandidates(dir, src) {
  // generate.ts читается как ТЕКСТ (не исполняется): пары fileName → attribution.
  const ts = await fsp.readFile(path.join(dir, 'generate.ts'), 'utf8');
  const attr = new Map();
  for (const m of ts.matchAll(/fileName:\s*"([^"]+)",\s*attribution:\s*"([^"]*)"/g)) attr.set(m[1], m[2]);
  return src.sparse.filter((f) => f.endsWith('.wav')).map((f) => {
    const a = attr.get(f) || '';
    const license = /License:\s*Creative Commons 0/i.test(a) ? 'CC0' : null;
    return { source: 'remotion', name: clean(f), origName: f, absPath: path.join(dir, f), license, category: null,
      dropReason: license ? undefined : `нет CC0 в атрибуции: «${a || '—'}»` };
  });
}

async function soundcnCandidates(dir) {
  const reg = JSON.parse(await fsp.readFile(path.join(dir, 'registry.json'), 'utf8'));
  const decodedDir = path.join(RAW_DIR, 'soundcn-decoded');
  await fsp.mkdir(decodedDir, { recursive: true });
  const kenneyPack = new Set((await fsp.readdir(path.join(dir, 'assets', 'kenney_interface-sounds')))
    .filter((f) => f.endsWith('.ogg')).map((f) => clean(f)));
  const out = [];
  for (const it of reg.items.filter((i) => i.type === 'registry:block')) {
    const lic = it.meta?.license;
    const cats = it.categories || [];
    const base = { source: 'soundcn', name: clean(it.name), origName: it.name, license: lic === 'CC0' ? 'CC0' : null, category: cats.join(',') || null };
    if (lic !== 'CC0') { out.push({ ...base, dropReason: `лицензия не CC0: «${lic ?? '—'}»` }); continue; }
    if (cats.some((c) => SOUNDCN_EXCLUDED_CATEGORIES.has(c))) { out.push({ ...base, dropReason: `вне задачи (категория ${cats.join(',')})` }); continue; }
    const target = path.join(decodedDir, `${base.name}.mp3`);
    if (!exists(target)) {
      const item = JSON.parse(await fsp.readFile(path.join(dir, 'public', 'r', `${it.name}.json`), 'utf8'));
      const m = (item.files?.[0]?.content || '').match(/dataUri:\s*"data:audio\/mpeg;base64,([A-Za-z0-9+/=]+)"/);
      if (!m) { out.push({ ...base, dropReason: 'не найден dataUri audio/mpeg' }); continue; }
      await fsp.writeFile(target, Buffer.from(m[1], 'base64'));
    }
    out.push({ ...base, absPath: target, kenneyPackDup: kenneyPack.has(base.name) });
  }
  return out;
}

// ---------- 3. классификация (консервативная: только явные слова) ----------
// Порядок важен: первое совпадение побеждает. Неизвестное → other.
const NAME_RULES = [
  [/^(keystroke|keyboard|typewriter|typing|key)$/, 'keystroke'],
  [/^(whoosh|woosh|swoosh|swish|swoosh|whip)$/, 'whoosh'],
  [/^(error)$/, 'error'],
  [/^(success|complete|confirmation)$/, 'success'],
  [/^(notification|notify|alert)$/, 'notify'],
  [/^(switch|toggle)$/, 'toggle'],
  [/^(tick)$/, 'tick'],
  [/^(pop)$/, 'pop'],
  [/^(click|button)$/, 'click'],
];
const CATEGORY_RULES = {
  // soundkit (папки)
  'complete-and-success': 'success', 'errors-and-cancel': 'error', 'notifications-and-alerts': 'notify', 'buttons-and-navigation': 'click',
  // soundcn (categories)
  click: 'click', switch: 'toggle', toggle: 'toggle', tick: 'tick', error: 'error', notification: 'notify', confirmation: 'success',
};
function classify(name, category) {
  const tokens = name.split('-');
  for (const [re, type] of NAME_RULES) if (tokens.some((t) => re.test(t))) return { type, typeConfidence: 'name' };
  for (const c of (category || '').split(',')) if (CATEGORY_RULES[c]) return { type: CATEGORY_RULES[c], typeConfidence: 'category' };
  return { type: 'other', typeConfidence: 'none' };
}

// ---------- 4. аудио: декод, обрезка, нормализация, измерения ----------
async function probeChannels(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const ch = parseInt(stdout.trim(), 10);
  if (!(ch >= 1)) throw new Error(`нет аудиопотока: ${file}`);
  return Math.min(ch, 2); // моно/стерео как в источнике; >2 каналов сводим в стерео
}

async function decodeF32(file, ch) {
  const { stdout } = await run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-vn',
    '-af', `aresample=${SR}:resampler=swr:filter_size=64:phase_shift=10:cutoff=0.97`, '-ac', String(ch), '-f', 'f32le', '-acodec', 'pcm_f32le', '-']);
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4).slice();
}

// Чтение нашего WAV (pcm_s24le, -bitexact): возвращает {ch, sr, data(Buffer PCM), samples Float32 interleaved}
function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('не RIFF/WAVE');
  let off = 12; let fmt = null; let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4); const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(off + 10), sr: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('нет fmt/data');
  return { ...fmt, data };
}
function s24ToFloat(data) {
  const n = Math.floor(data.length / 3); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readIntLE(i * 3, 3) / 8388608;
  return out;
}

const dbfs = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

function leadIndex(pcm, ch, thr) {
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) >= thr) return Math.floor(i / ch);
  return -1;
}
function monoMix(pcm, ch) {
  if (ch === 1) return pcm;
  const n = pcm.length / ch; const m = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += pcm[i * ch + c]; m[i] = s / ch; }
  return m;
}
// Транзиент: момент максимума RMS-огибающей (окно 3 мс, шаг 0.5 мс), в мс от начала обрезанного файла.
function transientMs(mono) {
  const win = Math.round(SR * 0.003); const hop = Math.round(SR * 0.0005);
  let best = -1; let bestAt = 0;
  for (let s = 0; s + 1 <= mono.length; s += hop) {
    let e = 0; const end = Math.min(mono.length, s + win);
    for (let i = s; i < end; i++) e += mono[i] * mono[i];
    if (e > best) { best = e; bestAt = s + (end - s) / 2; }
  }
  return round((bestAt / SR) * 1000, 1);
}

async function processOne(c, tmpLib) {
  const ch = await probeChannels(c.absPath);
  const pcm = await decodeF32(c.absPath, ch);
  const lead = leadIndex(pcm, ch, 10 ** (SILENCE_DB / 20));
  if (lead < 0) return { ...c, dropReason: 'тишина (ниже −50 dB целиком)' };
  let peak = 0; for (let i = lead * ch; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const gainDb = TARGET_PEAK_DB - dbfs(peak);
  const { type, typeConfidence } = classify(c.name, c.category);
  const id = `${c.source}__${c.name}`;
  const rel = `library/${type}/${id}.wav`;
  const outTmp = path.join(tmpLib, type, `${id}.wav`);
  await fsp.mkdir(path.dirname(outTmp), { recursive: true });
  // ffmpeg: обрезка начала + нормализация пика; параллельно ebur128 по ветке с добивкой тишиной до 400 мс.
  const fc = `[0:a]atrim=start_sample=${lead},asetpts=PTS-STARTPTS,volume=${gainDb.toFixed(4)}dB,asplit=2[o][m];` +
             `[m]apad=whole_dur=${LUFS_PAD_S},ebur128=framelog=quiet[x]`;
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-y',
    '-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', 'pipe:0',
    '-filter_complex', fc,
    '-map', '[o]', '-c:a', 'pcm_s24le', '-bitexact', '-map_metadata', '-1', '-fflags', '+bitexact', outTmp,
    '-map', '[x]', '-f', 'null', '-'], { input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength) });
  const lm = [...stderr.matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)].pop();
  const lufs = lm && lm[1] !== '-inf' ? Number(lm[1]) : null;
  // Измеряем уже записанный файл (а не промежуточные данные).
  const wav = parseWav(await fsp.readFile(outTmp));
  if (wav.sr !== SR || wav.bits !== 24 || wav.ch !== ch) throw new Error(`неожиданный формат вывода ${outTmp}`);
  const out = s24ToFloat(wav.data);
  let outPeak = 0; for (const v of out) outPeak = Math.max(outPeak, Math.abs(v));
  const mono = monoMix(out, ch);
  return {
    ...c, id, type, typeConfidence, file: rel, outTmp,
    sha256: sha256(wav.data),
    durationMs: round((mono.length / SR) * 1000, 1),
    peakDb: round(dbfs(outPeak), 2),
    lufs: lufs === null ? null : round(lufs, 1),
    transientMs: transientMs(mono),
    trimmedLeadMs: round((lead / SR) * 1000, 2),
    channels: ch,
  };
}

// ---------- 5. дедупликация ----------
// (а) точная: одинаковый sha256 PCM после конвертации (ловит байт-в-байт одинаковое аудио внутри и между источниками);
// (б) по происхождению: soundcn перекодировал Kenney Interface Sounds в mp3 — sha256 после этого не совпадает
//     никогда, а корреляция волны на mp3 ненадёжна (проверено: у одинаковых пар 0.7–1.0, у разных бывает 0.99 по огибающей).
//     Поэтому soundcn-запись, имя которой есть в его же assets/kenney_interface-sounds/*.ogg, считается дублем
//     kenney__<имя> (lossless-оригинал из Calinou/kenney-interface-sounds), если такой есть в библиотеке.
const PRIORITY = { kenney: 0, remotion: 1, soundkit: 2, soundcn: 3 };
function dedup(items) {
  items.sort((x, y) => PRIORITY[x.source] - PRIORITY[y.source] || x.id.localeCompare(y.id));
  const kept = []; const bySha = new Map(); const byId = new Map(); const exact = []; const near = [];
  for (const it of items) {
    if (bySha.has(it.sha256)) { exact.push({ id: it.id, dupOf: bySha.get(it.sha256).id }); continue; }
    const twin = it.kenneyPackDup ? byId.get(`kenney__${it.name}`) : null;
    if (twin) { near.push({ id: it.id, dupOf: twin.id }); continue; }
    bySha.set(it.sha256, it); byId.set(it.id, it); kept.push(it);
  }
  return { kept, exact, near };
}

// ---------- 6. --verify ----------
async function verify() {
  if (!exists(MANIFEST)) { console.error('✗ нет sfx/manifest.json — запустите node sfx/collect.mjs'); process.exit(1); }
  const man = JSON.parse(await fsp.readFile(MANIFEST, 'utf8'));
  const problems = [];
  const listed = new Set();
  for (const s of man.sounds) {
    const abs = path.join(SFX_DIR, s.file); listed.add(path.resolve(abs));
    if (!ALLOWED_LICENSES.has(s.license)) problems.push(`${s.id}: недопустимая лицензия «${s.license}»`);
    if (!exists(abs)) { problems.push(`${s.id}: файл отсутствует (${s.file})`); continue; }
    try {
      const h = sha256(parseWav(await fsp.readFile(abs)).data);
      if (h !== s.sha256) problems.push(`${s.id}: sha256 не совпадает (манифест ${s.sha256.slice(0, 12)}…, файл ${h.slice(0, 12)}…)`);
    } catch (e) { problems.push(`${s.id}: не читается как WAV (${e.message})`); }
  }
  if (exists(LIB_DIR)) for (const t of await fsp.readdir(LIB_DIR)) {
    for (const f of await fsp.readdir(path.join(LIB_DIR, t))) {
      const abs = path.resolve(LIB_DIR, t, f);
      if (!listed.has(abs)) problems.push(`лишний файл без записи в манифесте: library/${t}/${f}`);
    }
  }
  if (problems.length) {
    console.error(`✗ verify: ${problems.length} расхождений из ${man.sounds.length} звуков`);
    for (const p of problems.slice(0, 50)) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`✓ verify: ${man.sounds.length} звуков, manifest ↔ library совпадают (collector ${man.collectorVersion}, ${man.generatedAt})`);
}

// ---------- 7. main ----------
async function main() {
  if (process.argv.includes('--verify')) return verify();
  await fsp.mkdir(RAW_DIR, { recursive: true });

  const dirs = {};
  for (const s of SOURCES) dirs[s.id] = await ensureSource(s);
  const candidates = [
    ...(await kenneyCandidates(dirs.kenney)),
    ...(await soundkitCandidates(dirs.soundkit)),
    ...(await remotionCandidates(dirs.remotion, SOURCES.find((s) => s.id === 'remotion'))),
    ...(await soundcnCandidates(dirs.soundcn)),
  ];

  const dropped = [];
  const todo = [];
  for (const c of candidates) {
    if (c.dropReason) dropped.push(c);
    else if (!c.license || !ALLOWED_LICENSES.has(c.license)) dropped.push({ ...c, dropReason: `нет допустимой лицензии (${c.license ?? '—'})` });
    else todo.push(c);
  }

  // Собираем в library.tmp и атомарно подменяем — прерванный прогон не оставит полу-библиотеку.
  const tmpLib = LIB_DIR + '.tmp';
  await fsp.rm(tmpLib, { recursive: true, force: true });
  await fsp.mkdir(tmpLib, { recursive: true });
  let done = 0;
  const processed = await pool(todo, 4, async (c) => {
    const r = await processOne(c, tmpLib);
    if (++done % 100 === 0) console.log(`  … обработано ${done}/${todo.length}`);
    return r;
  });
  const ok = [];
  for (const r of processed) (r.dropReason ? dropped : ok).push(r);

  // Коллизии id (разные исходные имена → одно очищенное имя) — громкая ошибка, а не тихая перезапись.
  const ids = new Map();
  for (const r of ok) { if (ids.has(r.id)) throw new Error(`коллизия id ${r.id}: ${ids.get(r.id)} и ${r.origName}`); ids.set(r.id, r.origName); }

  const { kept, exact, near } = dedup(ok);
  const keptSet = new Set(kept.map((k) => k.outTmp));
  for (const r of ok) if (!keptSet.has(r.outTmp)) await fsp.rm(r.outTmp);
  await fsp.rm(LIB_DIR, { recursive: true, force: true });
  await fsp.rename(tmpLib, LIB_DIR);

  kept.sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.id.localeCompare(b.id));
  const manifest = {
    generatedAt: new Date().toISOString(),
    collectorVersion: COLLECTOR_VERSION,
    sources: SOURCES.map(({ id, url, commit, license }) => ({ id, url: url.replace(/\.git$/, ''), commit, license })),
    sounds: kept.map((s) => ({
      id: s.id, type: s.type, typeConfidence: s.typeConfidence, source: s.source, license: s.license, file: s.file,
      sha256: s.sha256, durationMs: s.durationMs, peakDb: s.peakDb, lufs: s.lufs, transientMs: s.transientMs,
      trimmedLeadMs: s.trimmedLeadMs, origName: s.origName,
    })),
  };
  await fsp.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  // Гейт 5: approved.json — только создать шаблон, если его нет. Никогда не перезаписывать.
  if (!exists(APPROVED)) {
    await fsp.writeFile(APPROVED, JSON.stringify({ approved: {}, note: 'заполняет прослушка по действию человека' }, null, 2) + '\n', { flag: 'wx' });
    console.log('+ создан шаблон sfx/approved.json');
  } else console.log('= sfx/approved.json существует — не трогаю');

  // ---------- сводка ----------
  const tbl = (rows) => rows.map((r) => '  ' + r.join('\t')).join('\n');
  const srcIds = SOURCES.map((s) => s.id);
  console.log(`\nСводка (collector ${COLLECTOR_VERSION}): в library ${kept.length} звуков`);
  console.log('Тип \\ источник:\t' + srcIds.join('\t') + '\tвсего\t(name/category/none)');
  console.log(tbl(TYPES.map((t) => {
    const of = kept.filter((k) => k.type === t);
    const conf = ['name', 'category', 'none'].map((c) => of.filter((k) => k.typeConfidence === c).length).join('/');
    return [t.padEnd(10), ...srcIds.map((s) => of.filter((k) => k.source === s).length), of.length, conf];
  })));
  const byLic = {}; for (const k of kept) byLic[k.license] = (byLic[k.license] || 0) + 1;
  console.log('Лицензии: ' + Object.entries(byLic).map(([k, v]) => `${k}=${v}`).join(', '));
  console.log(`Дедупликация: точных дублей (sha256 PCM) ${exact.length}, дублей по происхождению (soundcn ← Kenney Interface) ${near.length}`);
  for (const e of exact) console.log(`  = ${e.id} ≡ ${e.dupOf}`);
    const dropGroups = {};
  for (const d of dropped) { const key = `${d.source}: ${d.dropReason.replace(/«.*»/, '«…»')}`; dropGroups[key] = (dropGroups[key] || 0) + 1; }
  console.log(`Отброшено: ${dropped.length}`);
  for (const [k, v] of Object.entries(dropGroups)) console.log(`  ${v}\t${k}`);
  for (const d of dropped.filter((x) => x.source === 'remotion')) console.log(`  remotion/${d.origName}: ${d.dropReason}`);
}

main().catch((e) => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });

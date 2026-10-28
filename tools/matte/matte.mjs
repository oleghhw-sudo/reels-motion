#!/usr/bin/env node
// tools/matte/matte.mjs — маска человека и лицо по кадрам для живого видео 9:16 (задача 025).
//
//   npm run matte -- <video> --id <id> [--engine vision|rvm] [--from S --to S]
//       [--work 360x640] [--thr 0.35,0.65 | --no-thr] [--dilate 31 | --no-grow] [--blend 0.3] [--blur 1.4]
//       [--variant resnet50|mobilenetv3] [--downsample 0.25] [--keep-work] [--no-link] [--prores-ks] [--none-after N]
//
// Выход — MATTE_DIR/<id>/ (env.manifest.json → data_dirs, большие файлы, не в git):
//   person.mov  — вырезка человека с альфой (ProRes 4444, 30 fps, 1080×1920) → <OffthreadVideo transparent> поверх фона
//   matte.mp4   — маска в оттенках серого (H.264 crf 10, yuv420p, 30 fps) — контур, осколки, проверка
//   face.json   — {fps, frames: [{t, cx, cy, w, source}]} в координатах 1080×1920
//   matte.json  — {engine, engineVersion, params, source:{file, sha256, from, to}, durationSec, renderSecPerSec, outputs sha256}
// Плюс ссылка public/matte/<id> → MATTE_DIR/<id> (gitignore), чтобы Remotion видел файлы через staticFile (src/matte).
//
// Движки: vision — out/bin/vision-matte (tools/matte/vision-matte.swift, компилируется здесь при необходимости);
//         rvm — tools/matte/rvm-matte.py в venv внешнего RVM_DIR (GPL, вне репо) + лицо от vision-matte --no-mask.
// Сглаживание во времени (EFFECTS_PANTRY §J) — одно для обоих движков: vision-matte smooth. Для rvm порог и рост
// по умолчанию выключены (своя память между кадрами) — решение калибровки 025.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, lstatSync, unlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const die = (m) => { console.error(`matte: ${m}`); process.exit(1); };
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const video = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || ['--keep-work', '--no-link', '--no-thr', '--no-grow'].includes(args[i - 1])));
const id = opt('--id');
if (!video || !id) die('использование: npm run matte -- <video> --id <id> [--engine vision|rvm] [--from S --to S]');
if (!/^[\w.-]+$/.test(id)) die(`id «${id}»: только буквы, цифры, точка, дефис, подчёркивание`);
if (!existsSync(video)) die(`видео ${video} не найдено`);
const engine = opt('--engine', 'vision');
if (!['vision', 'rvm'].includes(engine)) die(`--engine ${engine}: vision | rvm`);
const from = Number(opt('--from', '0'));
const to = opt('--to') !== undefined ? Number(opt('--to')) : undefined;
const work = opt('--work', '360x640');
const params = {
  work,
  thr: flag('--no-thr') ? 'off' : opt('--thr', engine === 'rvm' ? 'off' : '0.35,0.65'),
  grow: flag('--no-grow') ? 'off' : opt('--dilate', engine === 'rvm' ? 'off' : '31'),
  blend: Number(opt('--blend', '0.3')),
  blur: Number(opt('--blur', '1.4')),
  ...(engine === 'rvm' ? { variant: opt('--variant', 'resnet50'), downsample: Number(opt('--downsample', '0.25')) } : { quality: 'accurate' }),
};

// --- среда (гейт 2: без дефолт-путей)
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1');
const MATTE_DIR = fromEnv('MATTE_DIR');
if (!MATTE_DIR) die('MATTE_DIR не задан (окружение или .env) — см. env.manifest.json → data_dirs; проверка: npm run check -- --scope matte');
const RVM_DIR = engine === 'rvm' ? fromEnv('RVM_DIR') : undefined;
if (engine === 'rvm' && !RVM_DIR) die('RVM_DIR не задан (окружение или .env) — см. env.manifest.json; проверка: npm run check -- --scope matte-rvm');
if (engine === 'rvm') for (const rel of ['model/model.py', '.venv/bin/python', `rvm_${params.variant}.pth`]) if (!existsSync(join(RVM_DIR, rel))) die(`RVM_DIR=${RVM_DIR}: нет ${rel}`);

const run = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) die(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) die(`${cmd} ${a.slice(0, 3).join(' ')}… завершился с кодом ${r.status}\n${(r.stderr || '').slice(-2000)}`);
  return r;
};
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// --- бинарь vision-matte (компиляция при отсутствии или устаревании)
const SWIFT_SRC = join(ROOT, 'tools', 'matte', 'vision-matte.swift');
const BIN = join(ROOT, 'out', 'bin', 'vision-matte');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SWIFT_SRC).mtimeMs) {
  mkdirSync(dirname(BIN), { recursive: true });
  console.log('· swiftc → out/bin/vision-matte');
  const r = spawnSync('swiftc', ['-O', '-o', BIN, SWIFT_SRC], { encoding: 'utf8' });
  if (r.status !== 0) die(`swiftc не собрал vision-matte (нужны Xcode Command Line Tools: xcode-select --install)\n${r.stderr.slice(-3000)}`);
}

// --- источник
const probe = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,duration', '-of', 'json', video]);
const st = JSON.parse(probe.stdout).streams[0];
const [fn, fd] = st.avg_frame_rate.split('/').map(Number);
const fps = Math.round((fn / fd) * 1000) / 1000;
const srcDur = Number(st.duration);
const dur = (to ?? srcDur) - from;
if (!(dur > 0)) die(`отрезок --from ${from} --to ${to ?? srcDur}: длина ${dur} с`);

const outDir = join(MATTE_DIR, id);
const workDir = join(outDir, '_work');
mkdirSync(workDir, { recursive: true });
console.log(`matte: ${basename(video)} ${from}–${to ?? srcDur.toFixed(2)} с @${fps} fps → ${outDir} [${engine}]`);
const t0 = Date.now();

// 1. сегментация (маска + лицо) или только лицо
const segArgs = ['segment', '--in', video, '--out', workDir, '--from', String(from), '--fps', String(fps), '--work', work];
if (to !== undefined) segArgs.push('--to', String(to));
if (engine === 'rvm') segArgs.push('--no-mask');
const tSeg = Date.now();
const seg = run(BIN, segArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
process.stderr.write(seg.stderr.split('\n').filter((l) => !l.startsWith('  кадр')).join('\n'));
const faces = JSON.parse(readFileSync(join(workDir, 'faces.raw.json'), 'utf8'));
const { crop } = faces;
let engineVersion = { macOS: faces.macOS, visionRevision: faces.visionRevision, faceRevision: faces.faceRevision, maskNative: faces.maskNative };
let segSec = (Date.now() - tSeg) / 1000;
if (engine === 'rvm') {
  const tR = Date.now();
  const py = join(RVM_DIR, '.venv', 'bin', 'python');
  const rvmArgs = [join(ROOT, 'tools', 'matte', 'rvm-matte.py'), '--rvm-dir', RVM_DIR, '--in', video, '--out', workDir, '--from', String(from), '--fps', String(fps),
    '--crop', `${crop.x},${crop.y},${crop.w},${crop.h}`, '--work', work, '--variant', params.variant, '--downsample', String(params.downsample)];
  if (to !== undefined) rvmArgs.push('--to', String(to));
  const r = run(py, rvmArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  process.stderr.write(r.stderr.split('\n').filter((l) => !l.startsWith('  кадр')).join('\n') + '\n');
  const info = JSON.parse(readFileSync(join(workDir, 'info.json'), 'utf8'));
  if (info.frames !== faces.frames) console.warn(`  ⚠ кадров: RVM ${info.frames}, Vision(лицо) ${faces.frames} — беру по RVM, лицо по индексу`);
  engineVersion = { rvmCommit: info.rvmCommit, weights: info.weights, device: info.device, torch: info.torch, face: `vision rev ${faces.faceRevision} / macOS ${faces.macOS}` };
  if (info.device !== 'mps') console.warn('  ⚠ RVM работал на cpu');
  segSec = (Date.now() - tR) / 1000 + segSec;
}

// 2. сглаживание → matte.mp4 (30 fps)
const mattePath = join(outDir, 'matte.mp4');
const facePath = join(outDir, 'face.json');
const smoothArgs = ['smooth', '--raw', join(workDir, 'raw.y8'), '--faces', join(workDir, 'faces.raw.json'), '--face-out', facePath, '--work', work, '--out', '1080x1920', '--blend', String(params.blend), '--blur', String(params.blur)];
if (params.thr === 'off') smoothArgs.push('--no-thr'); else smoothArgs.push('--thr', params.thr);
if (params.grow === 'off') smoothArgs.push('--no-grow'); else smoothArgs.push('--dilate', params.grow);
if (opt('--none-after')) smoothArgs.push('--none-after', opt('--none-after')); // контроль гейта 4 (лицо не висит без человека)
const tSm = Date.now();
await new Promise((res) => {
  const sm = spawn(BIN, smoothArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', '1080x1920', '-r', String(fps), '-i', '-', '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mattePath], { stdio: ['pipe', 'inherit', 'inherit'] });
  sm.stdout.pipe(ff.stdin);
  let err = '';
  sm.stderr.on('data', (d) => { err += d; });
  let smCode = null;
  sm.on('close', (c) => { smCode = c; });
  ff.on('close', (c) => {
    process.stderr.write(err.split('\n').filter((l) => !l.startsWith('  кадр')).join('\n'));
    if (smCode !== 0 || c !== 0) die(`smooth/ffmpeg: коды ${smCode}/${c}`);
    res();
  });
});
const smoothSec = (Date.now() - tSm) / 1000;

// 3. person.mov — ProRes 4444 с альфой из matte.mp4
const personPath = join(outDir, 'person.mov');
const tP = Date.now();
// ProRes 4444 с альфой: аппаратный prores_videotoolbox (≈4× быстрее prores_ks на M-чипах), при отказе — prores_ks
const proresArgs = (enc) => {
  const a = ['-v', 'error', '-y'];
  if (from) a.push('-ss', String(from));
  a.push('-t', String(dur), '-i', video, '-i', mattePath, '-filter_complex',
    `[0:v]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=1080:1920,fps=30,format=rgba[v];[1:v]format=gray[m];[v][m]alphamerge${enc === 'prores_ks' ? ',format=yuva444p10le' : ''}[o]`,
    '-map', '[o]', '-an', '-c:v', enc, '-profile:v', '4444', ...(enc === 'prores_ks' ? ['-pix_fmt', 'yuva444p10le', '-vendor', 'apl0'] : ['-pix_fmt', 'bgra', '-alpha_quality', '1']), '-r', '30', '-shortest', personPath);
  return a;
};
let proresEncoder = flag('--prores-ks') ? 'prores_ks' : 'prores_videotoolbox';
{
  const r = spawnSync('ffmpeg', proresArgs(proresEncoder), { encoding: 'utf8' });
  if (r.status !== 0 && proresEncoder === 'prores_videotoolbox') { console.warn(`  ⚠ prores_videotoolbox не сработал (${(r.stderr || '').trim().slice(-200)}), кодирую prores_ks`); proresEncoder = 'prores_ks'; run('ffmpeg', proresArgs(proresEncoder)); }
  else if (r.status !== 0) die(`ffmpeg prores: ${r.stderr}`);
}
const personSec = (Date.now() - tP) / 1000;

// 4. самопроверка без правды (правило переключения на запасной движок, калибровка 025 — гипотеза):
//    по matte.mp4 в 270×480: flickerFramePermille — средняя |m_t − m_{t−1}| по всему кадру (‰ от полной), areaJumpMax —
//    максимальный скачок площади маски между соседними кадрами (доля кадра). Порог: flickerFramePermille > 25 или
//    areaJumpMax > 0.10 → ПРЕДУПРЕЖДЕНИЕ «проверь лист, перегнать --engine rvm». Автоматически не перегоняем.
//    Склейка в отрезке тоже даёт скачок — это нормально. (Метрика по полосе края против правды — flickerEdge в calibrate.mjs.)
const selfCheck = (() => {
  const TW = 270, TH = 480;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mattePath, '-vf', `scale=${TW}:${TH}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) return null;
  const buf = r.stdout, n = Math.floor(buf.length / (TW * TH));
  let diffSum = 0, diffMax = 0, diffMaxAt = 0, areaJumpMax = 0, areaJumpAt = 0, prevArea = 0;
  for (let i = 0; i < n; i++) {
    const o = i * TW * TH; let area = 0, d = 0;
    for (let p = 0; p < TW * TH; p++) { const v = buf[o + p]; if (v > 127) area++; if (i) d += Math.abs(v - buf[o - TW * TH + p]); }
    if (i) { const dm = d / (TW * TH * 255); diffSum += dm; if (dm > diffMax) { diffMax = dm; diffMaxAt = i; } const j = Math.abs(area - prevArea) / (TW * TH); if (j > areaJumpMax) { areaJumpMax = j; areaJumpAt = i; } }
    prevArea = area;
  }
  const diffMean = n > 1 ? diffSum / (n - 1) : 0;
  const warn = [];
  if (diffMean > 0.025) warn.push(`flickerFramePermille ${(diffMean * 1000).toFixed(1)} > 25`);
  if (areaJumpMax > 0.10) warn.push(`areaJumpMax ${areaJumpMax.toFixed(3)} (кадр ${areaJumpAt}) > 0.10`);
  return { flickerFramePermille: Math.round(diffMean * 10000) / 10, flickerFrameMaxPermille: Math.round(diffMax * 10000) / 10, flickerFrameMaxAt: diffMaxAt, areaJumpMax: Math.round(areaJumpMax * 1000) / 1000, areaJumpMaxAt: areaJumpAt, thresholds: { flickerFramePermille: 25, areaJumpMax: 0.1 }, warnings: warn };
})();
if (selfCheck?.warnings.length) console.warn(`  ⚠ самопроверка: ${selfCheck.warnings.join('; ')} — проверь лист (npm run matte:sheet -- --id ${id})${engine === 'vision' ? ', возможно перегнать --engine rvm' : ''}`);

// 5. манифест
const nb = (f) => Number(JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'json', f]).stdout).streams[0].nb_read_packets);
const totalSec = (Date.now() - t0) / 1000;
const manifest = {
  id, engine, engineVersion, params,
  source: { file: resolve(video), sha256: sha256(video), from, to: to ?? srcDur, fps, crop, framesRead: faces.frames },
  durationSec: Math.round(dur * 1000) / 1000,
  renderSecPerSec: Math.round((totalSec / dur) * 100) / 100,
  timing: { segmentSec: Math.round(segSec * 10) / 10, smoothSec: Math.round(smoothSec * 10) / 10, personSec: Math.round(personSec * 10) / 10, totalSec: Math.round(totalSec * 10) / 10 },
  outputs: {
    'matte.mp4': { sha256: sha256(mattePath), frames: nb(mattePath), bytes: statSync(mattePath).size },
    'person.mov': { sha256: sha256(personPath), frames: nb(personPath), bytes: statSync(personPath).size, encoder: proresEncoder },
    'face.json': { sha256: sha256(facePath) },
  },
  selfCheck,
  generatedAt: new Date().toISOString(),
  script: 'tools/matte/matte.mjs 1.1.0',
};
writeFileSync(join(outDir, 'matte.json'), JSON.stringify(manifest, null, 2) + '\n');
if (!flag('--keep-work')) rmSync(workDir, { recursive: true, force: true });

// 6. ссылка для Remotion: public/matte/<id> → MATTE_DIR/<id>
if (!flag('--no-link')) {
  const pub = join(ROOT, 'public', 'matte');
  mkdirSync(pub, { recursive: true });
  const link = join(pub, id);
  try { if (lstatSync(link).isSymbolicLink()) unlinkSync(link); } catch { /* нет */ }
  if (!existsSync(link)) symlinkSync(outDir, link);
}
const face = JSON.parse(readFileSync(facePath, 'utf8'));
const srcCounts = {};
for (const f of face.frames) srcCounts[f.source] = (srcCounts[f.source] ?? 0) + 1;
console.log(`✓ ${id}: ${manifest.outputs['matte.mp4'].frames} кадров matte.mp4, ${manifest.outputs['person.mov'].frames} кадров person.mov (${(manifest.outputs['person.mov'].bytes / 1e6).toFixed(0)} МБ); лицо ${JSON.stringify(srcCounts)}; ${totalSec.toFixed(1)} с = ${manifest.renderSecPerSec} с/с видео (segment ${manifest.timing.segmentSec}, smooth ${manifest.timing.smoothSec}, prores ${manifest.timing.personSec})`);

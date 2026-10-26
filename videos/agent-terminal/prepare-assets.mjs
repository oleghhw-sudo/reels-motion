#!/usr/bin/env node
// Ассеты ролика «Термінал помічника кресляра» (задача 020) из пакета ANC_VIDEO_PACK_DIR (env.manifest.json → data_dirs).
//   npm run agent:prepare
// Пакет ТОЛЬКО читается: копии json → src/videos/agent-terminal/data/, кадры шагов → public/videos/agent-terminal/frames/OXX/,
// миниатюры очереди (из 01_input.png) → public/videos/agent-terminal/thumbs/OXX.png, фон 1920×1080 (сетка + зерно, один раз) → bg.png.
// Манифест videos/agent-terminal/assets.manifest.json: sha256 источника и копии по каждому файлу.
// Дефолта пути нет (гейт 2): ANC_VIDEO_PACK_DIR из окружения процесса или .env.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_VERSION = '1.0.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PUBLIC = join(ROOT, 'public', 'videos', 'agent-terminal');
const DATA = join(ROOT, 'src', 'videos', 'agent-terminal', 'data');
const die = (m) => { console.error(`\nОТКАЗ prepare-assets (agent-terminal): ${m}\n`); process.exit(1); };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) die(`${cmd} ${args.slice(0, 10).join(' ')}… → exit ${r.status}\n${(r.stderr || '').slice(-1500)}`);
  return r.stdout;
};
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim();

// ---------------------------------------------------------------- источник
const DIR = fromEnv('ANC_VIDEO_PACK_DIR');
if (!DIR) die('ANC_VIDEO_PACK_DIR не задан (окружение или .env). Пример: ANC_VIDEO_PACK_DIR="/Users/…/video_pack" npm run agent:prepare');
const manifestEnv = JSON.parse(readFileSync(join(ROOT, 'env.manifest.json'), 'utf8'));
const spec = manifestEnv.data_dirs.vars.find((v) => v.name === 'ANC_VIDEO_PACK_DIR');
if (!spec) die('env.manifest.json: нет ANC_VIDEO_PACK_DIR в data_dirs');
for (const rel of spec.must_contain) if (!existsSync(join(DIR, rel))) die(`ANC_VIDEO_PACK_DIR=${DIR}: нет ${rel}`);

const TOP_JSON = ['results.json', 'scale.json', 'real_examples.json', 'stats.json', 'truth.json'];
const pages = readdirSync(join(DIR, 'frames')).filter((n) => /^O\d{2}$/.test(n)).sort();
if (pages.length === 0) die(`в ${join(DIR, 'frames')} нет папок OXX`);
const results = JSON.parse(readFileSync(join(DIR, 'results.json'), 'utf8'));
for (const r of results) if (!pages.includes(r.id)) die(`results.json: страница ${r.id} без папки frames/${r.id}`);

// ---------------------------------------------------------------- вывод (всё воспроизводимо: чистим и собираем заново)
rmSync(PUBLIC, { recursive: true, force: true });
rmSync(DATA, { recursive: true, force: true });
mkdirSync(join(PUBLIC, 'thumbs'), { recursive: true });
mkdirSync(DATA, { recursive: true });
const files = [];
const copy = (src, dst, kind, extra = {}) => {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  files.push({ kind, src: src.slice(DIR.length + 1), srcSha256: sha256(src), file: dst.slice(ROOT.length + 1), sha256: sha256(dst), ...extra });
  return dst;
};
const made = (dst, kind, srcInfo) => { files.push({ kind, ...srcInfo, file: dst.slice(ROOT.length + 1), sha256: sha256(dst) }); return dst; };

// 1. json пакета → data/
for (const n of TOP_JSON) copy(join(DIR, n), join(DATA, n), 'data');
for (const id of pages) copy(join(DIR, 'frames', id, 'geometry.json'), join(DATA, `geometry-${id}.json`), 'data');

// 2. кадры шагов → public/.../frames/OXX/*.png (как есть, без перекодирования)
for (const id of pages) {
  const pngs = readdirSync(join(DIR, 'frames', id)).filter((n) => n.endsWith('.png')).sort();
  if (pngs.length === 0) die(`frames/${id}: нет png`);
  for (const n of pngs) copy(join(DIR, 'frames', id, n), join(PUBLIC, 'frames', id, n), 'frame');
}

// 3. миниатюры очереди: 01_input.png → 240×168 (cover: вписать по меньшей стороне, обрезать по центру); в кадре показываются 120×84
const THUMB = { w: 240, h: 168 };
for (const id of pages) {
  const src = join(DIR, 'frames', id, '01_input.png');
  if (!existsSync(src)) die(`нет ${src}`);
  const dst = join(PUBLIC, 'thumbs', `${id}.png`);
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${THUMB.w}:${THUMB.h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${THUMB.w}:${THUMB.h}`, '-frames:v', '1', dst]);
  made(dst, 'thumb', { src: `frames/${id}/01_input.png`, srcSha256: sha256(src), size: [THUMB.w, THUMB.h] });
}

// 4. фон 1920×1080: #0b0f14, тонкая сетка 64 px, зерно (seed фиксирован — один и тот же файл при каждом запуске)
const BG = { w: 1920, h: 1080, color: '0x0b0f14', grid: 64, gridColor: '0x161d26@0.9', noiseSeed: 20, noiseStrength: 7 };
const bg = join(PUBLIC, 'bg.png');
run('ffmpeg', [
  '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${BG.color}:s=${BG.w}x${BG.h}:r=1`,
  '-vf', `drawgrid=width=${BG.grid}:height=${BG.grid}:thickness=1:color=${BG.gridColor},noise=all_seed=${BG.noiseSeed}:all_strength=${BG.noiseStrength},format=rgb24`,
  '-frames:v', '1', bg,
]);
made(bg, 'bg', { src: null, srcSha256: null, recipe: BG });

// 5. манифест
const manifest = {
  generatedAt: new Date().toISOString(),
  script: `videos/agent-terminal/prepare-assets.mjs ${SCRIPT_VERSION}`,
  packDir: DIR,
  publicPrefix: 'videos/agent-terminal',
  pages,
  thumb: THUMB,
  files,
};
writeFileSync(join(HERE, 'assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const by = (k) => files.filter((f) => f.kind === k).length;
console.log(`✓ agent-terminal: страниц ${pages.length}; data ${by('data')}, кадров ${by('frame')}, миниатюр ${by('thumb')}, фон ${by('bg')} → ${join(HERE, 'assets.manifest.json').slice(ROOT.length + 1)}`);

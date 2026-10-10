#!/usr/bin/env node
// Подготовка ассетов ролика beauty-studio из распакованного handoff beautystudiozp.com и трека пользователя.
//
//   BEAUTY_HANDOFF_DIR=/path/beauty BEAUTY_MUSIC_FILE=/path/track.mp3 node videos/beauty-studio/prepare-assets.mjs
//
// Источники — ТОЛЬКО переменные BEAUTY_HANDOFF_DIR и BEAUTY_MUSIC_FILE (окружение процесса или .env),
// описаны в env.manifest.json (data_dirs, required_for: beauty-studio). Дефолтов нет: чего-то нет —
// громкий отказ с перечнем недостающего.
//   BEAUTY_HANDOFF_DIR — корень, внутри handoff/ (media/originals, media/site) и video/ (media/originals/video).
//   BEAUTY_MUSIC_FILE  — трек; отрезок music.excerpt из scenes.yaml → WAV 48k stereo без фейдов.
//
// Пишет:
//   videos/beauty-studio/assets/…            медиа (gitignore, воспроизводимо этим скриптом)
//   public/videos/beauty-studio  → симлинк на assets/ (Remotion staticFile; bundler пробрасывает симлинк)
//   videos/beauty-studio/assets.manifest.json  источник, sha256 источника и результата, размеры, длительности
//
// Оригиналы приоритетнее site-версий (STYLE_HANDOFF §8.2). Звуки берутся из sfx/manifest.json
// по id из scenes.yaml (sfx.cues) — с лицензией.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync, symlinkSync, readlinkSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const SCRIPT_VERSION = '2.0.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'assets');
const PUBLIC_LINK = join(ROOT, 'public', 'videos', 'beauty-studio');

const die = (msg) => {
  console.error(`\nОТКАЗ prepare-assets: ${msg}\n`);
  process.exit(1);
};

// ---------- источник ----------
const envFile = join(ROOT, '.env');
const envText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
const fromEnv = (name) => process.env[name] ?? envText.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim();
const HANDOFF = fromEnv('BEAUTY_HANDOFF_DIR');
const MUSIC_SRC = fromEnv('BEAUTY_MUSIC_FILE');
{
  const lack = [];
  if (!HANDOFF) lack.push('BEAUTY_HANDOFF_DIR — корень handoff (внутри handoff/ и video/)');
  else if (!existsSync(join(HANDOFF, 'handoff')) || !existsSync(join(HANDOFF, 'video'))) lack.push(`BEAUTY_HANDOFF_DIR=${HANDOFF}: нет подкаталогов handoff/ и video/`);
  if (!MUSIC_SRC) lack.push('BEAUTY_MUSIC_FILE — путь к треку (mp3/wav)');
  else if (!existsSync(MUSIC_SRC)) lack.push(`BEAUTY_MUSIC_FILE=${MUSIC_SRC}: файла нет`);
  if (lack.length) {
    die(
      `не заданы/не найдены источники (${lack.length}):\n  ✗ ${lack.join('\n  ✗ ')}\n` +
        '  Пример: BEAUTY_HANDOFF_DIR=/path/beauty BEAUTY_MUSIC_FILE=/path/track.mp3 node videos/beauty-studio/prepare-assets.mjs\n' +
        '  (см. env.manifest.json → data_dirs; проверка: npm run check -- --scope beauty-studio)',
    );
  }
}
const roots = [join(HANDOFF, 'handoff'), join(HANDOFF, 'video')];

const missing = [];
const resolveSrc = (rel) => {
  for (const r of roots) {
    const p = join(r, rel);
    if (existsSync(p)) return { abs: p, root: r, rel };
  }
  return null;
};

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')}\n${r.stderr?.slice(-2000)}`);
  return r.stdout;
};
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const probe = (file) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return {
    width: v ? v.width : undefined,
    height: v ? v.height : undefined,
    durationSec: j.format?.duration ? Number(Number(j.format.duration).toFixed(3)) : undefined,
    fps: v?.r_frame_rate && v.r_frame_rate !== '0/0' ? Number(eval(v.r_frame_rate).toFixed(3)) : undefined,
    codec: v?.codec_name,
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels } : null,
  };
};

// ---------- список ассетов (оригинал → запасной site) ----------
// kind: image — в JPEG q≈95 (фото; прозрачности нет), длинная сторона ≤ 2160 (Reels 1080 × запас под scale/кроп)
const IMG = (id, original, site, extra = {}) => ({ id, kind: 'image', candidates: [original, site].filter(Boolean), out: `images/${id}.jpg`, ...extra });
const ASSETS = [
  IMG('macro', null, 'media/site/images/macro.webp', { note: 'оригинала нет в проекте (§8.2) — версия с сайта' }),
  IMG('process', 'media/originals/process-2026-08-25.png', 'media/site/images/process.webp'),
  ...['02', '03', '04', '05', '06'].map((n) =>
    IMG(`work-detail-${n}`, `media/originals/works/details/work-detail-${n}.png`, `media/site/images/works/details/work-detail-${n}.webp`),
  ),
  ...['01', '02', '03'].map((n) =>
    IMG(`work-result-${n}`, `media/originals/works/results/work-result-${n}.png`, `media/site/images/works/results/work-result-${n}.webp`),
  ),
  ...['01', '02', '03', '04', '05'].map((n) =>
    IMG(`face-${n}`, `media/originals/works/faces/work-${n}.png`, `media/site/images/works/faces/work-${n}.webp`, {
      // нормализация лиц §4.6 считана в процентах от кадра 1122×1402 — размер обязан совпасть
      expectSize: [1122, 1402],
    }),
  ),
  IMG('studio-01', 'media/originals/studio/studio-01.jpg', 'media/site/images/studio/studio-01.webp'),
  IMG('studio-03', 'media/originals/studio/studio-03.png', 'media/site/images/studio/studio-03.webp'),
  // studio-02-detail на сайте = кроп studio-02.jpg с x=1500 (§8.2): режем тот же кроп из оригинала
  IMG('studio-02-detail', 'media/originals/studio/studio-02.jpg', 'media/site/images/studio/studio-02-detail.webp', {
    cropFromOriginal: { w: 1252, h: 1536, x: 1500, y: 0 },
  }),
  {
    id: 'hero',
    kind: 'video',
    candidates: ['media/originals/video/hero-source-2026-08-28.mp4'],
    out: 'video/hero-1080p.mp4',
    // H.264 1080p без звука; crf 18, keyint 30 — быстрый seek для OffthreadVideo
    ffmpeg: ['-an', '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', '-movflags', '+faststart'],
  },
  {
    id: 'logo',
    kind: 'video',
    candidates: ['media/originals/video/loading-screen-original-4096x2304.mp4'],
    out: 'video/logo-2160.mp4',
    // ширина 2160, без звука (музыка несёт ролик), keyint 12 при 24 fps
    ffmpeg: ['-an', '-vf', 'scale=2160:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-g', '12', '-movflags', '+faststart'],
  },
];

// ---------- сценарий: звуки и отрезок музыки ----------
const scenesPath = join(HERE, 'scenes.yaml');
if (!existsSync(scenesPath)) die(`нет ${relative(ROOT, scenesPath)} — сценарий невосстановим, создаёт человек`);
const scenes = parseYaml(readFileSync(scenesPath, 'utf8'));
const sfxIds = [...new Set((scenes?.sfx?.cues ?? []).map((c) => c.sound))];
const sfxManifestPath = join(ROOT, 'sfx', 'manifest.json');
let sfxManifest = null;
if (sfxIds.length) {
  if (!existsSync(sfxManifestPath)) die('scenes.yaml ссылается на звуки, а sfx/manifest.json нет — npm run sfx:collect');
  sfxManifest = JSON.parse(readFileSync(sfxManifestPath, 'utf8'));
}

// ---------- работа ----------
mkdirSync(OUT, { recursive: true });
const resolved = ASSETS.map((a) => {
  const found = a.candidates.map((c) => resolveSrc(c)).find(Boolean);
  if (!found) missing.push(`(${a.id}) ни один из: ${a.candidates.join(' | ')}`);
  return { ...a, src: found };
});
if (missing.length) die(`в [${roots.join(', ')}] нет файлов:\n  ${missing.join('\n  ')}`);

const entries = [];
for (const a of resolved) {
  const outAbs = join(OUT, a.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  const isOriginal = a.src.rel.startsWith('media/originals/');
  if (a.kind === 'image') {
    const srcInfo = probe(a.src.abs);
    if (a.expectSize && isOriginal && (srcInfo.width !== a.expectSize[0] || srcInfo.height !== a.expectSize[1])) {
      die(`${a.id}: размер ${srcInfo.width}×${srcInfo.height}, ожидается ${a.expectSize.join('×')} (нормализация лиц §4.6)`);
    }
    const vf = [];
    if (a.cropFromOriginal && isOriginal) {
      const c = a.cropFromOriginal;
      vf.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`);
    }
    vf.push("scale='if(gt(iw,ih),min(2160,iw),-2)':'if(gt(iw,ih),-2,min(2160,ih))':flags=lanczos");
    run('ffmpeg', ['-v', 'error', '-y', '-i', a.src.abs, '-vf', vf.join(','), '-q:v', '2', '-pix_fmt', 'yuvj444p', outAbs]);
  } else {
    console.log(`  кодирую ${a.id} (может занять минуту)…`);
    run('ffmpeg', ['-v', 'error', '-y', '-i', a.src.abs, ...a.ffmpeg, outAbs]);
  }
  const info = probe(outAbs);
  entries.push({
    id: a.id,
    kind: a.kind,
    file: a.out,
    width: info.width,
    height: info.height,
    ...(a.kind === 'video' ? { durationSec: info.durationSec, fps: info.fps, audio: info.audio } : {}),
    sha256: sha256(outAbs),
    source: {
      path: a.src.rel,
      root: a.src.root,
      quality: isOriginal ? 'original' : 'site',
      sha256: sha256(a.src.abs),
      ...(a.cropFromOriginal && isOriginal ? { crop: a.cropFromOriginal } : {}),
    },
    ...(a.note ? { note: a.note } : {}),
  });
  console.log(`  ✓ ${a.id.padEnd(18)} ${String(info.width)}×${info.height}  ← ${a.src.rel}`);
}

// звуки: целостность library ↔ manifest проверяет штатный collect.mjs --verify (sha256 PCM-данных)
const sfx = [];
if (sfxIds.length) {
  const v = spawnSync('node', [join(ROOT, 'sfx', 'collect.mjs'), '--verify'], { encoding: 'utf8' });
  if (v.status !== 0) die(`sfx/collect.mjs --verify: library не совпадает с manifest.json\n${(v.stdout + v.stderr).slice(-1500)}`);
}
for (const id of sfxIds) {
  const s = sfxManifest.sounds.find((x) => x.id === id);
  if (!s) die(`звук ${id} из scenes.yaml не найден в sfx/manifest.json`);
  if (!s.license) die(`звук ${id} без лицензии — в ролик не попадает (CLAUDE.md, гейт 6)`);
  const srcAbs = join(ROOT, 'sfx', s.file);
  if (!existsSync(srcAbs)) die(`файла звука нет: sfx/${s.file} — npm run sfx:collect`);
  const out = `sfx/${id}.wav`;
  mkdirSync(join(OUT, 'sfx'), { recursive: true });
  copyFileSync(srcAbs, join(OUT, out));
  const src = sfxManifest.sources.find((x) => x.id === s.source);
  sfx.push({
    id,
    file: out,
    pcmSha256: s.sha256,
    fileSha256: sha256(join(OUT, out)),
    durationMs: s.durationMs,
    transientMs: s.transientMs,
    lufs: s.lufs,
    peakDb: s.peakDb,
    license: s.license,
    source: { id: s.source, url: src?.url, commit: src?.commit, origName: s.origName },
  });
  console.log(`  ✓ sfx ${id} (${s.license})`);
}

// музыка: отрезок music.excerpt из BEAUTY_MUSIC_FILE → WAV 48k stereo, БЕЗ фейдов и gain (они в композиции)
const m = scenes?.music;
const exc = m?.excerpt;
if (!m?.file || !exc || !Number.isFinite(exc.sourceStartSec) || !Number.isFinite(exc.durationSec)) {
  die('scenes.yaml: нужен music.file (public-путь) и music.excerpt {sourceStartSec, durationSec}');
}
const PUBLIC_PREFIX = 'videos/beauty-studio/';
if (!m.file.startsWith(PUBLIC_PREFIX) || !m.file.endsWith('.wav')) die(`scenes.yaml music.file = ${m.file}: ожидается ${PUBLIC_PREFIX}<путь>.wav`);
const musicOut = m.file.slice(PUBLIC_PREFIX.length);
const srcProbe = probe(MUSIC_SRC);
if (!(srcProbe.durationSec >= exc.sourceStartSec + exc.durationSec)) {
  die(`трек ${MUSIC_SRC} короче отрезка: ${srcProbe.durationSec} с < ${exc.sourceStartSec} + ${exc.durationSec}`);
}
mkdirSync(dirname(join(OUT, musicOut)), { recursive: true });
// -ss после -i — точный (по сэмплам) вырез; без фейдов
run('ffmpeg', ['-v', 'error', '-y', '-i', MUSIC_SRC, '-ss', String(exc.sourceStartSec), '-t', String(exc.durationSec), '-vn', '-map_metadata', '-1', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', join(OUT, musicOut)]);
const musicInfo = probe(join(OUT, musicOut));
const music = {
  file: musicOut,
  durationSec: musicInfo.durationSec,
  sampleRate: musicInfo.audio?.sampleRate,
  channels: musicInfo.audio?.channels,
  sha256: sha256(join(OUT, musicOut)),
  excerpt: exc,
  source: { path: MUSIC_SRC, sha256: sha256(MUSIC_SRC), durationSec: srcProbe.durationSec, note: m.source },
};
console.log(`  ✓ music ${exc.sourceStartSec}…${exc.sourceStartSec + exc.durationSec} с → ${musicOut} (${music.durationSec} с)`);

// симлинк public/videos/beauty-studio → videos/beauty-studio/assets
mkdirSync(dirname(PUBLIC_LINK), { recursive: true });
const linkTarget = relative(dirname(PUBLIC_LINK), OUT);
let linkOk = false;
try { linkOk = lstatSync(PUBLIC_LINK).isSymbolicLink() && readlinkSync(PUBLIC_LINK) === linkTarget; } catch { /* нет */ }
if (!linkOk) {
  if (existsSync(PUBLIC_LINK)) die(`${relative(ROOT, PUBLIC_LINK)} существует и не является нужным симлинком — уберите вручную`);
  symlinkSync(linkTarget, PUBLIC_LINK);
}

const manifest = {
  $comment: 'ПРОИЗВОДНОЕ: пишет videos/beauty-studio/prepare-assets.mjs. Пути file — относительно public/videos/beauty-studio (staticFile).',
  generatedAt: new Date().toISOString(),
  scriptVersion: SCRIPT_VERSION,
  publicPrefix: 'videos/beauty-studio',
  scenesSha256: sha256(scenesPath),
  assets: Object.fromEntries(entries.map((e) => [e.id, e])),
  sfx: Object.fromEntries(sfx.map((s) => [s.id, s])),
  music,
};
writeFileSync(join(HERE, 'assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nOK: ${entries.length} медиа, ${sfx.length} звуков${music ? ', музыка' : ''} → ${relative(ROOT, OUT)}; манифест assets.manifest.json`);

#!/usr/bin/env node
// Лаборатория приёмов FxLab24 (задача 012-А): фикстуры и лист удара.
//
//   node --experimental-strip-types scripts/fxlab.mjs fixtures
//     public/fixtures: синтетическое видео для ramp (ffmpeg testsrc2, детерминированно) и 4 тайла зерна
//     (ImageMagick шум с seed — как videos/mia-outro/prepare-assets.mjs). Пути — src/fx/lab/fixtures.ts.
//   node --experimental-strip-types scripts/fxlab.mjs sheet [--hit 36] [--before 4] [--after 8]
//     один бандл → стиллы кадров hit−before…hit+after → полоса плитки «удар L» (строка 3: y 1152, h 384)
//     → out/qa/FxLab24-hit-L.png (ImageMagick montage); стиллы — out/qa/fxlab/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FX_FIXTURES } from '../src/fx/lab/fixtures.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${bin} ${args.slice(0, 3).join(' ')}…: ${(r.stderr || r.stdout).slice(-600)}`);
  return r.stdout;
};

if (cmd === 'fixtures') {
  const dir = join(ROOT, 'public', FX_FIXTURES.dir);
  mkdirSync(dir, { recursive: true });
  const V = FX_FIXTURES.video;
  const video = join(ROOT, 'public', V.file);
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${V.w}x${V.h}:rate=${V.fps}:duration=${V.frames / V.fps}`, '-frames:v', String(V.frames), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', '12', '-an', video]);
  const n = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'default=nw=1:nk=1', video]).trim();
  if (Number(n) !== V.frames) throw new Error(`${V.file}: ${n} кадров, ожидалось ${V.frames}`);
  console.log(`  ✓ ${V.file}: ${V.w}×${V.h} @${V.fps}, ${n} кадров, ${statSync(video).size} B`);
  FX_FIXTURES.grain.forEach((rel, k) => {
    const out = join(ROOT, 'public', rel);
    run('magick', ['-seed', String(1000 + k), '-size', `${FX_FIXTURES.grainSize}x${FX_FIXTURES.grainSize}`, 'xc:gray50', '-attenuate', '0.6', '+noise', 'Gaussian', '-colorspace', 'Gray', out]);
    console.log(`  ✓ ${rel}: ${statSync(out).size} B`);
  });
  console.log(`OK: фикстуры → ${dir}`);
  process.exit(0);
}

if (cmd === 'sheet') {
  for (const rel of [FX_FIXTURES.video.file, ...FX_FIXTURES.grain]) if (!existsSync(join(ROOT, 'public', rel))) throw new Error(`нет public/${rel} — сначала: node --experimental-strip-types scripts/fxlab.mjs fixtures`);
  const hit = Number(opt('--hit', '36'));
  const before = Number(opt('--before', '4'));
  const after = Number(opt('--after', '8'));
  const { bundle } = await import('@remotion/bundler');
  const { renderStill, selectComposition } = await import('@remotion/renderer');
  await import('../remotion.config.ts');
  const { ConfigInternals } = await import('@remotion/cli/config');
  const OUT = join(ROOT, 'out', 'qa');
  const stillsDir = join(OUT, 'fxlab');
  mkdirSync(stillsDir, { recursive: true });
  const bundleDir = join(OUT, 'bundle-fxlab');
  rmSync(bundleDir, { recursive: true, force: true });
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.ts'), rootDir: ROOT, publicDir: join(ROOT, 'public'), outDir: bundleDir, webpackOverride: ConfigInternals.getWebpackOverrideFn(), enableCaching: true });
  console.log(`бандл ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  const composition = await selectComposition({ serveUrl, id: 'FxLab24', inputProps: {}, logLevel: 'error' });
  const FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
  const strips = [];
  for (let d = -before; d <= after; d++) {
    const frame = hit + d;
    const file = join(stillsDir, `FxLab24-f${frame}.png`);
    await renderStill({ serveUrl, composition, frame, output: file, inputProps: {}, logLevel: 'error', overwrite: true });
    const strip = join(stillsDir, `hitL-f${frame}.png`);
    // плитка «удар L» — строка 3 (y 1152, 1080×384); подпись: смещение от удара и кадр
    run('magick', [file, '-crop', '1080x384+0+1152', '+repage', '-resize', '360x', '-fill', '#000A', '-draw', 'rectangle 0,0 360,30', '-fill', 'yellow', '-font', FONT, '-pointsize', '20', '-annotate', '+6+22', `h${d >= 0 ? '+' : ''}${d} f${frame}`, strip]);
    strips.push(strip);
  }
  const sheet = join(OUT, 'FxLab24-hit-L.png');
  run('magick', ['montage', '-font', FONT, ...strips, '-tile', `${strips.length}x1`, '-geometry', '+2+2', '-background', '#111', sheet]);
  for (const s of strips) rmSync(s);
  console.log(`OK: ${strips.length} кадров (${hit - before}…${hit + after}) за ${((Date.now() - t0) / 1000).toFixed(0)} с → ${sheet}; стиллы ${stillsDir}`);
  process.exit(0);
}

console.error('Использование: fxlab.mjs fixtures | sheet [--hit 36] [--before 4] [--after 8]');
process.exit(2);

#!/usr/bin/env node
// Попиксельная регрессия стиллов (задача 012-А п. 2): «картинка не изменилась» после переноса кода.
//
//   node scripts/pixregress.mjs capture <dir> [--comps A,B] [--frames 66,68,…] [--props JSON]
//     один бандл → renderStill каждого кадра каждой композиции → <dir>/<Comp>-f<frame>.png
//   node scripts/pixregress.mjs compare <dirA> <dirB> [--delta 8] [--max-pct 1]
//     для каждого PNG из dirA — одноимённый из dirB; оба декодируются ffmpeg в rgb24, пиксель «отличается»,
//     если хотя бы один канал разошёлся больше чем на delta (по умолчанию 8/255). Порог: доля таких пикселей
//     ≤ max-pct % (по умолчанию 1 %). Нет пары / разный размер / порог превышен → exit 1.
//
// По умолчанию — кадры удара h2 (f66 удар, f68 импакт-кадр, f82 середина карточки MIA) и финала
// (f387 MIA + строка, f439 последний кадр музыки, f469 конец holdAfter) из отчёта финального рендера 008,
// композиции MiaOutro и MiaOutroVertical. Позитивный контроль — изменённый пресет src/fx обязан дать красное.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const usage = () => {
  console.error('Использование: pixregress.mjs capture <dir> [--comps A,B] [--frames 1,2,3] [--props JSON] | compare <dirA> <dirB> [--delta 8] [--max-pct 1]');
  process.exit(2);
};

if (cmd === 'capture') {
  const dir = argv[1];
  if (!dir || dir.startsWith('--')) usage();
  const comps = opt('--comps', 'MiaOutro,MiaOutroVertical').split(',');
  const frames = opt('--frames', '66,68,82,387,439,469').split(',').map(Number);
  const inputProps = JSON.parse(opt('--props', '{"episode":"ep01"}'));
  const { bundle } = await import('@remotion/bundler');
  const { renderStill, selectComposition } = await import('@remotion/renderer');
  await import('../remotion.config.ts');
  const { ConfigInternals } = await import('@remotion/cli/config');
  const out = resolve(ROOT, dir);
  mkdirSync(out, { recursive: true });
  const bundleDir = join(ROOT, 'out', 'qa', 'bundle-pixregress');
  rmSync(bundleDir, { recursive: true, force: true }); // производное; копия public с симлинком не перезаписывается (EEXIST)
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.ts'), rootDir: ROOT, publicDir: join(ROOT, 'public'), outDir: bundleDir, webpackOverride: ConfigInternals.getWebpackOverrideFn(), enableCaching: true });
  console.log(`бандл ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  let n = 0;
  for (const id of comps) {
    const composition = await selectComposition({ serveUrl, id, inputProps, logLevel: 'error' });
    for (const frame of frames) {
      if (frame >= composition.durationInFrames) throw new Error(`${id}: кадр ${frame} вне длительности ${composition.durationInFrames}`);
      const output = join(out, `${id}-f${frame}.png`);
      await renderStill({ serveUrl, composition, frame, output, inputProps, logLevel: 'error', overwrite: true });
      n++;
    }
    console.log(`  ${id}: ${frames.length} кадров`);
  }
  console.log(`OK: ${n} стиллов за ${((Date.now() - t0) / 1000).toFixed(0)} с → ${out}`);
  process.exit(0);
}

if (cmd === 'compare') {
  const [A, B] = [argv[1], argv[2]].map((d) => (d && !d.startsWith('--') ? resolve(ROOT, d) : null));
  if (!A || !B) usage();
  const delta = Number(opt('--delta', '8'));
  const maxPct = Number(opt('--max-pct', '1'));
  const size = (png) => {
    const b = readFileSync(png);
    if (b.readUInt32BE(12) !== 0x49484452) throw new Error(`${png}: не PNG`); // 'IHDR'
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const raw = (png) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`ffmpeg ${png}: ${r.stderr.toString().slice(-300)}`);
    return r.stdout;
  };
  const files = readdirSync(A).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) {
    console.error(`в ${A} нет PNG`);
    process.exit(2);
  }
  let bad = 0;
  console.log(`Δ > ${delta}/255 хотя бы в одном канале; порог ${maxPct} % пикселей`);
  for (const f of files) {
    const a = join(A, f);
    const b = join(B, f);
    if (!existsSync(b)) {
      console.log(`  ✗ ${f}: нет пары в ${B}`);
      bad++;
      continue;
    }
    const sa = size(a);
    const sb = size(b);
    if (sa.w !== sb.w || sa.h !== sb.h) {
      console.log(`  ✗ ${f}: размер ${sa.w}×${sa.h} ≠ ${sb.w}×${sb.h}`);
      bad++;
      continue;
    }
    const ra = raw(a);
    const rb = raw(b);
    const px = sa.w * sa.h;
    let diff = 0;
    let maxD = 0;
    for (let i = 0; i < px; i++) {
      const o = i * 3;
      const d = Math.max(Math.abs(ra[o] - rb[o]), Math.abs(ra[o + 1] - rb[o + 1]), Math.abs(ra[o + 2] - rb[o + 2]));
      if (d > maxD) maxD = d;
      if (d > delta) diff++;
    }
    const pct = (100 * diff) / px;
    const ok = pct <= maxPct;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${f}: ${diff} из ${px} px (${pct.toFixed(3)} %), макс. Δ ${maxD}`);
  }
  console.log(bad ? `ПРОВАЛ: ${bad} из ${files.length} стиллов` : `OK: ${files.length} стиллов, картинка не изменилась`);
  process.exit(bad ? 1 : 0);
}

usage();

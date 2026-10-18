#!/usr/bin/env node
// Стиллы аутро MIA одним бандлом (motion-review: не `remotion still` в цикле).
//   node --experimental-strip-types videos/mia-outro/stills.mjs [--episode ep01]
// → out/mia-outro/stills/<comp>/*.png и листы out/mia-outro/sheets/*.png:
//   удары (кадр удара и +2 — после вспышки), середина каждой карточки — обе ориентации;
//   варианты кропа 9:16 (A/B/C) живых планов — в середине каждого плана.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { parse } from 'yaml';
import { buildTimeline, parseOutro } from '../../src/videos/mia-outro/model.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const episode = argv.includes('--episode') ? argv[argv.indexOf('--episode') + 1] : 'ep01';
const outro = parseOutro(parse(readFileSync(join(ROOT, 'videos', 'mia-outro', 'outro.yaml'), 'utf8')));
const tl = buildTimeline(outro, episode);
const OUT = join(ROOT, 'out', 'mia-outro');
const FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

await import('../../remotion.config.ts');
const { ConfigInternals } = await import('@remotion/cli/config');
const t0 = Date.now();
// производное; копия public с симлинком не перезаписывается поверх старой (EEXIST) — пересобираем с нуля (как readcheck)
rmSync(join(OUT, 'bundle'), { recursive: true, force: true });
const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.ts'), rootDir: ROOT, publicDir: join(ROOT, 'public'), outDir: join(OUT, 'bundle'), webpackOverride: ConfigInternals.getWebpackOverrideFn(), enableCaching: true });
console.log(`бандл ${((Date.now() - t0) / 1000).toFixed(1)} с`);

const shots = []; // {comp, frame, props, name, label, group}
const hitItems = tl.items.filter((p) => p.hit);
for (const comp of ['MiaOutro', 'MiaOutroVertical']) {
  // лист «вокруг ударов»: −3…+6 кадров от каждого удара (строка = удар)
  for (const p of hitItems) for (let d = -3; d <= 6; d++) {
    const fr = p.startFrame + d;
    if (fr < 0 || fr >= tl.durationInFrames) continue;
    shots.push({ comp, frame: fr, name: `h${p.hit}${d >= 0 ? '+' : ''}${d}-f${fr}`, label: `h${p.hit} ${d >= 0 ? '+' : ''}${d} f${fr}`, group: `around-${comp}` });
  }
  for (const p of tl.items.filter((x) => x.kind === 'card')) {
    const mid = p.startFrame + Math.floor((p.endFrame - p.startFrame) / 2);
    shots.push({ comp, frame: mid, name: `card-${p.hero}-mid-f${mid}`, label: `${p.hero} середина f${mid}`, group: `main-${comp}` });
  }
  for (const p of tl.items.filter((x) => x.kind === 'final')) for (const fr of [p.startFrame + 12, tl.musicEndFrame - 1, tl.durationInFrames - 1]) {
    shots.push({ comp, frame: fr, name: `final-f${fr}`, label: `финал f${fr}${fr >= tl.musicEndFrame ? ' (holdAfter)' : ''}`, group: `main-${comp}` });
  }
}
// варианты кропа 9:16 для погони (V7/V1/V3) — по умолчанию B, выбирает Олег
for (const p of tl.items.filter((x) => x.kind === 'live' && ['V7', 'V1', 'V3'].includes(x.srcFrames.src))) {
  const mid = p.startFrame + Math.floor((p.endFrame - p.startFrame) / 2);
  for (const v of ['A', 'B', 'C']) shots.push({ comp: 'MiaOutroVertical', frame: mid, props: { verticalCrop: v }, name: `crop-${p.index}-${v}-f${mid}`, label: `[${p.index}] ${p.srcFrames.src} f${mid} кроп ${v}`, group: 'crops' });
}

const comps = {};
let k = 0;
for (const s of shots) {
  const inputProps = { episode, ...(s.props ?? {}) };
  const ck = `${s.comp}:${JSON.stringify(inputProps)}`;
  comps[ck] ??= await selectComposition({ serveUrl, id: s.comp, inputProps, logLevel: 'error' });
  const dir = join(OUT, 'stills', s.comp);
  mkdirSync(dir, { recursive: true });
  s.file = join(dir, `${s.name}.png`);
  await renderStill({ serveUrl, composition: comps[ck], frame: s.frame, output: s.file, inputProps, logLevel: 'error', overwrite: true });
  if (++k % 10 === 0) console.log(`  ${k}/${shots.length}`);
}
console.log(`стиллы: ${shots.length} за ${((Date.now() - t0) / 1000).toFixed(0)} с → ${join(OUT, 'stills')}`);

// листы: подпись на каждом кадре, по ориентации; варианты кропа — по плану в строку
mkdirSync(join(OUT, 'sheets'), { recursive: true });
const labelled = (s, w) => {
  const o = s.file.replace(/\.png$/, '.lbl.png');
  const pt = Math.max(11, Math.round(w / 13));
  spawnSync('magick', [s.file, '-resize', `${w}x`, '-fill', '#000A', '-draw', `rectangle 0,0 ${w},${pt + 10}`, '-fill', 'yellow', '-font', FONT, '-pointsize', String(pt), '-annotate', `+5+${pt + 2}`, s.label, o]);
  return o;
};
const sheet = (list, w, cols, out) => {
  const files = list.map((s) => labelled(s, w));
  spawnSync('magick', ['montage', '-font', FONT, ...files, '-tile', `${cols}x`, '-geometry', '+3+3', '-background', '#111', out]);
  for (const f of files) rmSync(f);
  console.log(`  лист ${out}`);
};
const of = (g) => shots.filter((s) => s.group === g);
sheet(of('around-MiaOutro'), 240, 10, join(OUT, 'sheets', 'MiaOutro-around-hits.png'));
sheet(of('around-MiaOutroVertical'), 135, 10, join(OUT, 'sheets', 'MiaOutroVertical-around-hits.png'));
sheet(of('main-MiaOutro'), 480, 4, join(OUT, 'sheets', 'MiaOutro-cards-final.png'));
sheet(of('main-MiaOutroVertical'), 270, 7, join(OUT, 'sheets', 'MiaOutroVertical-cards-final.png'));
sheet(of('crops'), 270, 3, join(OUT, 'sheets', 'MiaOutroVertical-crops-chase.png'));

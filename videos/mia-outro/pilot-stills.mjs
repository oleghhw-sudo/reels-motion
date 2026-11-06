#!/usr/bin/env node
// Стиллы пилота 030 (аутро MIA, v3 = outro.yaml против v4 = outro.v4-picks.yaml) одним бандлом, полный рендер не делается.
//   node --experimental-strip-types --no-warnings videos/mia-outro/pilot-stills.mjs [--episode ep01] [--only compare|hits|carry|light]
// → out/mia-outro/pilot-030/stills/<comp>/<v3|v4>/*.png и листы out/mia-outro/pilot-030/:
//   compare-16x9.png, compare-9x16.png — строка на эпизод (погоня, MIA, ROOK, JAX, HALE, заряд, затишье, финал): 3 кадра
//     (+0.2 с от начала, середина, последний кадр перед выходом), v3 слева, v4 справа, одни и те же номера кадров;
//   hits-<HERO>-16x9.png / -9x16.png — вокруг входа каждой карточки −4…+8 кадров через кадр, строка v3 и строка v4;
//   lockCarry-16x9.png / -9x16.png — склейка V10:150 → ROOK −6…+8 (v4); lightMatch-16x9.png / -9x16.png — затишье → финал −12…+4 (v4).
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
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const episode = opt('--episode', 'ep01');
const only = opt('--only', null);
const SCRIPTS = { v3: 'outro.yaml', v4: 'outro.v4-picks.yaml' };
const tl = {};
for (const [v, f] of Object.entries(SCRIPTS)) tl[v] = buildTimeline(parseOutro(parse(readFileSync(join(ROOT, 'videos', 'mia-outro', f), 'utf8'))), episode);
// v4 меняет только приёмы: таймлайн в кадрах обязан совпасть — иначе сравнение «в одни и те же моменты» неверно
const sig = (t) => t.items.map((p) => `${p.kind}:${p.startFrame}-${p.endFrame}`).join(' ');
if (sig(tl.v3) !== sig(tl.v4)) { console.error(`ОТКАЗ: таймлайны v3 и v4 расходятся по кадрам:\n v3 ${sig(tl.v3)}\n v4 ${sig(tl.v4)}`); process.exit(1); }
const T = tl.v4;
const OUT = join(ROOT, 'out', 'mia-outro', 'pilot-030');
const FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const fps = T.fps;
const NAMES = { MIA: 'MIA', DARK: 'ROOK', BLOND: 'JAX', OFFICER: 'HALE' };

await import('../../remotion.config.ts');
const { ConfigInternals } = await import('@remotion/cli/config');
const t0 = Date.now();
rmSync(join(OUT, 'bundle'), { recursive: true, force: true });
const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.ts'), rootDir: ROOT, publicDir: join(ROOT, 'public'), outDir: join(OUT, 'bundle'), webpackOverride: ConfigInternals.getWebpackOverrideFn(), enableCaching: true });
console.log(`бандл ${((Date.now() - t0) / 1000).toFixed(1)} с`);

// ---------------------------------------------------------------- эпизоды аутро
const items = T.items;
const range = (a, b) => ({ start: items[a].startFrame, end: items[b].endFrame });
const cardIdx = (hero) => items.findIndex((p) => p.kind === 'card' && p.hero === hero);
const lastIdx = (pred) => items.length - 1 - [...items].reverse().findIndex(pred);
const EPISODES = [
  { id: 'chase', label: 'погоня', ...range(0, 2) },
  ...['MIA', 'DARK', 'BLOND', 'OFFICER'].map((h) => ({ id: `card-${h}`, label: `карточка ${NAMES[h]}`, ...range(cardIdx(h), cardIdx(h)) })),
  { id: 'charge', label: 'заряд', ...range(lastIdx((p) => p.kind === 'live'), lastIdx((p) => p.kind === 'live')) },
  { id: 'lull', label: 'затишье', ...range(lastIdx((p) => p.kind === 'lull'), lastIdx((p) => p.kind === 'lull')) },
  { id: 'final', label: 'финал', ...range(lastIdx((p) => p.kind === 'final'), lastIdx((p) => p.kind === 'final')) },
];
const momentsOf = (e) => [
  { f: e.start + Math.round(0.2 * fps), what: '+0.2 с' },
  { f: e.start + Math.floor((e.end - e.start) / 2), what: 'середина' },
  { f: e.end - 1, what: 'перед выходом' },
];

// ---------------------------------------------------------------- рендер (кэш по comp/версии/кадру)
const COMPS = { '16x9': 'MiaOutro', '9x16': 'MiaOutroVertical' };
const comps = {};
const done = new Map();
let k = 0;
async function still(orient, v, frame) {
  const comp = COMPS[orient];
  const key = `${comp}:${v}:${frame}`;
  if (done.has(key)) return done.get(key);
  const inputProps = { episode, script: SCRIPTS[v] };
  comps[`${comp}:${v}`] ??= await selectComposition({ serveUrl, id: comp, inputProps, logLevel: 'error' });
  const dir = join(OUT, 'stills', comp, v);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `f${String(frame).padStart(3, '0')}.png`);
  await renderStill({ serveUrl, composition: comps[`${comp}:${v}`], frame, output: file, inputProps, logLevel: 'error', overwrite: true });
  done.set(key, file);
  if (++k % 25 === 0) console.log(`  ${k} стиллов, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  return file;
}

const tile = (file, w, label, tmp) => {
  const pt = Math.max(12, Math.round(w / 16));
  spawnSync('magick', [file, '-resize', `${w}x`, '-fill', '#000B', '-draw', `rectangle 0,0 ${w},${pt + 10}`, '-fill', 'yellow', '-font', FONT, '-pointsize', String(pt), '-annotate', `+6+${pt + 3}`, label, tmp]);
  return tmp;
};
const montage = (files, cols, out, title) => {
  const args = ['montage', '-font', FONT, ...files, '-tile', `${cols}x`, '-geometry', '+3+3', '-background', '#111'];
  if (title) args.push('-title', title, '-fill', 'white', '-pointsize', '22');
  spawnSync('magick', [...args, out]);
};
const appendRows = (rows, out) => spawnSync('magick', [...rows, '-background', '#111', '-append', out]);
const TMP = join(OUT, 'tmp');
mkdirSync(TMP, { recursive: true });
let tn = 0;
const tmpFile = () => join(TMP, `t${tn++}.png`);
const W = { '16x9': 400, '9x16': 200 };

// compare: строка = эпизод, слева 3 кадра v3, справа 3 кадра v4
if (!only || only === 'compare') for (const orient of Object.keys(COMPS)) {
  const rows = [];
  for (const e of EPISODES) {
    const tiles = [];
    for (const v of ['v3', 'v4']) for (const m of momentsOf(e)) tiles.push(tile(await still(orient, v, m.f), W[orient], `${v} ${e.label} ${m.what} f${m.f}`, tmpFile()));
    const row = tmpFile();
    montage(tiles, 6, row);
    rows.push(row);
  }
  const out = join(OUT, `compare-${orient}.png`);
  appendRows(rows, out);
  console.log(`  лист ${out}`);
}
// hits: вокруг входа каждой карточки −4…+8, строка v3 и строка v4
if (!only || only === 'hits') for (const orient of Object.keys(COMPS)) for (const h of ['MIA', 'DARK', 'BLOND', 'OFFICER']) {
  const s = items[cardIdx(h)].startFrame;
  const rows = [];
  for (const v of ['v3', 'v4']) {
    const tiles = [];
    for (let d = -4; d <= 8; d++) tiles.push(tile(await still(orient, v, s + d), W[orient] * 0.6, `${v} ${d >= 0 ? '+' : ''}${d} f${s + d}`, tmpFile()));
    const row = tmpFile();
    montage(tiles, 13, row);
    rows.push(row);
  }
  const out = join(OUT, `hits-${NAMES[h]}-${orient}.png`);
  appendRows(rows, out);
  console.log(`  лист ${out}`);
}
// lockCarry (V10:150 → ROOK) и lightMatch (затишье → финал) — v4
const special = [
  { id: 'lockCarry', at: items[cardIdx('DARK')].startFrame, from: -6, to: 8, only: 'carry' },
  { id: 'lightMatch', at: items[lastIdx((p) => p.kind === 'final')].startFrame, from: -12, to: 4, only: 'light' },
];
for (const sp of special) {
  if (only && only !== sp.only) continue;
  for (const orient of Object.keys(COMPS)) {
    const tiles = [];
    for (let d = sp.from; d <= sp.to; d++) tiles.push(tile(await still(orient, 'v4', sp.at + d), W[orient] * 0.6, `v4 ${d >= 0 ? '+' : ''}${d} f${sp.at + d}`, tmpFile()));
    const out = join(OUT, `${sp.id}-${orient}.png`);
    montage(tiles, orient === '16x9' ? 8 : 9, out);
    console.log(`  лист ${out}`);
  }
}
rmSync(TMP, { recursive: true, force: true });
console.log(`готово: ${k} стиллов за ${((Date.now() - t0) / 1000).toFixed(0)} с → ${OUT}`);

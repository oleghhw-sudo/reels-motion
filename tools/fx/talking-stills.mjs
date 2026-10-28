#!/usr/bin/env node
// tools/fx/talking-stills.mjs — листы кадров пилота эффектов говорящей головы (задача 026-А, п. 4).
//   node tools/fx/talking-stills.mjs [--plan videos/talking-fx-pilot/talking-fx.yaml] [--n 8]
// Один bundle, renderStill на кадр (время на кадр — в выводе). На каждый эффект: n кадров по окну (вход, середина,
// ударный кадр figma 0.55·d, уход) + кадр сразу после окна, который сравнивается побайтно с рендером того же кадра
// с пустым планом (разница ≤ 1/255 допустима). Лист → out/talking-fx/<fx>-sheet.jpg, числа → out/talking-fx/stills.json.
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const planFile = opt('--plan', 'videos/talking-fx-pilot/talking-fx.yaml');
const N = Number(opt('--n', '8'));
const FPS = 30;
const plan = parse(readFileSync(join(ROOT, planFile), 'utf8'));
const outDir = join(ROOT, 'out', 'talking-fx');
mkdirSync(join(outDir, 'frames'), { recursive: true });
const gl = process.env.REMOTION_GL ?? 'angle';

const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.ts'), webpackOverride: (c) => ({ ...c, module: { ...c.module, rules: [...(c.module?.rules ?? []), { test: /\.ya?ml$/, type: 'asset/source' }] } }) });
console.log(`bundle: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
const compFor = (p) => selectComposition({ serveUrl, id: 'TalkingFxLab', inputProps: { matteId: p.matteId, plan: p }, chromiumOptions: { gl } });
const comp = await compFor(plan);
const emptyPlan = { ...plan, effects: [] };
const compEmpty = await compFor(emptyPlan);
const times = [];
const still = async (c, props, frame, file) => {
  const s = Date.now();
  await renderStill({ composition: c, serveUrl, output: file, frame, inputProps: props, imageFormat: 'png', chromiumOptions: { gl } });
  times.push((Date.now() - s) / 1000);
};
const diff = (a, b) => {
  // максимальная и средняя разница по пикселям через ffmpeg (blend difference → signalstats)
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-filter_complex', '[0][1]blend=all_mode=difference,format=gray,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const max = Number(/lavfi\.signalstats\.YMAX=(\d+)/.exec(r.stdout + r.stderr)?.[1] ?? -1);
  const avg = Number(/lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout + r.stderr)?.[1] ?? -1);
  return { max, avg };
};
const report = { plan: planFile, matteId: plan.matteId, sheets: [], secPerStill: 0 };
for (const e of plan.effects) {
  const f0 = Math.round(e.t0 * FPS), f1 = Math.round(e.t1 * FPS); // окно: кадры f0 … f1−1
  const picks = new Set(Array.from({ length: N }, (_, k) => f0 + Math.round(((k + 0.5) * (f1 - f0)) / N) - (k === 0 ? Math.round(((0.5) * (f1 - f0)) / N) : 0)));
  picks.add(f0); picks.add(f1 - 1);
  if (e.fx === 'figma') picks.add(f0 + Math.round(0.55 * (f1 - f0)) + 2); // ударное слово: растяжение началось
  const frames = [...picks].sort((a, b) => a - b).slice(0, N + 2);
  const files = [];
  for (const fr of frames) { const file = join(outDir, 'frames', `${e.fx}-${fr}.png`); await still(comp, { matteId: plan.matteId, plan }, fr, file); files.push(file); }
  // кадр после окна: с планом и с пустым планом
  const after = f1;
  const a = join(outDir, 'frames', `${e.fx}-after-${after}.png`), b = join(outDir, 'frames', `${e.fx}-after-${after}-plain.png`);
  await still(comp, { matteId: plan.matteId, plan }, after, a);
  await still(compEmpty, { matteId: plan.matteId, plan: emptyPlan }, after, b);
  const d = diff(a, b);
  const same = spawnSync('cmp', ['-s', a, b]).status === 0;
  // лист: кадры окна + кадр после (с подписью через tile невозможна без drawtext — порядок = время, номера в stills.json)
  const sheet = join(outDir, `${e.fx}-sheet.jpg`);
  const ins = [...files, a].flatMap((f) => ['-i', f]);
  const n = files.length + 1;
  spawnSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', `${Array.from({ length: n }, (_, i) => `[${i}]scale=270:480[s${i}]`).join(';')};${Array.from({ length: n }, (_, i) => `[s${i}]`).join('')}hstack=inputs=${n}`, '-q:v', '3', sheet]);
  report.sheets.push({ fx: e.fx, t0: e.t0, t1: e.t1, frames, afterFrame: after, afterIdentical: same, afterDiff: d, sheet: sheet.slice(ROOT.length + 1) });
  console.log(`✓ ${e.fx}: кадры ${frames.join(', ')} + после окна ${after} (${same ? 'побайтно = исходник' : `разница max ${d.max}/255, средняя ${d.avg}`}) → ${sheet.slice(ROOT.length + 1)}`);
}
report.secPerStill = Math.round((times.reduce((x, y) => x + y, 0) / times.length) * 100) / 100;
report.stills = times.length;
writeFileSync(join(outDir, 'stills.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`stills: ${times.length}, в среднем ${report.secPerStill} с на кадр (min ${Math.min(...times).toFixed(2)}, max ${Math.max(...times).toFixed(2)})`);
process.exit(0);

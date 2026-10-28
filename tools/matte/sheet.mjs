#!/usr/bin/env node
// tools/matte/sheet.mjs — лист кадров для проверки маски глазами (задача 025, п. 7).
//   npm run matte:sheet -- --id <id> [--n 12] [--gain 2]
//   npm run matte:sheet -- --compare <id1,id2,...> --out <name>   → листы каждого id, сложенные в столбик: out/<name>/compare.jpg
// → out/<id>/matte/sheet.jpg: верхняя полоса — N кадров источника (кроп 9:16), маска поверх красным 40 %, рамка лица
//   (зелёная — Vision, жёлтая — по силуэту, серая — hold); нижняя полоса — |m_t − m_{t−1}| (×gain) — мерцание видно глазом.
//   Подписи: номер кадра, источник лицa, средняя разница с прошлым кадром (‰ от полной). Плюс sheet.json с числами по всем кадрам.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const die = (m) => { console.error(`matte:sheet: ${m}`); process.exit(1); };
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const compareIds = opt('--compare');
if (compareIds) {
  const outName = opt('--out'); if (!outName) die('--compare: нужен --out <name>');
  const ids = compareIds.split(',').filter(Boolean);
  const sheets = ids.map((cid) => { const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--id', cid, '--n', opt('--n', '12'), '--gain', opt('--gain', '2')], { encoding: 'utf8', env: process.env }); if (r.status !== 0) die(`лист ${cid}: ${r.stderr}`); process.stdout.write(r.stdout.split('\n')[0] + '\n'); return join(ROOT, 'out', cid, 'matte', 'sheet.jpg'); });
  mkdirSync(join(ROOT, 'out', outName), { recursive: true });
  const args = ['-v', 'error', '-y', ...sheets.flatMap((f) => ['-i', f]), '-filter_complex', `vstack=inputs=${sheets.length}`, '-q:v', '3', join(ROOT, 'out', outName, 'compare.jpg')];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' }); if (r.status !== 0) die(`ffmpeg vstack: ${r.stderr}`);
  console.log(`✓ out/${outName}/compare.jpg: ${ids.join(' / ')} (сверху вниз; подпись каждого листа — в его первой строке)`);
  process.exit(0);
}
const id = opt('--id');
if (!id) die('использование: npm run matte:sheet -- --id <id> [--n 12] [--gain 2] | --compare id1,id2 --out name');
const N = Number(opt('--n', '12'));
const GAIN = Number(opt('--gain', '2'));
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1');
const MATTE_DIR = fromEnv('MATTE_DIR');
if (!MATTE_DIR) die('MATTE_DIR не задан (окружение или .env)');
const dir = join(MATTE_DIR, id);
const man = JSON.parse(readFileSync(join(dir, 'matte.json'), 'utf8'));
const face = JSON.parse(readFileSync(join(dir, 'face.json'), 'utf8'));
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { maxBuffer: 1 << 30 });
  if (r.status !== 0) die(`${cmd} ${a.join(' ').slice(0, 200)}…\n${r.stderr.toString().slice(-1500)}`);
  return r.stdout;
};
const TW = 270, TH = 480, GAP = 4, LAB = 26, TITLE = 26;
const total = man.outputs['matte.mp4'].frames;
// все кадры маски в 270×480 (разница соседних кадров — по всем кадрам)
const masks = run('ffmpeg', ['-v', 'error', '-i', join(dir, 'matte.mp4'), '-vf', `scale=${TW}:${TH}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
const nm = Math.floor(masks.length / (TW * TH));
if (nm !== total) console.warn(`  ⚠ кадров в matte.mp4: ${nm}, в манифесте ${total}`);
const frameMask = (i) => masks.subarray(i * TW * TH, (i + 1) * TW * TH);
const diffs = [0];
for (let i = 1; i < nm; i++) { const a = frameMask(i - 1), b = frameMask(i); let s = 0; for (let p = 0; p < TW * TH; p++) s += Math.abs(a[p] - b[p]); diffs.push(s / (TW * TH * 255)); }
const idx = Array.from({ length: N }, (_, k) => Math.min(nm - 1, Math.max(1, Math.round(((k + 0.5) * nm) / N))));
// кадры источника (тот же кроп/масштаб/fps=30, что в matte.mjs)
const { crop, file, from, to } = man.source;
const sel = idx.map((i) => `eq(n\\,${i})`).join('+');
const srcArgs = ['-v', 'error'];
if (from) srcArgs.push('-ss', String(from));
srcArgs.push('-t', String(to - from), '-i', file, '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=1080:1920,fps=30,select='${sel}',scale=${TW}:${TH}`, '-vsync', '0', '-frames:v', String(N), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
const src = run('ffmpeg', srcArgs);
if (src.length < N * TW * TH * 3) die(`источник дал ${Math.floor(src.length / (TW * TH * 3))} кадров из ${N}`);

const W = N * (TW + GAP) - GAP, H = TITLE + TH * 2 + LAB * 2 + GAP;
const img = Buffer.alloc(W * H * 3, 20);
const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
const rows = [];
idx.forEach((i, k) => {
  const x0 = k * (TW + GAP), y0 = TITLE + LAB, y1 = TITLE + LAB + TH + GAP + LAB;
  const m = frameMask(i), mp = frameMask(i - 1);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const p = y * TW + x, s = (k * TW * TH + p) * 3, a = (m[p] / 255) * 0.4;
    put(x0 + x, y0 + y, Math.round(src[s] * (1 - a) + 255 * a), Math.round(src[s + 1] * (1 - a)), Math.round(src[s + 2] * (1 - a)));
    const d = Math.min(255, Math.abs(m[p] - mp[p]) * GAIN);
    put(x0 + x, y1 + y, d, d, d);
  }
  // face.json идёт по кадрам источника (fps источника), matte.mp4 — 30 fps: ищем ближайший по времени
  const tt = i / 30;
  const f = face.frames.reduce((best, c) => (Math.abs(c.t - tt) < Math.abs(best.t - tt) ? c : best), face.frames[0]);
  if (f && f.source !== 'none' && f.w > 0) {
    const col = f.source === 'vision' ? [0, 230, 90] : f.source === 'silhouette' ? [255, 210, 0] : [160, 160, 160];
    const cx = f.cx / 4, cy = f.cy / 4, hw = f.w / 8, hh = (f.w * 1.25) / 8;
    for (let x = Math.round(cx - hw); x <= cx + hw; x++) for (const yy of [cy - hh, cy - hh + 1, cy + hh, cy + hh - 1]) put(x0 + x, y0 + Math.round(yy), ...col);
    for (let y = Math.round(cy - hh); y <= cy + hh; y++) for (const xx of [cx - hw, cx - hw + 1, cx + hw, cx + hw - 1]) put(x0 + Math.round(xx), y0 + y, ...col);
  }
  rows.push({ i, t: tt, source: f?.source ?? '?', diff: Math.round(diffs[i] * 10000) / 10000 });
});
// подписи: свой растровый шрифт 5×7 (в ffmpeg из brew нет drawtext/freetype)
const GL = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'], ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'], 'f': ['00110', '01001', '01000', '11100', '01000', '01000', '01000'],
  's': ['00000', '00000', '01110', '10000', '01110', '00001', '11110'], 'v': ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
  'i': ['00100', '00000', '01100', '00100', '00100', '00100', '01110'], 'o': ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  'n': ['00000', '00000', '10110', '11001', '10001', '10001', '10001'], 'l': ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  'h': ['10000', '10000', '10110', '11001', '10001', '10001', '10001'], 'u': ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  'e': ['00000', '00000', '01110', '10001', '11111', '10000', '01110'], 't': ['01000', '01000', '11100', '01000', '01000', '01001', '00110'],
  'd': ['00001', '00001', '01101', '10011', '10001', '10001', '01111'], 'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'a': ['00000', '00000', '01110', '00001', '01111', '10001', '01111'], 'b': ['10000', '10000', '10110', '11001', '10001', '10001', '11110'],
  'c': ['00000', '00000', '01110', '10000', '10000', '10001', '01110'], 'g': ['00000', '00000', '01111', '10001', '01111', '00001', '01110'],
  'j': ['00010', '00000', '00110', '00010', '00010', '10010', '01100'], 'k': ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  'm': ['00000', '00000', '11010', '10101', '10101', '10001', '10001'], 'p': ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
  'q': ['00000', '00000', '01111', '10001', '01111', '00001', '00001'], 'r': ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  'w': ['00000', '00000', '10001', '10001', '10101', '10101', '01010'], 'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  'y': ['00000', '00000', '10001', '10001', '01111', '00001', '01110'], 'z': ['00000', '00000', '11111', '00010', '00100', '01000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'], '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'], ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
};
const text = (x, y, str, sc = 2, col = [255, 255, 255]) => {
  let cx = x;
  for (const ch of str) {
    const g = GL[ch] ?? GL[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '1') for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) put(cx + c * sc + dx, y + r * sc + dy, ...col);
    cx += 6 * sc;
  }
};
rows.forEach((r, k) => {
  text(k * (TW + GAP) + 4, TITLE + 5, `f${r.i} ${r.t.toFixed(2)}s ${r.source}`);
  text(k * (TW + GAP) + 4, TITLE + LAB + TH + GAP + 5, `D ${(r.diff * 1000).toFixed(1)} %o`);
});
const paramStr = Object.entries(man.params ?? {}).map(([k, v]) => `${k} ${v}`).join(' ');
text(4, 5, `${id} ${man.engine ?? ''} ${paramStr} ${man.selfCheck ? `flicker ${man.selfCheck.flickerFramePermille} jump ${man.selfCheck.areaJumpMax}` : ''}`.toLowerCase().replace(/[^0-9a-z .%,:_-]/g, ' '), 2, [255, 230, 120]);
const outDir = join(ROOT, 'out', id, 'matte');
mkdirSync(outDir, { recursive: true });
const ppm = join(outDir, 'sheet.ppm');
writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), img]));
run('ffmpeg', ['-v', 'error', '-y', '-i', ppm, '-q:v', '3', join(outDir, 'sheet.jpg')]);
spawnSync('rm', ['-f', ppm]);
const meanDiff = diffs.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, nm - 1);
const maxDiff = Math.max(...diffs);
const srcCounts = {};
for (const f of face.frames) srcCounts[f.source] = (srcCounts[f.source] ?? 0) + 1;
writeFileSync(join(outDir, 'sheet.json'), JSON.stringify({ id, engine: man.engine, frames: nm, picked: rows, diffMeanAll: meanDiff, diffMaxAll: maxDiff, diffMaxFrame: diffs.indexOf(maxDiff), faceSources: srcCounts, diffs: diffs.map((d) => Math.round(d * 10000) / 10000) }, null, 1) + '\n');
console.log(`✓ ${join('out', id, 'matte', 'sheet.jpg')} (${W}×${H}); ${man.engine}; кадров ${nm}; |Δ| соседних кадров: среднее ${(meanDiff * 1000).toFixed(2)}‰, максимум ${(maxDiff * 1000).toFixed(1)}‰ на кадре ${diffs.indexOf(maxDiff)}; лицо ${JSON.stringify(srcCounts)}`);
console.log(rows.map((r) => `  f${r.i}\t${r.t.toFixed(2)}s\t${r.source}\tΔ${(r.diff * 1000).toFixed(1)}‰`).join('\n'));

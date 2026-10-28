#!/usr/bin/env node
// tools/matte/calibrate.mjs — метрики маски против правды (задача 025, калибровка).
//   npm run matte:calibrate -- --truth <id-правды> --test <id> [--band 8] [--still 0.02] [--hole 0.005]
//       на кадр: IoU (порог 127); ошибка по краю — средняя |test − truth| в полосе ±band px вокруг контура правды;
//       flickerEdge — средняя |m_t − m_{t−1}| в той же полосе по всем кадрам; flickerEdgeQuiet — то же на кадрах, где правда почти не меняется
//       (доля изменившихся пикселей правды < still от её площади); дыра в торсе — компонента фона теста внутри его
//       силуэта площадью > hole от кадра (на 360×640), где по правде человек; скорость — renderSecPerSec из matte.json.
//       → MATTE_DIR/_calibration/<test>.json и строка таблицы.
//   npm run matte:calibrate -- --table              сводная таблица всех сравнений из MATTE_DIR/_calibration
//   npm run matte:calibrate -- --empty <id>        видео без человека: маска пустая (площадь > 127 нигде не больше 0,5 % кадра), лицо hold|none
//   npm run matte:calibrate -- --self-test-dup   позитивный контроль исключения дублей кадров 25→30 fps в selfCheck (026-А)
//   npm run matte:calibrate -- --self-test --truth <id>   позитивный контроль (гейт 4): правда, сдвинутая на 20 px,
//       как «тест» ОБЯЗАНА уронить IoU ниже 0.95 — процесс завершается кодом 1 (как и должен)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selfCheckFrom, sourceFrameOf } from './selfcheck.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const die = (m) => { console.error(`matte:calibrate: ${m}`); process.exit(1); };
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1');
const MATTE_DIR = fromEnv('MATTE_DIR');
if (!MATTE_DIR) die('MATTE_DIR не задан (окружение или .env)');
const BAND = Number(opt('--band', '8')), STILL = Number(opt('--still', '0.02')), HOLE = Number(opt('--hole', '0.005'));
const W = 1080, H = 1920, NPX = W * H;
const IOU_MIN = 0.95;

const decode = (id) => {
  const f = join(MATTE_DIR, id, 'matte.mp4');
  if (!existsSync(f)) die(`нет ${f}`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) die(`ffmpeg: ${r.stderr}`);
  return r.stdout;
};
const manifest = (id) => JSON.parse(readFileSync(join(MATTE_DIR, id, 'matte.json'), 'utf8'));

// --- морфология: квадратная дилатация радиуса r (разделимый max), на Uint8Array 0/1
const dilate = (src, r, w = W, h = H) => {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w; let cnt = 0;
    for (let x = -r; x < w; x++) { if (x + r < w && src[row + x + r]) cnt++; if (x - r - 1 >= 0 && src[row + x - r - 1]) cnt--; if (x >= 0) tmp[row + x] = cnt > 0 ? 1 : 0; }
  }
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = -r; y < h; y++) { if (y + r < h && tmp[(y + r) * w + x]) cnt++; if (y - r - 1 >= 0 && tmp[(y - r - 1) * w + x]) cnt--; if (y >= 0) out[y * w + x] = cnt > 0 ? 1 : 0; }
  }
  return out;
};
const binarize = (buf, off, inv = false) => { const b = new Uint8Array(NPX); for (let i = 0; i < NPX; i++) b[i] = (buf[off + i] > 127) !== inv ? 1 : 0; return b; };

// --- дыры: компоненты фона теста внутри его силуэта (360×640, шаг 3), площадь > HOLE кадра, и при этом по правде
//     там человек (≥ 50 % пикселей компоненты) — щель между рукой и телом дырой не считается
const holes = (buf, off, truthBuf, offT) => {
  const w = 360, h = 640, n = w * h;
  const fg = new Uint8Array(n), tf = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = off + (y * 3) * W + x * 3; fg[y * w + x] = buf[q] > 127 ? 1 : 0; tf[y * w + x] = truthBuf[offT + (y * 3) * W + x * 3] > 127 ? 1 : 0; }
  const seen = new Uint8Array(n); // фон, достижимый с рамки
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) { const p = stack.pop(); if (seen[p] || fg[p]) continue; seen[p] = 1; const x = p % w, y = (p - x) / w; if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1); if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w); }
  let biggest = 0;
  for (let p0 = 0; p0 < n; p0++) {
    if (seen[p0] || fg[p0]) continue;
    let area = 0, inTruth = 0; const st = [p0]; seen[p0] = 1;
    while (st.length) { const p = st.pop(); area++; inTruth += tf[p]; const x = p % w, y = (p - x) / w; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !seen[q] && !fg[q]) { seen[q] = 1; st.push(q); } }
    if (inTruth * 2 >= area && area > biggest) biggest = area;
  }
  return biggest / n;
};

const compare = (truthBuf, testBuf, label) => {
  const nT = Math.floor(truthBuf.length / NPX), nS = Math.floor(testBuf.length / NPX);
  const n = Math.min(nT, nS);
  if (nT !== nS) console.warn(`  ⚠ кадров: правда ${nT}, тест ${nS} — сравниваю первые ${n}`);
  const per = [];
  let prevTruth = null, prevTest = null;
  for (let i = 0; i < n; i++) {
    const oT = i * NPX, oS = i * NPX;
    const tb = binarize(truthBuf, oT), sb = binarize(testBuf, oS);
    let inter = 0, uni = 0, areaT = 0;
    for (let p = 0; p < NPX; p++) { if (tb[p] & sb[p]) inter++; if (tb[p] | sb[p]) uni++; areaT += tb[p]; }
    const iou = uni ? inter / uni : 1;
    const dIn = dilate(tb, BAND), dOut = dilate(binarize(truthBuf, oT, true), BAND);
    let bandN = 0, edgeErr = 0, flick = 0;
    for (let p = 0; p < NPX; p++) if (dIn[p] && dOut[p]) { bandN++; edgeErr += Math.abs(testBuf[oS + p] - truthBuf[oT + p]); if (prevTest !== null) flick += Math.abs(testBuf[oS + p] - prevTest[p]); }
    let still = null;
    if (prevTruth) { let ch = 0; for (let p = 0; p < NPX; p++) if (tb[p] !== prevTruth[p]) ch++; still = areaT ? ch / areaT < STILL : false; }
    const hole = holes(testBuf, oS, truthBuf, oT);
    per.push({ i, iou, edge: bandN ? edgeErr / bandN / 255 : 0, flicker: prevTest !== null && bandN ? flick / bandN / 255 : null, still, hole, holeFrame: hole > HOLE, bandN, areaT: areaT / NPX });
    prevTruth = tb; prevTest = testBuf.subarray(oS, oS + NPX);
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const stillFrames = per.filter((p) => p.still && p.flicker !== null);
  const r = {
    label, frames: n,
    iouMean: mean(per.map((p) => p.iou)), iouMin: Math.min(...per.map((p) => p.iou)), iouP10: [...per.map((p) => p.iou)].sort((a, b) => a - b)[Math.floor(n * 0.1)],
    edgeMean: mean(per.map((p) => p.edge)),
    flickerEdgeQuiet: mean(stillFrames.map((p) => p.flicker)), quietFrames: stillFrames.length,
    flickerEdge: mean(per.filter((p) => p.flicker !== null).map((p) => p.flicker)),
    holeFrames: per.filter((p) => p.holeFrame).length, holeFrac: per.filter((p) => p.holeFrame).length / n, holeMax: Math.max(...per.map((p) => p.hole)),
    params: { band: BAND, still: STILL, hole: HOLE },
  };
  return { summary: r, per };
};
const fmt = (x, d = 3) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));
const row = (s, extra = '') => `| ${s.label} | ${fmt(s.iouMean)} | ${fmt(s.iouMin)} | ${fmt(s.edgeMean)} | ${fmt(s.flickerEdgeQuiet, 4)} (${s.quietFrames} к.) | ${fmt(s.flickerEdge, 4)} | ${s.holeFrames}/${s.frames} | ${extra} |`;

if (flag('--table')) {
  // сводная таблица по всем MATTE_DIR/_calibration/*.json (сортировка по имени теста)
  const dir = join(MATTE_DIR, '_calibration');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  console.log('| тест | движок | IoU ср. | IoU мин. | край | flickerEdgeQuiet (тихих к.) | flickerEdge | дыры | с/с (справка) |');
  for (const f of files) { const { summary: s } = JSON.parse(readFileSync(join(dir, f), 'utf8')); console.log(`| ${s.label} | ${s.engine} | ${fmt(s.iouMean)} | ${fmt(s.iouMin)} | ${fmt(s.edgeMean)} | ${fmt(s.flickerEdgeQuiet, 4)} (${s.quietFrames}) | ${fmt(s.flickerEdge, 4)} | ${s.holeFrames}/${s.frames} | ${s.renderSecPerSec} |`); }
  process.exit(0);
}
if (flag('--self-test-dup')) {
  // Позитивный контроль (026-А п. 1): синтетика 25 fps из двух чередующихся масок → fps=30 → без исключения дублей есть
  // «нулевые» пары (дубль кадра), с исключением по исходным кадрам — ни одной. Падает (exit 1), если исключение не работает.
  const tmp = join(MATTE_DIR, '_cal', 'synthetic-dup.mp4');
  mkdirSync(join(MATTE_DIR, '_cal'), { recursive: true });
  const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'nullsrc=s=270x480:r=25:d=2', '-vf', "format=gray,geq=lum='if(mod(N\\,2)\\,255*gt(X\\,W/2)\\,255*lt(X\\,W/2))',fps=30", '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', tmp], { encoding: 'utf8' });
  if (g.status !== 0) die(`ffmpeg синтетика: ${g.stderr}`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', tmp, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 2 ** 31 });
  const TW = 270, TH = 480, n = Math.floor(r.stdout.length / (TW * TH));
  const zeroPairs = (srcFps) => { let z = 0, used = 0; for (let i = 1; i < n; i++) { if (sourceFrameOf(i, srcFps) === sourceFrameOf(i - 1, srcFps)) continue; used++; let d = 0; for (let p = 0; p < TW * TH; p++) d += Math.abs(r.stdout[i * TW * TH + p] - r.stdout[(i - 1) * TW * TH + p]); if (d / (TW * TH * 255) < 0.001) z++; } return { z, used }; };
  const without = zeroPairs(30), withEx = zeroPairs(25);
  const a = selfCheckFrom(r.stdout, TW, TH, 30), b = selfCheckFrom(r.stdout, TW, TH, 25);
  console.log(`ПОЗИТИВНЫЙ КОНТРОЛЬ дублей: синтетика 25 fps (2 чередующиеся маски) → 30 fps, ${n} кадров.`);
  console.log(`  без исключения (как 30 fps): нулевых пар ${without.z} из ${without.used}, flickerFramePermille ${a.flickerFramePermille}`);
  console.log(`  с исключением по исходным кадрам (25 fps): нулевых пар ${withEx.z} из ${withEx.used} (пропущено дублей ${b.pairsSkipped}), flickerFramePermille ${b.flickerFramePermille}`);
  const ok = without.z > 0 && withEx.z === 0 && b.flickerFramePermille > a.flickerFramePermille;
  console.log(ok ? 'OK: дубли найдены без исключения и полностью исключены по исходным кадрам' : 'ПРОВАЛ: исключение дублей не работает');
  process.exit(ok ? 0 : 1);
}
if (flag('--self-test')) {
  const tid = opt('--truth'); if (!tid) die('--self-test: нужен --truth <id>');
  const truth = decode(tid);
  const n = Math.min(10, Math.floor(truth.length / NPX));
  const shifted = Buffer.alloc(n * NPX);
  for (let i = 0; i < n; i++) for (let y = 0; y < H; y++) { const o = i * NPX + y * W; truth.copy(shifted, o + 20, o, o + W - 20); }
  const { summary } = compare(truth.subarray(0, n * NPX), shifted, `${tid} сдвиг 20 px`);
  console.log(`ПОЗИТИВНЫЙ КОНТРОЛЬ: правда ${tid} против себя же со сдвигом 20 px (${n} кадров): IoU средний ${fmt(summary.iouMean)}, порог ${IOU_MIN}`);
  if (summary.iouMean < IOU_MIN) { console.log(`сдвиг пойман (IoU ${fmt(summary.iouMean)} < ${IOU_MIN}), проверка упала — как и должна. exit 1`); process.exit(1); }
  console.log(`ОШИБКА КОНТРОЛЯ: сдвиг на 20 px не уронил IoU ниже ${IOU_MIN} — метрика слепа`); process.exit(2);
}
if (opt('--empty')) {
  const id = opt('--empty');
  const buf = decode(id);
  const n = Math.floor(buf.length / NPX);
  let maxV = 0, maxArea = 0;
  for (let i = 0; i < n; i++) { let area = 0; for (let p = 0; p < NPX; p++) { const v = buf[i * NPX + p]; if (v > maxV) maxV = v; if (v > 127) area++; } if (area > maxArea) maxArea = area; }
  const face = JSON.parse(readFileSync(join(MATTE_DIR, id, 'face.json'), 'utf8'));
  const src = {}; for (const f of face.frames) src[f.source] = (src[f.source] ?? 0) + 1;
  // лицо не висит без человека (025-Б п. 2): hold допустим не дольше noneAfter кадров после каждой потери маски
  const noneAfter = Math.round(0.5 * face.fps); // допуск по правилу (0,5 с), не из face.json — иначе подмена --none-after не ловится
  let holdRun = 0, holdRunMax = 0;
  for (const f of face.frames) { holdRun = f.source === 'hold' ? holdRun + 1 : 0; if (holdRun > holdRunMax) holdRunMax = holdRun; }
  const holdOk = holdRunMax <= noneAfter;
  const at = (i) => face.frames[i]?.source ?? '—';
  const reasons = [];
  if (maxArea / NPX >= 0.005) reasons.push('ложная фигура (маска > 0,5 % кадра)');
  if (!Object.keys(src).every((s) => s === 'hold' || s === 'none')) reasons.push('ложное лицо (vision|silhouette)');
  if (!holdOk) reasons.push(`лицо висит (hold ${holdRunMax} кадров > допуска ${noneAfter})`);
  const ok = reasons.length === 0;
  console.log(`${id}: кадров ${n}; максимум маски ${maxV}/255, максимальная площадь >127: ${(maxArea / NPX * 100).toFixed(3)} % кадра; лицо ${JSON.stringify(src)}; самый длинный hold ${holdRunMax} кадров (допуск ${noneAfter}); source на кадрах 31/106: ${at(31)}/${at(106)} → ${ok ? 'OK: пусто, ложной фигуры нет, лицо не висит' : `ПРОВАЛ: ${reasons.join('; ')}`}`);
  process.exit(ok ? 0 : 1);
}
const tid = opt('--truth'), sid = opt('--test');
if (!tid || !sid) die('использование: --truth <id> --test <id> | --empty <id> | --self-test --truth <id>');
const { summary, per } = compare(decode(tid), decode(sid), sid);
const man = manifest(sid);
summary.engine = man.engine; summary.params = { ...summary.params, ...man.params }; summary.renderSecPerSec = man.renderSecPerSec; summary.truth = tid;
summary.pass = { iou: summary.iouMean >= IOU_MIN, holes: summary.holeFrames === 0 }; // критерий скорости снят (025-Б п. 1), с/с — справка
mkdirSync(join(MATTE_DIR, '_calibration'), { recursive: true });
writeFileSync(join(MATTE_DIR, '_calibration', `${sid}.json`), JSON.stringify({ summary, per }, null, 1) + '\n');
console.log('| тест | IoU ср. | IoU мин. | край | flickerEdgeQuiet (тихих к.) | flickerEdge | дыры | с/с (справка) |');
console.log(row(summary, `${man.renderSecPerSec} (${man.engine})`));

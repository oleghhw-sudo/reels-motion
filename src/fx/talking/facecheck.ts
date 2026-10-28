// src/fx/talking/facecheck.ts — проверка «графика не на лице» по настоящему face.json (задача 026-А, п. 4) — числа для отчёта.
//   MATTE_DIR=… node --experimental-strip-types --no-warnings src/fx/talking/facecheck.ts [videos/talking-fx-pilot/talking-fx.yaml]
// То же, что делает calculateMetadata лаборатории (checkFace): bignum — лицо на каждом кадре окна; figma/lens — 0 пересечений.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadFace } from '../../matte/face.ts';
import { boxOf } from './effects.ts';
import { checkFace, parsePlan } from './plan.ts';

const planFile = process.argv[2] ?? 'videos/talking-fx-pilot/talking-fx.yaml';
const envText = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const MATTE_DIR = process.env.MATTE_DIR ?? envText.match(/^MATTE_DIR=(.+)$/m)?.[1]?.trim();
if (!MATTE_DIR) { console.error('MATTE_DIR не задан'); process.exit(1); }
const plan = parsePlan(parse(readFileSync(planFile, 'utf8')));
const face = loadFace(JSON.parse(readFileSync(join(MATTE_DIR, plan.matteId, 'face.json'), 'utf8')));
try {
  const rows = checkFace(plan, face, 30, boxOf);
  console.log(`| эффект | кадров в окне | без лица | пересечений с лицом | мин. зазор, px |\n|---|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.fx} | ${r.frames} | ${r.noFace} | ${r.overlaps} | ${r.minGap} |`);
  console.log('OK: план проходит проверку лица');
} catch (e) { console.error(`ОТКАЗ: ${(e as Error).message}`); process.exit(1); }

#!/usr/bin/env node
// Проверка запретных зон аутро MIA до сборки: ни один показанный кадр исходника не попадает в зону outro.yaml forbidden
// или в excluded из shots.json. Та же функция (src/videos/mia-outro/model.ts) вызывается в композиции — сборка падает так же.
//   node --experimental-strip-types videos/mia-outro/check-zones.mjs [--episode ep01] [--inject V10:6.5-7.0]
// --inject — позитивный контроль (гейт 4): подложенный интервал ОБЯЗАН уронить проверку.
// shots.json читается из MIA_SHORT_DIR (env.manifest.json → data_dirs; окружение или .env), путь не зашит.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { assertZones, buildTimeline, parseInjected, parseOutro, zonesFrom, zonesFromShots } from '../../src/videos/mia-outro/model.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const DIR = process.env.MIA_SHORT_DIR ?? envText.match(/^MIA_SHORT_DIR=(.+)$/m)?.[1]?.trim();
if (!DIR) { console.error('ОТКАЗ: MIA_SHORT_DIR не задан (env.manifest.json → data_dirs; npm run check -- --scope mia-outro)'); process.exit(2); }
const shotsPath = join(DIR, '_outro-analysis', 'shots.json');
if (!existsSync(shotsPath)) { console.error(`ОТКАЗ: нет ${shotsPath}`); process.exit(2); }

const episode = opt('--episode') ?? 'ep01';
const outro = parseOutro(parse(readFileSync(join(ROOT, 'videos', 'mia-outro', 'outro.yaml'), 'utf8')));
const tl = buildTimeline(outro, episode);
const injected = argv.flatMap((a, i) => (a === '--inject' ? [parseInjected(argv[i + 1])] : []));
const zones = zonesFrom(outro, zonesFromShots(JSON.parse(readFileSync(shotsPath, 'utf8'))), injected);
console.log(`${episode}: ${tl.items.length} пунктов, ${tl.durationInFrames} кадров (${tl.durationSec.toFixed(3)} с @ ${tl.fps} fps); зон: ${zones.length} (outro.yaml ${outro.forbidden.length}, shots.json ${zones.length - outro.forbidden.length - injected.length}, подложено ${injected.length})`);
for (const p of tl.items) console.log(`  [${String(p.index).padStart(2)}] ${p.kind.padEnd(5)} f${String(p.startFrame).padStart(3)}–${String(p.endFrame - 1).padStart(3)}  ${p.srcFrames ? `${p.srcFrames.src} f${p.srcFrames.from}–${p.srcFrames.to}` : ''}${p.hit ? `  удар h${p.hit}` : ''}`);
try {
  const r = assertZones(tl, zones);
  for (const a of r.allowed) console.log(`  · ${a}`);
  console.log(`OK: ни один кадр не задевает запретные зоны`);
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}

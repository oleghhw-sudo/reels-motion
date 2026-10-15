#!/usr/bin/env node
// Калибровка украинского голоса Fish Audio (задача 002).
//   node --env-file=.env voice/calibrate.mjs --list
//     → до 12 голосов с language=uk (по task_count) → out/voice/candidates.json.
//   node --env-file=.env voice/calibrate.mjs --list --only-uk
//     → 15 голосов ТОЛЬКО с languages == ["uk"], sort_by=score → out/voice/candidates-uk.json (ревью 002-A).
// В обоих режимах голоса политиков исключаются (CLAUDE.md «Голос», voice/politicians.mjs) и печатаются отдельно.
// Только GET /model — бесплатно. Дальше Олег слушает на сайте и вписывает 3 id в voice/calibration.json
// (поле voices). Этот файл создаёт человек; скрипт его НЕ пишет (гейт 5).
//   node --env-file=.env voice/calibrate.mjs --run
//     → часть Б: голоса из voice/calibration.json × 6 фраз, только s2.1-pro-free (voice/run.mjs):
//       out/voice/<slug>/<n>.wav + <n>.words.json, out/voice/metrics.json, report.md, listen.html.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FishError, listVoices } from './fish.mjs';
import { excludePoliticians } from './politicians.mjs';
import { run } from './run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'out', 'voice');
const LANGUAGE = 'uk';

const MODES = {
  all: { limit: 12, sortBy: 'task_count', pageSize: 12, maxPages: 1, file: 'candidates.json', keep: () => true, label: `language=${LANGUAGE}` },
  onlyUk: {
    limit: 15,
    sortBy: 'score',
    pageSize: 100,
    maxPages: 20,
    file: 'candidates-uk.json',
    keep: (v) => v.languages.length === 1 && v.languages[0] === LANGUAGE,
    label: `languages == ["${LANGUAGE}"]`,
  },
};

async function list(mode) {
  console.log(`FISH_API_KEY ${process.env.FISH_API_KEY ? 'задан' : 'НЕ задан'}`);
  const kept = [];
  const excluded = [];
  let total = 0;
  let scanned = 0;
  let pages = 0;
  for (let page = 1; page <= mode.maxPages && kept.length < mode.limit; page++) {
    const r = await listVoices({ language: LANGUAGE, pageSize: mode.pageSize, page, sortBy: mode.sortBy });
    total = r.total;
    pages = page;
    scanned += r.items.length;
    const split = excludePoliticians(r.items.filter(mode.keep));
    excluded.push(...split.excluded);
    for (const v of split.kept) if (kept.length < mode.limit) kept.push(v);
    if (r.items.length < mode.pageSize) break;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, mode.file);
  const query = { language: LANGUAGE, sort_by: mode.sortBy, page_size: mode.pageSize, pages, filter: mode.label };
  writeFileSync(
    file,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'GET https://api.fish.audio/model', query, total, scanned, voices: kept, excludedPoliticians: excluded }, null, 2)}\n`,
  );
  console.log(`Каталог language=${LANGUAGE}: ${total}; просмотрено ${scanned} (${pages} стр., sort_by=${mode.sortBy}); фильтр ${mode.label}; показано ${kept.length}\n`);
  kept.forEach((v, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${v.title}  ·  автор ${v.author ?? '—'}  ·  задач ${v.taskCount}  ·  языки ${v.languages.join(',') || '—'}`);
    console.log(`    id ${v.id}  ·  ${v.url}`);
    if (v.tags.length) console.log(`    теги: ${v.tags.join(', ')}`);
  });
  console.log(`\nИсключено как голоса политиков: ${excluded.length}`);
  for (const v of excluded) console.log(`  ✗ ${v.title}  ·  автор ${v.author ?? '—'}  ·  ${v.url}  ·  совпало: ${v.excludedBy.join(', ')}`);
  console.log(`\n${file}`);
  console.log('СТОП: выберите 3 голоса на сайте и впишите их id в voice/calibration.json → { "voices": ["…", "…", "…"] }');
}

const args = process.argv.slice(2);
try {
  if (args.includes('--list')) await list(args.includes('--only-uk') ? MODES.onlyUk : MODES.all);
  else if (args.includes('--run')) await run({ root: ROOT, outDir: OUT_DIR });
  else {
    console.error('Использование: node --env-file=.env voice/calibrate.mjs --list [--only-uk] | --run');
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof FishError ? `ОШИБКА Fish: ${e.message}` : e);
  process.exit(1);
}

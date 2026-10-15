#!/usr/bin/env node
// Калибровка украинского голоса Fish Audio (задача 002).
//   node --env-file=.env voice/calibrate.mjs --list
//     → до 12 украинских голосов (GET /model, бесплатно), сохраняет out/voice/candidates.json.
//     Дальше Олег слушает на сайте и вписывает 3 id в voice/calibration.json (поле voices).
//     Этот файл создаёт человек; скрипт его НЕ пишет (гейт 5).
// Часть Б (--run: озвучка × фразы, метрики, listen.html) — после выбора голосов, в этом файле ещё нет.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FishError, listVoices } from './fish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'out', 'voice');
const LIST_LIMIT = 12;
const LANGUAGE = 'uk';

async function list() {
  console.log(`FISH_API_KEY ${process.env.FISH_API_KEY ? 'задан' : 'НЕ задан'}`);
  const { total, items } = await listVoices({ language: LANGUAGE, pageSize: LIST_LIMIT, page: 1, sortBy: 'task_count' });
  const voices = items.slice(0, LIST_LIMIT);
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, 'candidates.json');
  writeFileSync(
    file,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'GET https://api.fish.audio/model', query: { language: LANGUAGE, page_size: LIST_LIMIT, page_number: 1, sort_by: 'task_count' }, total, voices }, null, 2)}\n`,
  );
  console.log(`Голосов с language=${LANGUAGE} в каталоге: ${total}; показано: ${voices.length} (по task_count)\n`);
  voices.forEach((v, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${v.title}  ·  автор ${v.author ?? '—'}  ·  задач ${v.taskCount}  ·  языки ${v.languages.join(',') || '—'}`);
    console.log(`    id ${v.id}  ·  ${v.url}`);
    if (v.tags.length) console.log(`    теги: ${v.tags.join(', ')}`);
  });
  console.log(`\n${file}`);
  console.log('СТОП: выберите 3 голоса на сайте и впишите их id в voice/calibration.json → { "voices": ["…", "…", "…"] }');
}

const args = process.argv.slice(2);
try {
  if (args.includes('--list')) await list();
  else {
    console.error('Использование: node --env-file=.env voice/calibrate.mjs --list   (--run — часть Б задачи 002, ещё не реализован)');
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof FishError ? `ОШИБКА Fish: ${e.message}` : e);
  process.exit(1);
}

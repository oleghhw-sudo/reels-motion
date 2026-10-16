#!/usr/bin/env node
// Замер точности выравнивания на эталоне Fish 002 (задача 007, шаг 4).
//   WHISPER_CPP_MODEL=… ASR_PYTHON=… node voice/align.bench.mjs <engine>[,<engine>…] [--reuse]
// Результат распознавания каждого движка сохраняется в out/voice/align-raw-<engine>.json; --reuse берёт его вместо
// повторного распознавания (для правок сопоставления — само распознавание от них не зависит).
// Эталон: out/voice/<slug>/<n>.wav + <n>.words.json (тайминги от самой модели Fish; шаг 80 мс — см. отчёт 007).
// Метрика: |начало слова (align) − начало слова (Fish)| по словам, которые align сопоставил (match: true),
// медиана и p95 в мс; дополнительно — знаковая медиана (систематический сдвиг) и доля match: false.
// Критерий задачи: медиана ≤ 33 мс, p95 ≤ 100 мс. Результат → out/voice/align-bench.json; exit 1, если никто не прошёл.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignMany, ENGINES } from './align.mjs';
import { tokenize } from './metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out', 'voice');
export const CRITERION = { medianMs: 33, p95Ms: 100 };

/** Эталонные файлы Fish: голоса из voice/calibration.json × фразы. */
export function fishReference() {
  const { voices } = JSON.parse(readFileSync(join(ROOT, 'voice', 'calibration.json'), 'utf8'));
  const { phrases } = JSON.parse(readFileSync(join(ROOT, 'voice', 'phrases.uk.json'), 'utf8'));
  const items = [];
  for (const id of voices)
    for (const ph of phrases) {
      const base = join(OUT, id.slice(0, 8), String(ph.n));
      if (!existsSync(`${base}.wav`)) throw new Error(`нет эталона ${base}.wav — нужен прогон 002 (--run)`);
      const fish = JSON.parse(readFileSync(`${base}.words.json`, 'utf8')).words;
      // слова Fish в порядке сценария: tokenize каждого сегмента
      const truth = fish.flatMap((w) => tokenize(w.text).map(() => w.start));
      if (truth.length !== tokenize(ph.text).length) throw new Error(`${base}: слов Fish ${truth.length} ≠ слов текста ${tokenize(ph.text).length}`);
      items.push({ wavPath: `${base}.wav`, text: ph.text, truth, label: `${id.slice(0, 8)}#${ph.n}` });
    }
  return items;
}

export const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};

/** Ошибки начала слов результата align против эталона (truth — начала слов, с). shiftSec — сдвиг эталона. */
export function startErrors(results, items, shiftSec = 0) {
  const abs = [];
  const signed = [];
  let unmatched = 0;
  let total = 0;
  results.forEach((r, k) => {
    r.words.forEach((w, i) => {
      total++;
      if (!w.match) {
        unmatched++;
        return;
      }
      const e = (w.start - (items[k].truth[i] + shiftSec)) * 1000;
      abs.push(Math.abs(e));
      signed.push(e);
    });
  });
  // диагностика (не критерий): разброс после вычета постоянного сдвига — отделяет систематику от случайной ошибки
  const bias = quantile(signed, 0.5);
  const resid = signed.map((e) => Math.abs(e - bias));
  return { n: abs.length, total, unmatched, medianMs: quantile(abs, 0.5), p95Ms: quantile(abs, 0.95), signedMedianMs: bias, residualMedianMs: quantile(resid, 0.5), residualP95Ms: quantile(resid, 0.95) };
}

export const passes = (s) => s.medianMs !== null && s.medianMs <= CRITERION.medianMs && s.p95Ms <= CRITERION.p95Ms;

if (import.meta.url === `file://${process.argv[1]}`) {
  const engines = (process.argv[2] ?? '').split(',').filter(Boolean);
  if (!engines.length || engines.some((e) => !ENGINES[e])) {
    console.error(`Использование: node voice/align.bench.mjs <engine>[,…] — из ${Object.keys(ENGINES).join(', ')}`);
    process.exit(1);
  }
  const items = fishReference();
  const prev = existsSync(join(OUT, 'align-bench.json')) ? JSON.parse(readFileSync(join(OUT, 'align-bench.json'), 'utf8')) : { engines: {} };
  for (const engine of engines) {
    const rawFile = join(OUT, `align-raw-${engine}.json`);
    const reuse = process.argv.includes('--reuse') && existsSync(rawFile);
    const t0 = performance.now();
    let recognized = null;
    let sec;
    if (reuse) {
      const raw = JSON.parse(readFileSync(rawFile, 'utf8'));
      recognized = items.map((it) => raw.files[it.wavPath]);
      sec = raw.seconds;
    }
    const results = alignMany({ items, lang: 'uk', engine, recognized });
    if (!reuse) {
      sec = (performance.now() - t0) / 1000;
      writeFileSync(rawFile, `${JSON.stringify({ engine, seconds: +sec.toFixed(1), files: Object.fromEntries(items.map((it, k) => [it.wavPath, { words: results[k].recognized, transcript: results[k].transcript }])) }, null, 2)}\n`);
    }
    const s = startErrors(results, items);
    const mism = results.flatMap((r, k) => r.words.filter((w) => !w.match).map((w) => `${items[k].label} ${w.text}→${w.heard || '∅'}`));
    prev.engines[engine] = { ...s, pass: passes(s), seconds: +sec.toFixed(1), files: items.length, mismatches: mism, transcripts: results.map((r, k) => ({ label: items[k].label, transcript: r.transcript })) };
    console.log(
      `${engine.padEnd(15)} ${passes(s) ? 'PASS' : 'FAIL'}  медиана ${s.medianMs?.toFixed(1)} мс  p95 ${s.p95Ms?.toFixed(1)} мс  сдвиг ${s.signedMedianMs?.toFixed(1)} мс  (без сдвига: медиана ${s.residualMedianMs?.toFixed(1)}, p95 ${s.residualP95Ms?.toFixed(1)})  слов ${s.n}/${s.total}, match:false ${s.unmatched}  (${sec.toFixed(1)} с на ${items.length} файлов)`,
    );
    if (mism.length) console.log(`    несовпадения: ${mism.join('; ')}`);
  }
  prev.generatedAt = new Date().toISOString();
  prev.criterion = CRITERION;
  prev.reference = 'Fish 002, out/voice/<slug>/<n>.words.json (шаг 80 мс)';
  writeFileSync(join(OUT, 'align-bench.json'), `${JSON.stringify(prev, null, 2)}\n`);
  console.log(join(OUT, 'align-bench.json'));
  if (!Object.values(prev.engines).some((e) => e.pass)) process.exitCode = 1;
}

#!/usr/bin/env node
// Позитивный контроль voice/align.mjs (задача 007, шаг 4):
//   node voice/align.test.mjs [--negative]                                   — только чистые проверки (без ASR)
//   WHISPER_CPP_MODEL=… ASR_PYTHON=… node voice/align.test.mjs <engine> [--negative] — плюс живые проверки движка
// На эталонном файле Fish 002 (голос e8f78487, фраза 2, 9 слов):
//   - +500 мс тишины в начале → каждое сопоставленное слово сдвинуто на 500 ± 33 мс относительно исходного;
//   - вырезано слово «сім» (по таймингам Fish) → именно оно match: false;
//   - чистые проверки matchScript без ASR (числа, интерполяция, «услышано»).
// Критерий точности проверяется и без ASR: «идеальный» результат (= эталон Fish) проходит, эталон + 200 мс — нет.
// `--negative`: заведомо неверное ожидание «эталон + 200 мс проходит критерий» обязано упасть → exit 1.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignMany, ENGINES, matchScript } from './align.mjs';
import { CRITERION, passes, startErrors } from './align.bench.mjs';
import { tokenize } from './metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
if (engine !== undefined && !ENGINES[engine]) {
  console.error(`Использование: node voice/align.test.mjs [engine] [--negative] — engine из ${Object.keys(ENGINES).join(', ')}`);
  process.exit(1);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

let failed = 0;
const expect = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};

// --- чистые проверки сопоставления (без ASR)
const m1 = matchScript({ text: '24 години на добу', recognized: [{ text: 'двадцять', start: 0, end: 0.4 }, { text: 'чотири', start: 0.4, end: 0.9 }, { text: 'години', start: 0.9, end: 1.3 }, { text: 'на', start: 1.3, end: 1.4 }, { text: 'дубу', start: 1.4, end: 1.8 }], durationSec: 2 });
expect('«24» ↔ «двадцять чотири»: match, время 0–0.9, услышано обе', m1[0].match && m1[0].start === 0 && m1[0].end === 0.9 && m1[0].heard === 'двадцять чотири', JSON.stringify(m1[0]));
expect('«добу» ↔ «дубу»: match:false, услышано «дубу», время интерполировано до конца аудио', !m1[3].match && m1[3].heard === 'дубу' && m1[3].interpolated && m1[3].start === 1.4 && m1[3].end === 2);
const m2 = matchScript({ text: 'Студія працює з дев’ятої до двадцятої', recognized: [{ text: 'Студія', start: 0, end: 0.5 }, { text: 'працює', start: 0.5, end: 1 }, { text: 'з', start: 1, end: 1.1 }, { text: '9', start: 1.1, end: 1.6 }, { text: 'до', start: 1.6, end: 1.7 }, { text: '20.', start: 1.7, end: 2.3 }], durationSec: 2.5 });
expect('порядковые цифрами: «дев’ятої» ↔ «9», «двадцятої» ↔ «20.»', m2.every((w) => w.match), m2.filter((w) => !w.match).map((w) => w.text).join());
const m3 = matchScript({ text: 'Ґрунтовний підхід й результат', recognized: [{ text: 'Грунтовний', start: 0, end: 0.6 }, { text: 'підхід', start: 0.6, end: 1 }, { text: 'і', start: 1, end: 1.1 }, { text: 'результат', start: 1.1, end: 1.7 }], durationSec: 2 });
expect('орфография ASR: «Ґ» ↔ «Г», «й» ↔ «і»', m3.every((w) => w.match));
const m4 = matchScript({ text: 'раз два три', recognized: [{ text: 'раз', start: 0, end: 0.3 }, { text: 'три', start: 0.9, end: 1.2 }], durationSec: 1.5 });
expect('пропущенное слово: время между соседями (0.3–0.9), match:false, услышано пусто', !m4[1].match && near(m4[1].start, 0.3) && near(m4[1].end, 0.9) && m4[1].heard === '', JSON.stringify(m4[1]));

// --- критерий точности на эталоне Fish без ASR (позитивный контроль метрики точности)
const id = 'e8f78487';
const base = join(ROOT, 'out', 'voice', id, '2');
const text = JSON.parse(readFileSync(join(ROOT, 'voice', 'phrases.uk.json'), 'utf8')).phrases.find((p) => p.n === 2).text;
const fish = JSON.parse(readFileSync(`${base}.words.json`, 'utf8')).words;
const truth = fish.flatMap((w) => tokenize(w.text).map(() => w.start));
const perfect = [{ words: tokenize(text).map((t, i) => ({ text: t, start: truth[i], end: truth[i] + 0.1, match: true })) }];
const clean = startErrors(perfect, [{ truth }]);
const shifted200 = startErrors(perfect, [{ truth }], 0.2);
expect(`критерий: идеальный результат проходит (медиана ${clean.medianMs} мс, p95 ${clean.p95Ms} мс)`, passes(clean));
expect(`критерий: эталон + 200 мс НЕ проходит (медиана ${shifted200.medianMs?.toFixed(1)} мс)`, !passes(shifted200));
if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: эталон + 200 мс проходит критерий (заведомо неверно)', passes(shifted200));
}

// --- живые проверки движка на эталоне Fish (только если задан engine)
const sim = fish.findIndex((w) => tokenize(w.text)[0] === 'сім');
if (engine) {
const tmp = mkdtempSync(join(tmpdir(), 'rm-align-test-'));
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
};
try {
  const shifted = join(tmp, 'shift500.wav');
  ff(['-i', `${base}.wav`, '-af', 'adelay=500:all=1', shifted]);
  const cut = join(tmp, 'cut-sim.wav');
  const a = fish[sim].start;
  const b = fish[sim + 1].start;
  ff(['-i', `${base}.wav`, '-filter_complex', `[0]atrim=0:${a},asetpts=N/SR/TB[x];[0]atrim=${b},asetpts=N/SR/TB[y];[x][y]concat=n=2:v=0:a=1`, cut]);

  const [orig, sh, ct] = alignMany({ items: [{ wavPath: `${base}.wav`, text }, { wavPath: shifted, text }, { wavPath: cut, text }], lang: 'uk', engine });
  console.log(`исходный:  ${orig.transcript}`);
  console.log(`+500 мс:   ${sh.transcript}`);
  console.log(`без «сім» (${a}–${b} с): ${ct.transcript}`);

  const both = orig.words.map((w, i) => [w, sh.words[i]]).filter(([x, y]) => x.match && y.match);
  const shifts = both.map(([x, y]) => Math.round((y.start - x.start) * 1000));
  expect(`+500 мс: все сопоставленные слова сдвинуты на 500 ± 33 мс (${both.length}/${orig.words.length} слов)`, both.length >= orig.words.length - 1 && shifts.every((d) => Math.abs(d - 500) <= 33), shifts.join(', '));
  expect('вырезано «сім»: «сім» → match:false', ct.words[sim] && !ct.words[sim].match, JSON.stringify(ct.words[sim]));
  const others = ct.words.filter((w, i) => i !== sim && !w.match).map((w) => w.text);
  expect('вырезано «сім»: остальные слова сопоставлены', others.length === 0, others.join(', '));

  // точность на этом файле против эталона Fish (информационно) и испорченного эталона
  const good = startErrors([orig], [{ truth }]);
  console.log(`точность на файле: медиана ${good.medianMs?.toFixed(1)} мс, p95 ${good.p95Ms?.toFixed(1)} мс (критерий ${CRITERION.medianMs}/${CRITERION.p95Ms})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
}

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log(`\nOK: align (${engine ?? 'без ASR'})`);

#!/usr/bin/env node
// Полная озвучка «Юридичний контур АНЦ» (задача 032, п. 1): 8 фрагментов по блокам → full.wav + words.json.
//   1. TTS по блокам: текст сценария (src/videos/yurkontur/timeline.ts BLOCKS[].voice) через словарь произношения
//      (voice/pronounce.mjs ttsText/ttsHint — подсказка только к фрагментам с такими словами, решение Олега 08.11).
//      --only b3a,b6 — перегенерировать только эти фрагменты (правка ударений: только записью словаря).
//   2. Тишина по краям фрагмента срезается (silencedetect −45 дБ), фрагменты ставятся встык с паузами:
//      LEAD до голоса блока, TAIL после, HOLD в конце (локап).
//   3. Выравнивание WhisperX по каждому фрагменту (voice/align.mjs, «Алі» ↔ «ALI» через canon) → words.json:
//      границы блоков и время каждого слова в секундах ролика. timeline.ts читает ТОЛЬКО его.
// Модель и голос — аргументами (гейт 2); ключ GEMINI_API_KEY — из .env (не печатается); ASR_PYTHON — окружение.
// Запуск: ASR_PYTHON=.venv-asr/bin/python node --env-file=.env --experimental-strip-types --no-warnings \
//           videos/yurkontur/voice-full.mjs --model gemini-3.8-flash-tts --voice Gero [--only b3b] [--align-only]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tts } from '../../voice/gemini.mjs';
import { ttsHint, ttsText } from '../../voice/pronounce.mjs';
import { alignMany } from '../../voice/align.mjs';
import { BLOCK_SCRIPT } from '../../src/videos/yurkontur/script.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const model = arg('--model');
const voice = arg('--voice');
const only = arg('--only')?.split(',').filter(Boolean);
const alignOnly = process.argv.includes('--align-only');
if (!model || !voice) {
  console.error('Использование: … voice-full.mjs --model <id> --voice <имя> [--only b1,b3a] [--align-only]');
  process.exit(1);
}
if (!process.env.ASR_PYTHON) {
  console.error('ASR_PYTHON не задан (env.manifest.json) — выравнивание невозможно');
  process.exit(1);
}

/** Паузы, с: до голоса блока, после голоса блока, удержание локапа в конце. */
const LEAD = 0.6;
const TAIL = 0.8;
const HOLD = 4.0;
const SR = 48000;

const DIR = join(ROOT, 'videos/yurkontur/voice');
const FR = join(DIR, 'full');
mkdirSync(FR, { recursive: true });
const META = join(FR, 'fragments.json');
const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : { fragments: {} };
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr.slice(-400)}`);
};
const dur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());

/** Края речи: первый конец тишины от 0 и начало последней тишины до конца (−45 дБ, ≥ 0.15 с). */
function speechBounds(file) {
  const d = dur(file);
  const sd = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.15', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const starts = [...sd.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...sd.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const a = starts.length && starts[0] < 0.01 ? ends[0] ?? 0 : 0;
  const last = starts.at(-1);
  const b = last !== undefined && last > a && (ends.length < starts.length || ends.at(-1) >= d - 0.02) ? last : d;
  return { a, b, d };
}

// ---------------------------------------------------------------- 1. TTS
for (const blk of BLOCK_SCRIPT) {
  const raw = join(FR, `${blk.id}.raw.wav`);
  const want = !alignOnly && (only ? only.includes(blk.id) : !existsSync(raw));
  if (!want) continue;
  const text = ttsText(blk.voice);
  const style = ttsHint(blk.voice);
  const r = await tts({ text, voice, model, style, retry429: false }); // 429 — стоп без повторов (решение Олега 09.11)
  writeFileSync(raw, r.wav);
  meta.fragments[blk.id] = { voice, model, modelVersion: r.meta.modelVersion, textSha: sha(blk.voice), ttsText: text, ttsHint: style ?? null, generatedAt: new Date().toISOString(), rawSec: +r.durationSec.toFixed(3) };
  writeFileSync(META, JSON.stringify(meta, null, 1)); // сразу: при 429 на следующем фрагменте готовые не теряются
  console.log(`TTS ${blk.id}: ${r.durationSec.toFixed(2)} с${style ? ' (с подсказкой произношения)' : ''}`);
}
// фрагмент, чей текст сценария изменился после генерации, — громкая ошибка (не тихое расхождение субтитров и звука)
for (const blk of BLOCK_SCRIPT) {
  const m = meta.fragments[blk.id];
  if (!m || !existsSync(join(FR, `${blk.id}.raw.wav`))) throw new Error(`нет фрагмента ${blk.id} — запустите без --align-only`);
  if (m.textSha !== sha(blk.voice)) throw new Error(`фрагмент ${blk.id} озвучен по старому тексту — перегенерировать: --only ${blk.id}`);
}

// ---------------------------------------------------------------- 2. обрезка и раскладка
const PAD = 0.04; // запас на атаку/затухание при обрезке тишины
let t = 0;
const placed = [];
for (const blk of BLOCK_SCRIPT) {
  const raw = join(FR, `${blk.id}.raw.wav`);
  const { a, b } = speechBounds(raw);
  const s = Math.max(0, a - PAD);
  const e = b + PAD;
  const trim = join(FR, `${blk.id}.wav`);
  ff(['-i', raw, '-ss', s.toFixed(4), '-to', e.toFixed(4), '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s16le', trim]);
  const len = dur(trim);
  const from = t;
  const voiceAt = from + LEAD;
  const last = blk === BLOCK_SCRIPT.at(-1);
  const to = voiceAt + len + (last ? HOLD : TAIL);
  placed.push({ id: blk.id, from, to, voiceAt, voiceEnd: voiceAt + len, file: trim, text: blk.voice });
  t = to;
}
const total = t;

// сборка: тишина total с + фрагменты по voiceAt (adelay в мс, сумма amix без нормировки)
const inputs = placed.flatMap((p) => ['-i', p.file]);
const chains = placed.map((p, i) => `[${i}:a]adelay=${Math.round(p.voiceAt * 1000)}:all=1[a${i}]`).join(';');
const mix = `${chains};${placed.map((_, i) => `[a${i}]`).join('')}amix=inputs=${placed.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)}[out]`;
const FULL = join(DIR, 'full.wav');
ff([...inputs, '-filter_complex', mix, '-map', '[out]', '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s16le', '-t', total.toFixed(3), FULL]);
// копия для Remotion (public/ в .gitignore)
const PUB = join(ROOT, 'public/videos/yurkontur/voice.wav');
mkdirSync(dirname(PUB), { recursive: true });
copyFileSync(FULL, PUB);

// ---------------------------------------------------------------- 3. выравнивание
const res = alignMany({ items: placed.map((p) => ({ wavPath: p.file, text: p.text })), lang: 'uk', engine: 'whisperx' });
const blocks = placed.map((p, i) => ({
  id: p.id,
  from: +p.from.toFixed(3),
  to: +p.to.toFixed(3),
  voiceAt: +p.voiceAt.toFixed(3),
  voiceEnd: +p.voiceEnd.toFixed(3),
  transcript: res[i].transcript,
  words: res[i].words.map((w) => ({ text: w.text, start: +(p.voiceAt + w.start).toFixed(3), end: +(p.voiceAt + w.end).toFixed(3), match: w.match })),
}));
writeFileSync(join(DIR, 'words.json'), JSON.stringify({ $comment: 'производное: videos/yurkontur/voice-full.mjs (задача 032); время — секунды ролика; match:false — слово без пары в распознавании (время интерполировано), проверить на слух', voice, model, engine: 'whisperx', lead: LEAD, tail: TAIL, hold: HOLD, durationSec: +total.toFixed(3), blocks }, null, 1));
writeFileSync(META, JSON.stringify(meta, null, 1));

// ---------------------------------------------------------------- таблица
const wc = (b) => b.words.length;
console.log('\n| блок | начало | конец | голос, с | слов | слов/с | без пары |');
console.log('|---|---|---|---|---|---|---|');
for (const b of blocks) {
  const sp = b.voiceEnd - b.voiceAt;
  const miss = b.words.filter((w) => !w.match).map((w) => w.text);
  console.log(`| ${b.id} | ${b.from.toFixed(1)} | ${b.to.toFixed(1)} | ${sp.toFixed(1)} | ${wc(b)} | ${(wc(b) / sp).toFixed(2)} | ${miss.join(', ') || '—'} |`);
}
const m = Math.floor(total / 60);
console.log(`\nИтого: ${total.toFixed(1)} с (${m}:${String(Math.round(total - m * 60)).padStart(2, '0')}), допуск 2:15–2:45 → ${total >= 135 && total <= 165 ? 'OK' : 'ВНЕ ДОПУСКА'}`);

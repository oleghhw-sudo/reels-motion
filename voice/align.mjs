// Выравнивание слов сценария по готовому аудио (задача 007). Провайдер голоса не важен: Gemini таймингов не даёт.
// align({ wavPath, text, lang, engine }) → { words: [{ text, start, end, heard, match }], transcript }
//
// 1. recognize(): локальное распознавание с таймингами слов (движки ENGINES; выбор — по замеру voice/align.bench.mjs).
// 2. matchScript(): слова сценария ↔ распознанные через LCS (voice/metrics.mjs tokenize / diffWords) в каноническом
//    виде: нижний регистр, апостроф ’, числа 0–999 → слова, род числительных сведён (одна/одне → один, дві → два).
//    Слово сценария без пары → время интерполируется между соседями, match: false.
//    match: false = подозрение на ошибку произношения ИЛИ распознавания. Гипотеза для уха, не вердикт.
// Пути к моделям — только из окружения (гейт 2, env.manifest.json → data_dirs): WHISPER_CPP_MODEL, ASR_PYTHON.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffWords, tokenize } from './metrics.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- числа → слова (украинский, 0–999)
const ONES = ['нуль', 'один', 'два', 'три', 'чотири', "п’ять", 'шість', 'сім', 'вісім', "дев’ять"];
const TEENS = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п’ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев’ятнадцять"];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', "п’ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев’яносто"];
const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', "п’ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев’ятсот"];

/** Число 0–999 → слова (канонический род: один/два). Вне диапазона — null. */
export function numberToUk(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  if (n === 0) return [ONES[0]];
  const out = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) out.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else {
    if (r >= 20) out.push(TENS[Math.floor(r / 10)]);
    if (r % 10 || (!h && r === 0)) out.push(ONES[r % 10]);
  }
  return out.filter(Boolean);
}

// Числительные в любой форме (род, падеж, порядковые) → основа количественного: «дев’ятої» → «дев’ять»,
// «двадцятої» → «двадцять», «сьомий» → «сім». Применяется к ОБЕИМ сторонам — совпадение симметрично.
// Длинные основы раньше коротких (дев’ятнадцят до дев’ят). Только слова, начинающиеся с основы.
const NUM_STEMS = [
  ["дев’ятнадцят", "дев’ятнадцять"], ['вісімнадцят', 'вісімнадцять'], ['сімнадцят', 'сімнадцять'], ['шістнадцят', 'шістнадцять'],
  ["п’ятнадцят", "п’ятнадцять"], ['чотирнадцят', 'чотирнадцять'], ['тринадцят', 'тринадцять'], ['дванадцят', 'дванадцять'], ['одинадцят', 'одинадцять'],
  ["дев’яност", "дев’яносто"], ['вісімдесят', 'вісімдесят'], ['сімдесят', 'сімдесят'], ['шістдесят', 'шістдесят'], ["п’ятдесят", "п’ятдесят"],
  ['сорок', 'сорок'], ['тридцят', 'тридцять'], ['двадцят', 'двадцять'], ['десят', 'десять'],
  ["дев’ят", "дев’ять"], ['восьм', 'вісім'], ['вісім', 'вісім'], ['сьом', 'сім'], ['сім', 'сім'], ['шост', 'шість'], ['шіст', 'шість'],
  ["п’ят", "п’ять"], ['четвер', 'чотири'], ['чотир', 'чотири'], ['трет', 'три'], ['три', 'три'],
  ['одн', 'один'], ['один', 'один'], ['дві', 'два'], ['два', 'два'], ['двох', 'два'], ['двом', 'два'],
];
// Орфография распознавания, не произношение: Whisper пишет «г» вместо «ґ»; союз «й» ↔ «і», предлог «у» ↔ «в»
// (чередование по благозвучию). Отдельно слушать ґ всё равно нужно ухом — ASR его не различает.
const SPELLING = { й: 'і', у: 'в' };

/** Слово (уже tokenize) → канонические подтокены: «24» → [двадцять, чотири], «дві» → [два], «ґанок» → [ганок]. */
export function canon(token) {
  const t = token.toLowerCase().replace(/[ʼ']/g, '’').replace(/ґ/g, 'г');
  if (/^\d+$/.test(t)) return numberToUk(Number(t)) ?? [t];
  if (SPELLING[t]) return [SPELLING[t]];
  const stem = NUM_STEMS.find(([s]) => t.startsWith(s.replace(/ґ/g, 'г')));
  return [stem ? stem[1] : t];
}

// ---------------------------------------------------------------- сопоставление
/**
 * Чистая функция. recognized — [{ text, start, end }] (start/end могут быть null — слово без тайминга),
 * durationSec — длина аудио (граница интерполяции).
 */
export function matchScript({ text, recognized, durationSec }) {
  const script = tokenize(text).map((w) => ({ text: w, parts: canon(w) }));
  // распознанные → подтокены; время слова делится поровну между его подтокенами
  const heardParts = [];
  recognized.forEach((r, ri) => {
    for (const tok of tokenize(r.text)) {
      const parts = canon(tok);
      parts.forEach((p, k) => {
        const timed = Number.isFinite(r.start) && Number.isFinite(r.end);
        const d = timed ? (r.end - r.start) / parts.length : 0;
        heardParts.push({ p, ri, start: timed ? r.start + d * k : null, end: timed ? r.start + d * (k + 1) : null });
      });
    }
  });
  const exp = script.flatMap((w, wi) => w.parts.map((p) => ({ p, wi })));
  const diff = diffWords(exp.map((x) => x.p), heardParts.map((x) => x.p));
  const missing = new Set(diff.missing.map((m) => m.at));
  const extra = new Set(diff.extra.map((m) => m.at));
  const ei = exp.map((_, i) => i).filter((i) => !missing.has(i));
  const gi = heardParts.map((_, i) => i).filter((i) => !extra.has(i));
  const pairOf = new Map(ei.map((e, k) => [e, gi[k]])); // индекс подтокена сценария → индекс распознанного

  const words = script.map((w, wi) => {
    const idx = exp.map((x, i) => (x.wi === wi ? i : -1)).filter((i) => i >= 0);
    const hp = idx.map((i) => pairOf.get(i));
    const all = hp.every((h) => h !== undefined);
    const timed = all && hp.every((h) => heardParts[h].start !== null);
    return {
      text: w.text,
      start: timed ? heardParts[hp[0]].start : null,
      end: timed ? heardParts[hp.at(-1)].end : null,
      match: all,
      heardIdx: hp.filter((h) => h !== undefined).map((h) => heardParts[h].ri),
    };
  });

  // «услышано» для несовпавших: распознанные слова между соседними совпавшими
  const lastRi = (k) => {
    for (let j = k; j >= 0; j--) if (words[j].match && words[j].heardIdx.length) return Math.max(...words[j].heardIdx);
    return -1;
  };
  const nextRi = (k) => {
    for (let j = k; j < words.length; j++) if (words[j].match && words[j].heardIdx.length) return Math.min(...words[j].heardIdx);
    return recognized.length;
  };
  words.forEach((w, k) => {
    if (w.match) w.heard = [...new Set(w.heardIdx)].map((ri) => recognized[ri].text).join(' ');
    else w.heard = recognized.slice(lastRi(k - 1) + 1, nextRi(k + 1)).map((r) => r.text).join(' ');
  });

  // интерполяция: подряд идущие слова без времени делят промежуток между соседями поровну
  for (let k = 0; k < words.length; ) {
    if (words[k].start !== null) {
      k++;
      continue;
    }
    let j = k;
    while (j < words.length && words[j].start === null) j++;
    const from = k > 0 ? words[k - 1].end : 0;
    const to = j < words.length ? words[j].start : durationSec;
    const step = (to - from) / (j - k);
    for (let q = k; q < j; q++) {
      words[q].start = from + step * (q - k);
      words[q].end = from + step * (q - k + 1);
      words[q].interpolated = true;
    }
    k = j;
  }
  return words.map(({ heardIdx, ...w }) => ({ ...w, interpolated: Boolean(w.interpolated) }));
}

// ---------------------------------------------------------------- движки распознавания
function needEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} не задан (env.manifest.json → data_dirs; значение в .env или окружении процесса)`);
  return v;
}

function to16k(wav, dir) {
  const out = join(dir, `${basename(wav, '.wav')}-${Math.abs(hashStr(wav))}.16k.wav`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
  if (r.status !== 0) throw new Error(`ffmpeg 16k: ${r.stderr}`);
  return out;
}
function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0;
  return h;
}

/** whisper.cpp: слова как сегменты длины 1 (-ml 1 -sow), времена — offsets сегмента; dtw — по токенам DTW. */
function whispercpp(wavs16, lang, dir, { dtw }) {
  const model = needEnv('WHISPER_CPP_MODEL');
  return wavs16.map((w) => {
    const of = join(dir, basename(w, '.wav'));
    const args = ['-m', model, '-f', w, '-l', lang, '-ojf', '-of', of, '-np'];
    if (dtw) args.push('-dtw', 'large.v3', '-nfa');
    else args.push('-ml', '1', '-sow');
    const r = spawnSync('whisper-cli', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`whisper-cli: ${r.stderr.slice(-300)}`);
    const j = JSON.parse(readFileSync(`${of}.json`, 'utf8'));
    const transcript = j.transcription.map((s) => s.text.trim()).join(' ');
    if (!dtw) {
      const words = j.transcription.map((s) => ({ text: s.text.trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 })).filter((x) => tokenize(x.text).length);
      return { words, transcript };
    }
    // DTW: токены → слова (новое слово — токен с ведущим пробелом); начало слова = t_dtw первого токена (сотые с)
    const words = [];
    for (const s of j.transcription)
      for (const t of s.tokens) {
        if (/^\[_/.test(t.text)) continue;
        const ts = t.t_dtw >= 0 ? t.t_dtw / 100 : null;
        if (t.text.startsWith(' ') || !words.length) words.push({ text: t.text.trim(), start: ts, end: ts });
        else {
          words.at(-1).text += t.text;
          if (ts !== null) words.at(-1).end = ts;
        }
      }
    for (let i = 0; i < words.length; i++) if (words[i + 1]?.start != null) words[i].end = Math.max(words[i].end ?? 0, words[i + 1].start);
    return { words: words.filter((x) => tokenize(x.text).length), transcript };
  });
}

function python(engine, wavs16, lang, dir) {
  const py = needEnv('ASR_PYTHON');
  const out = join(dir, `${engine}.json`);
  const r = spawnSync(py, [join(HERE, 'asr_py.py'), engine, lang, 'large-v3', out, ...wavs16], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${engine}: ${r.stderr.slice(-800)}`);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  return wavs16.map((w) => ({ words: j[w].words.filter((x) => tokenize(x.text).length), transcript: j[w].transcript }));
}

export const ENGINES = {
  whispercpp: (w, l, d) => whispercpp(w, l, d, { dtw: false }),
  'whispercpp-dtw': (w, l, d) => whispercpp(w, l, d, { dtw: true }),
  fasterwhisper: (w, l, d) => python('fasterwhisper', w, l, d),
  whisperx: (w, l, d) => python('whisperx', w, l, d),
};

/** Пакетное распознавание: модель грузится один раз. → [{ words, transcript }] по порядку wavPaths. */
export function recognize({ engine, wavPaths, lang }) {
  if (!ENGINES[engine]) throw new Error(`recognize: движок ${engine} — один из ${Object.keys(ENGINES).join(', ')}`);
  const dir = mkdtempSync(join(tmpdir(), 'rm-align-'));
  try {
    const w16 = wavPaths.map((w) => to16k(w, dir));
    return ENGINES[engine](w16, lang, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function durationOf(wav) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}

/** Выравнивание одного файла. engine обязателен (выбирается по замеру, отчёт 007). */
export function align({ wavPath, text, lang, engine }) {
  if (!lang) throw new Error('align: lang обязателен');
  const [r] = recognize({ engine, wavPaths: [wavPath], lang });
  return { words: matchScript({ text, recognized: r.words, durationSec: durationOf(wavPath) }), transcript: r.transcript, engine };
}

/** Пакетный вариант align для замеров: [{ wavPath, text }] → результаты по порядку. */
export function alignMany({ items, lang, engine, recognized }) {
  const rec = recognized ?? recognize({ engine, wavPaths: items.map((i) => i.wavPath), lang });
  return items.map((it, k) => ({ words: matchScript({ text: it.text, recognized: rec[k].words, durationSec: durationOf(it.wavPath) }), transcript: rec[k].transcript, recognized: rec[k].words, engine }));
}

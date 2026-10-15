// Автометрики одной озвученной фразы (задача 002), без ASR. Чистые функции: вход — текст, слова alignment,
// длительность WAV (ffprobe), громкость (ffmpeg ebur128, считается в calibrate.mjs). Тест: node voice/metrics.test.mjs
//
// Проверки с вердиктом (ok/fail): покрытие слов, монотонность, конец последнего слова vs длительность WAV.
// Информационные (без вердикта, для калибровки): паузы > 400 мс, темп слов/мин и символов/с, LUFS / true peak.
// Порог конца — ГИПОТЕЗА: последнее слово кончается не позже конца аудио (допуск 50 мс) и не раньше чем за 1000 мс.

export const PAUSE_MS = 400;
export const END_GAP_MIN_MS = -50;
export const END_GAP_MAX_MS = 1000;

/** Слова для сравнения: нижний регистр, без пунктуации; апостроф внутри слова (’ ' ʼ) сохраняется как ’. */
export function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[ʼ']/g, '’')
    .split(/[\s—–-]+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/** Символы без пробелов — как считает scripts/readcheck.mjs (его cps). */
export const charsNoSpace = (s) => [...s].filter((c) => !/\s/.test(c)).length;

/** Расхождения двух списков слов через LCS: что есть в тексте и нет в alignment (missing) и наоборот (extra). */
export function diffWords(expected, got) {
  const n = expected.length;
  const m = got.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = expected[i] === got[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const missing = [];
  const extra = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (expected[i] === got[j]) {
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) missing.push({ word: expected[i], at: i++ });
    else extra.push({ word: got[j], at: j++ });
  }
  while (i < n) missing.push({ word: expected[i], at: i++ });
  while (j < m) extra.push({ word: got[j], at: j++ });
  return { matched: L[0][0], missing, extra };
}

/**
 * Метрики фразы.
 * @param {{ text: string, words: {text,start,end}[], wavDurationSec: number, loudness?: { lufs: number|null, truePeakDb: number|null } }} x
 */
export function phraseMetrics({ text, words, wavDurationSec, loudness }) {
  const expected = tokenize(text);
  const got = words.flatMap((w) => tokenize(w.text));
  const diff = diffWords(expected, got);
  const coverage = { textWords: expected.length, alignedWords: got.length, matched: diff.matched, missing: diff.missing, extra: diff.extra, ok: diff.missing.length === 0 && diff.extra.length === 0 };

  const badOrder = [];
  words.forEach((w, i) => {
    if (!(w.start <= w.end)) badOrder.push({ i, word: w.text, problem: `start ${w.start} > end ${w.end}` });
    if (i > 0 && w.start < words[i - 1].start) badOrder.push({ i, word: w.text, problem: `start ${w.start} < start предыдущего ${words[i - 1].start}` });
  });
  const monotonic = { ok: words.length > 0 && badOrder.length === 0, problems: badOrder };

  const lastEnd = words.length ? Math.max(...words.map((w) => w.end)) : 0;
  const endGapMs = Math.round((wavDurationSec - lastEnd) * 1000);
  const end = { lastWordEndSec: lastEnd, wavDurationSec, gapMs: endGapMs, ok: words.length > 0 && endGapMs >= END_GAP_MIN_MS && endGapMs <= END_GAP_MAX_MS };

  const pauses = [];
  for (let i = 1; i < words.length; i++) {
    const gap = Math.round((words[i].start - words[i - 1].end) * 1000);
    if (gap > PAUSE_MS) pauses.push({ after: words[i - 1].text, before: words[i].text, ms: gap });
  }

  const speechSec = words.length ? lastEnd - words[0].start : 0;
  const tempo = {
    speechSec: +speechSec.toFixed(3),
    wpm: speechSec > 0 ? +((got.length / speechSec) * 60).toFixed(1) : null,
    cps: speechSec > 0 ? +(charsNoSpace(text) / speechSec).toFixed(2) : null,
  };

  return { coverage, monotonic, end, pauses, tempo, loudness: loudness ?? null, ok: coverage.ok && monotonic.ok && end.ok };
}

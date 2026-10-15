// Позитивный контроль метрик (задача 002): node voice/metrics.test.mjs
// Чистые данные — реальный alignment пробного ответа Fish (фраза 1, голос e8f78487…, pcm 44100, 2026-10-16).
// Испорченные: переставленные слова, обрезанный конец. Проверки ОБЯЗАНЫ дать на них красное, на чистых — зелёное.
// `--negative` — заведомо неверное ожидание (чистые данные красные) ОБЯЗАНО уронить тест (exit 1).
import { assembleTimestampEvents, pcmToWav } from './fish.mjs';
import { diffWords, phraseMetrics, tokenize } from './metrics.mjs';

let failed = 0;
const expect = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const verdict = (m) => `покрытие ${m.coverage.ok ? 'OK' : 'FAIL'}, монотонность ${m.monotonic.ok ? 'OK' : 'FAIL'}, конец ${m.end.ok ? 'OK' : 'FAIL'} (${m.end.gapMs} мс)`;

const TEXT = 'Погляд, який говорить більше.';
const CLEAN = [
  { text: 'Погляд', start: 0, end: 0.56 },
  { text: 'який', start: 0.72, end: 1.04 },
  { text: 'говорить', start: 1.04, end: 1.52 },
  { text: 'більше', start: 1.52, end: 2.16 },
];
const DUR = 2.2291156462585033;

// --- чистые → зелёное
const clean = phraseMetrics({ text: TEXT, words: CLEAN, wavDurationSec: DUR });
console.log(`чистые: ${verdict(clean)}`);
expect('чистые: все проверки зелёные', clean.ok && clean.coverage.ok && clean.monotonic.ok && clean.end.ok);
expect('чистые: пауза 160 мс не считается (> 400 мс нет)', clean.pauses.length === 0);
expect('чистые: темп = 4 слова / 2.16 с', clean.tempo.wpm === +((4 / 2.16) * 60).toFixed(1), String(clean.tempo.wpm));

// --- переставленные слова (2 и 3 поменяны вместе с временами) → красное: покрытие и монотонность
const swapped = [CLEAN[0], CLEAN[2], CLEAN[1], CLEAN[3]];
const sw = phraseMetrics({ text: TEXT, words: swapped, wavDurationSec: DUR });
console.log(`переставлены: ${verdict(sw)}`);
expect('переставлены: покрытие красное', !sw.coverage.ok, JSON.stringify({ missing: sw.coverage.missing, extra: sw.coverage.extra }));
expect('переставлены: монотонность красная', !sw.monotonic.ok, sw.monotonic.problems.map((p) => p.problem).join('; '));
expect('переставлены: общий вердикт красный', !sw.ok);

// --- обрезанный конец: (а) нет последнего слова — покрытие; (б) аудио короче конца слова — конец
const cutWords = phraseMetrics({ text: TEXT, words: CLEAN.slice(0, 3), wavDurationSec: DUR });
console.log(`без последнего слова: ${verdict(cutWords)}`);
expect('без последнего слова: покрытие красное, missing = «більше»', !cutWords.coverage.ok && cutWords.coverage.missing[0]?.word === 'більше');
const cutAudio = phraseMetrics({ text: TEXT, words: CLEAN, wavDurationSec: 1.6 });
console.log(`аудио обрезано до 1.6 с: ${verdict(cutAudio)}`);
expect('аудио обрезано: конец красный (gap < −50 мс)', !cutAudio.end.ok && cutAudio.end.gapMs < -50, `${cutAudio.end.gapMs} мс`);

// --- длинная тишина в конце и пауза внутри
const tail = phraseMetrics({ text: TEXT, words: CLEAN, wavDurationSec: 4.0 });
expect('тишина 1.84 с в конце: конец красный', !tail.end.ok, `${tail.end.gapMs} мс`);
const paused = phraseMetrics({ text: TEXT, words: [CLEAN[0], { ...CLEAN[1], start: 1.2, end: 1.5 }, { ...CLEAN[2], start: 1.5, end: 1.9 }, { ...CLEAN[3], start: 1.9, end: 2.16 }], wavDurationSec: DUR });
expect('пауза 640 мс найдена поимённо', paused.pauses.length === 1 && paused.pauses[0].after === 'Погляд' && paused.pauses[0].ms === 640, JSON.stringify(paused.pauses));

// --- токены и апостроф
expect('tokenize: апостроф ’ и \' — одно слово', tokenize("Об’єм дев'ятої").join('|') === 'об’єм|дев’ятої');
expect('tokenize: тире и пунктуация отброшены', tokenize('форма — індивідуально, без шаблону.').join('|') === 'форма|індивідуально|без|шаблону');
expect('diffWords: цифры против прописи — поимённо', diffWords(tokenize('24 години'), tokenize('двадцять чотири години')).missing.map((x) => x.word).join() === '24');

// --- склейка SSE: снимок заменяется, null не стирает, смещение чанка прибавляется
const ev = (seq, off, segs, b64 = '') => ({ audio_base64: b64, chunk_seq: seq, chunk_audio_offset_sec: off, alignment: segs ? { audio_duration: 1, segments: segs } : null });
const asm = assembleTimestampEvents([
  ev(0, 0, null, Buffer.from([1, 2]).toString('base64')),
  ev(0, 0, [{ text: 'а', start: 0, end: 0.3 }]),
  ev(0, 0, [{ text: 'а', start: 0, end: 0.3 }, { text: 'б', start: 0.4, end: 0.8 }], Buffer.from([3]).toString('base64')),
  ev(0, 0, null),
  ev(1, 1.0, [{ text: 'в', start: 0.1, end: 0.5 }]),
]);
expect('склейка: снимок заменён, null не стёр, offset прибавлен', JSON.stringify(asm.words) === JSON.stringify([{ text: 'а', start: 0, end: 0.3 }, { text: 'б', start: 0.4, end: 0.8 }, { text: 'в', start: 1.1, end: 1.5 }]), JSON.stringify(asm.words));
expect('склейка: аудио всех событий подряд (в т. ч. alignment = null)', asm.audio.equals(Buffer.from([1, 2, 3])));
expect('склейка: reportedDuration = offset + audio_duration последнего чанка', asm.reportedDurationSec === 2);
const wav = pcmToWav(Buffer.alloc(88200), 44100, 1);
expect('pcmToWav: один заголовок 44 байта, data = 1.0 с', wav.length === 44 + 88200 && wav.toString('ascii', 0, 4) === 'RIFF' && wav.readUInt32LE(40) === 88200);

if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: чистые данные красные (заведомо неверно)', !clean.ok);
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: переставленные зелёные (заведомо неверно)', sw.ok);
}

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log('\nOK: metrics');

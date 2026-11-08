#!/usr/bin/env node
// Голосовая проба Gemini TTS (задача 031, шаг 5): 2 фрагмента (блоки 4 и 5) × 3 голоса + контрольная фраза на голос
// («ALI», «ЄДРПОУ» — во фрагментах 4/5 их нет). Тексты — дословно из сценария (src/videos/yurkontur/timeline.ts).
// Модель и голоса — только аргументами (гейт 2); ключ — GEMINI_API_KEY из .env (не печатается).
// Распознавание для проверки произношения — faster-whisper large-v3 через voice/asr_py.py ($ASR_PYTHON).
// Запуск: node --env-file=.env --experimental-strip-types --no-warnings videos/yurkontur/voice-probe.mjs \
//           --model gemini-3.8-flash-tts --voices Gero,Kore,Charon
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tts } from '../../voice/gemini.mjs';
import { ttsHint, ttsText } from '../../voice/pronounce.mjs';
import { block } from '../../src/videos/yurkontur/timeline.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const model = arg('--model');
const voices = arg('--voices')?.split(',').filter(Boolean);
const only = arg('--only')?.split(',').filter(Boolean); // фрагменты: b4,b5,check
if (!model || !voices?.length) {
  console.error('Использование: … voice-probe.mjs --model <id> --voices Gero,Kore,Charon');
  process.exit(1);
}
const firstSentence = (s) => s.split(/(?<=[.!?])\s+/)[0];
const sentenceWith = (s, w) => s.split(/(?<=[.!?])\s+/).find((x) => x.includes(w));
const FRAGMENTS = {
  b4: block('b4').voice,
  b5: block('b5').voice,
  // контроль: «ALI» (блок 2, первое предложение) и «ЄДРПОУ» (блок 3а) — слова сценария без изменений
  check: `${firstSentence(block('b2').voice)} ${sentenceWith(block('b3a').voice, 'ЄДРПОУ')}`,
};
const OUT = join(ROOT, 'videos/yurkontur/voice/probe');
mkdirSync(OUT, { recursive: true });
const words = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const rows = [];
for (const voice of voices) {
  for (const [frag, text] of Object.entries(FRAGMENTS)) {
    if (only && !only.includes(frag)) continue;
    // в TTS — текст по словарю произношения (ALI → «Алі», су́ми) и подсказка произношения только для фрагментов с такими
    // словами (решение Олега 08.11, вариант C); в субтитрах и на экране остаётся сценарий
    const r = await tts({ text: ttsText(text), voice, model, style: ttsHint(text) });
    const file = join(OUT, `${voice}_${frag}.wav`);
    writeFileSync(file, r.wav);
    // длительность речи без тишины по краям: silencedetect (−45 дБ, ≥ 0.15 с) — краевые отрезки тишины вычитаются
    const sd = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.15', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const starts = [...sd.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
    const ends = [...sd.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    const lead = starts.length && starts[0] < 0.01 ? ends[0] ?? 0 : 0;
    const lastStart = starts.length ? starts[starts.length - 1] : null;
    const trail = lastStart !== null && (ends.length < starts.length || ends[ends.length - 1] >= r.durationSec - 0.02) ? r.durationSec - lastStart : 0;
    const speech = r.durationSec - lead - trail;
    rows.push({ voice, frag, file: file.replace(ROOT + '/', ''), durationSec: +r.durationSec.toFixed(2), speechSec: +speech.toFixed(2), words: words(text), wps: +(words(text) / speech).toFixed(2), modelVersion: r.meta.modelVersion, text, ttsText: ttsText(text), ttsHint: ttsHint(text) ?? null });
    console.log(`${voice} ${frag}: ${r.durationSec.toFixed(2)} с, речь ${speech.toFixed(2)} с, ${words(text)} слов → ${(words(text) / speech).toFixed(2)} слов/с`);
  }
}

// распознавание: 16 кГц моно → faster-whisper large-v3 (uk)
const py = process.env.ASR_PYTHON;
if (py) {
  const wavs16 = rows.map((r) => {
    const o = join(OUT, `.${r.voice}_${r.frag}.16k.wav`);
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ROOT, r.file), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', o]);
    return o;
  });
  const asrOut = join(OUT, 'asr.json');
  const a = spawnSync(py, [join(ROOT, 'voice/asr_py.py'), 'fasterwhisper', 'uk', 'large-v3', asrOut, ...wavs16], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (a.status !== 0) console.error('ASR не удалось:', a.stderr.slice(-500));
  else {
    const asr = JSON.parse(readFileSync(asrOut, 'utf8'));
    rows.forEach((r, i) => (r.transcript = asr[wavs16[i]]?.transcript ?? null));
  }
} else console.log('ASR_PYTHON не задан — распознавание пропущено (только длительности)');
writeFileSync(join(OUT, only ? `probe-${only.join('-')}.json` : 'probe.json'), JSON.stringify({ model, voices, generatedAt: new Date().toISOString(), rows }, null, 1));
console.log(`OK: ${rows.length} файлов → ${OUT.replace(ROOT + '/', '')}`);

#!/usr/bin/env node
// Пробы ударения (задача 031, решение Олега 08.11): фраза блока 3а голосом Gero тремя способами.
//   a — знак ударения в тексте TTS («су́ми», словарь voice/pronounce.uk.json → stress);
//   b — текст без знака + указание стиля Gemini (speech_metadata.style);
//   c — оба способа вместе.
// Запуск: node --env-file=.env --experimental-strip-types --no-warnings videos/yurkontur/voice-stress-probe.mjs --model gemini-3.8-flash-tts --voice Gero
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tts } from '../../voice/gemini.mjs';
import { ttsText } from '../../voice/pronounce.mjs';
import { block } from '../../src/videos/yurkontur/timeline.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
const model = arg('--model');
const voice = arg('--voice');
if (!process.argv.includes('--model') || !process.argv.includes('--voice')) throw new Error('нужны --model и --voice');
const text = block('b3a').voice.split(/(?<=[.!?])\s+/).find((s) => s.includes('ЄДРПОУ'));
const STYLE = 'Наголос у слові "суми" на першому складі: СУ-ми';
const variants = [
  { id: 'sumy_a', text: ttsText(text), style: undefined },
  { id: 'sumy_b', text: ttsText(text, { stress: false }), style: STYLE },
  { id: 'sumy_c', text: ttsText(text), style: STYLE },
];
const only = process.argv.includes('--only') ? arg('--only').split(',') : null;
for (const v of variants) {
  if (only && !only.includes(v.id)) continue;
  const r = await tts({ text: v.text, voice, model, style: v.style });
  writeFileSync(join(ROOT, 'videos/yurkontur/voice/probe', `${v.id}.wav`), r.wav);
  console.log(`${v.id}: ${r.durationSec.toFixed(2)} с · текст ${JSON.stringify(v.text)}${v.style ? ` · стиль «${v.style}»` : ''}`);
}

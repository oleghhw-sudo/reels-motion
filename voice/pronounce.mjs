// Словарь произношения voice/pronounce.uk.json (правят Олег/архитектор; скрипты только читают).
//   ttsText(text) — текст для TTS: words (латиница → как звучит) и pronounce[слово].tts (ударение U+0301), целым словом.
//   ttsHint(text) — подсказка произношения для запроса Gemini (speech_metadata.style): pronounce[слово].hint тех слов,
//                   что есть во фрагменте; нет таких слов — undefined (фрагмент идёт без подсказки). Решение Олега 08.11:
//                   только ударение / чтение аббревиатуры, без манеры, темпа и тона.
//   spokenOf(word) — как слово звучит (для выравнивания voice/align.mjs), или null.
// На экране и в субтитрах остаётся исходное написание.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pronounce.uk.json'), 'utf8'));
const WORDS = FILE.words ?? {};
/** { слово: { tts, hint? } } — ключи с «$» (комментарии) пропускаются. */
const ENTRIES = Object.fromEntries(Object.entries(FILE.pronounce ?? {}).filter(([k]) => !k.startsWith('$')));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (k) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(k)}(?![\\p{L}\\p{N}])`, 'gu');
// длинные ключи раньше коротких: «Claude Code» прежде «Claude»
const byLen = (o) => Object.keys(o).sort((a, b) => b.length - a.length);

export function ttsText(text, { stress = true } = {}) {
  let out = text;
  for (const k of byLen(WORDS)) out = out.replace(word(k), WORDS[k]);
  for (const k of byLen(ENTRIES)) out = out.replace(word(k), stress ? ENTRIES[k].tts : ENTRIES[k].tts.replace(/\u0301/g, ''));
  return out;
}

export function ttsHint(text) {
  const hints = byLen(ENTRIES).filter((k) => ENTRIES[k].hint && word(k).test(text)).map((k) => ENTRIES[k].hint);
  return hints.length ? hints.join(' ') : undefined;
}

const LOWER = new Map([...Object.entries(WORDS), ...Object.entries(ENTRIES).map(([k, e]) => [k, e.tts.replace(/\u0301/g, '')])].map(([k, v]) => [k.toLowerCase(), v]));
export function spokenOf(w) {
  return LOWER.get(w.toLowerCase()) ?? null;
}

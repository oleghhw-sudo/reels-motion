// Клиент Fish Audio без SDK (официальные SDK не дают TTS с таймингами).
// Ключ — только из окружения процесса: node --env-file=.env … (FISH_API_KEY, env.manifest.json → env.vars).
// Модель НЕ имеет значения по умолчанию (гейт 2): передаётся явно в каждом вызове, уходит в HTTP-заголовок `model`.
//
// tts()        → POST /v1/tts/stream/with-timestamp (SSE): аудио + тайминги слов.
// listVoices() → GET /model (бесплатно): каталог голосов.

const BASE = 'https://api.fish.audio';

export class FishError extends Error {
  constructor(status, message, { retryable = false } = {}) {
    super(message);
    this.name = 'FishError';
    this.status = status;
    this.retryable = retryable;
  }
}

function apiKey() {
  const k = process.env.FISH_API_KEY;
  if (!k) throw new FishError(0, 'FISH_API_KEY не задан. Запуск: node --env-file=.env voice/<скрипт>.mjs (ключ — в .env, см. env.manifest.json)');
  return k;
}

/** Понятный текст для типовых ошибок. 402 = нужны кредиты — не ретраить. */
async function failFromResponse(res, what) {
  let detail = '';
  try {
    const body = await res.text();
    detail = body.slice(0, 300);
  } catch {
    /* тело недоступно */
  }
  const s = res.status;
  if (s === 401) throw new FishError(s, `${what}: 401 — ключ не принят (неверный или отозван FISH_API_KEY)`);
  if (s === 402) throw new FishError(s, `${what}: 402 — нужны кредиты (платный вызов при нулевом балансе). Не ретраю. Проверьте модель: в калибровке только s2.1-pro-free`);
  if (s === 429) throw new FishError(s, `${what}: 429 — лимит запросов, повторить позже`, { retryable: true });
  throw new FishError(s, `${what}: HTTP ${s}${detail ? ` — ${detail}` : ''}`, { retryable: s >= 500 });
}

/**
 * Список голосов. GET /model — бесплатный эндпоинт каталога.
 * @returns {{ total: number, items: { id, title, author, tags, languages, taskCount, url }[] }}
 */
export async function listVoices({ language, pageSize, page, sortBy = 'task_count' }) {
  if (!language) throw new Error('listVoices: language обязателен');
  const q = new URLSearchParams({ language, page_size: String(pageSize), page_number: String(page), sort_by: sortBy });
  const res = await fetch(`${BASE}/model?${q}`, { headers: { authorization: `Bearer ${apiKey()}` } });
  if (!res.ok) await failFromResponse(res, 'GET /model');
  const json = await res.json();
  return {
    total: json.total,
    items: (json.items ?? []).map((m) => ({
      id: m._id,
      title: m.title,
      description: m.description ?? '',
      author: m.author?.nickname ?? null,
      authorId: m.author?._id ?? null,
      tags: m.tags ?? [],
      languages: m.languages ?? [],
      type: m.type,
      taskCount: m.task_count,
      url: `https://fish.audio/m/${m._id}/`,
    })),
  };
}

/**
 * Склейка SSE-событий with-timestamp (чистая функция — тестируема без сети). Формат (docs.fish.audio, проверен
 * на живом ответе 2026-10-16): { audio_base64, content, chunk_seq, chunk_audio_offset_sec,
 * alignment: null | { audio_duration, segments: [{ text, start, end }] } }.
 * - audio_base64 склеиваются ВСЕ по порядку прихода, в том числе из событий с alignment = null;
 * - alignment хранится по chunk_seq: новый снимок того же chunk_seq ЗАМЕНЯЕТ старый (не дописывает);
 *   alignment = null снимок не трогает;
 * - глобальное время слова = start/end + chunk_audio_offset_sec.
 */
export function assembleTimestampEvents(events) {
  const audio = [];
  const chunks = new Map(); // chunk_seq → { offset, segments, audioDuration }
  for (const ev of events) {
    if (ev.audio_base64) audio.push(Buffer.from(ev.audio_base64, 'base64'));
    if (ev.alignment) {
      chunks.set(Number(ev.chunk_seq ?? 0), {
        offset: Number(ev.chunk_audio_offset_sec ?? 0),
        segments: ev.alignment.segments ?? [],
        audioDuration: ev.alignment.audio_duration ?? null,
      });
    }
  }
  const ordered = [...chunks.entries()].sort((a, b) => a[0] - b[0]);
  const words = ordered.flatMap(([, c]) => c.segments.map((w) => ({ text: w.text, start: w.start + c.offset, end: w.end + c.offset })));
  const last = ordered.at(-1)?.[1];
  const reportedDurationSec = last && last.audioDuration !== null ? last.offset + last.audioDuration : null;
  return { audio: Buffer.concat(audio), words, chunks: ordered.length, reportedDurationSec };
}

/** Разбор потока SSE: блоки, разделённые пустой строкой, строки `data: …` с JSON. */
async function* sseEvents(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data && data !== '[DONE]') yield JSON.parse(data);
    }
  }
  const tail = buf.trim();
  if (tail.startsWith('data:')) {
    const data = tail.slice(5).trimStart();
    if (data && data !== '[DONE]') yield JSON.parse(data);
  }
}

/** WAV (RIFF) с одним заголовком вокруг сырого PCM s16le. */
export function pcmToWav(pcm, sampleRate, channels) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * TTS с таймингами слов. model — обязателен (в калибровке только 's2.1-pro-free').
 * format: 'pcm' (сырой s16le моно; максимум 44100 Гц — 48000 сервер отклоняет 400) → собираем WAV одним заголовком;
 * 'opus' → ogg как пришёл. 'wav' не принимается: каждый кусок потока несёт свой заголовок (ревью 002-A).
 * @returns {{ audio: Buffer, audioFormat: 'wav'|'ogg', words: {text,start,end}[], durationSec: number|null, reportedDurationSec: number|null, chunks: number }}
 */
export async function tts({ text, voiceId, model, format, sampleRate, normalize, prosody }) {
  if (!model) throw new Error('tts: model обязателен (без значения по умолчанию)');
  if (!text || !voiceId) throw new Error('tts: text и voiceId обязательны');
  if (format !== 'pcm' && format !== 'opus') throw new Error(`tts: format ${format} не поддержан — только 'pcm' или 'opus'`);
  const body = { text, reference_id: voiceId, format, sample_rate: sampleRate, normalize };
  if (prosody) body.prosody = prosody;
  const res = await fetch(`${BASE}/v1/tts/stream/with-timestamp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey()}`, 'content-type': 'application/json', model, accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await failFromResponse(res, 'POST /v1/tts/stream/with-timestamp');
  const events = [];
  for await (const ev of sseEvents(res.body)) {
    if (ev.error || ev.status === 'error') throw new FishError(ev.status ?? 0, `with-timestamp: ошибка в потоке — ${JSON.stringify(ev).slice(0, 300)}`);
    events.push(ev);
  }
  const { audio, words, chunks, reportedDurationSec } = assembleTimestampEvents(events);
  if (format === 'pcm') {
    return { audio: pcmToWav(audio, sampleRate, 1), audioFormat: 'wav', words, durationSec: audio.length / (sampleRate * 2), reportedDurationSec, chunks, events: events.length };
  }
  return { audio, audioFormat: 'ogg', words, durationSec: null, reportedDurationSec, chunks, events: events.length };
}

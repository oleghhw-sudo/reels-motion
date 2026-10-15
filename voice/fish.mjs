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

/** Слова из снимка alignment: массив или объект с words/segments/alignment. */
function alignmentItems(al) {
  if (!al) return [];
  if (Array.isArray(al)) return al;
  for (const key of ['words', 'segments', 'alignment', 'items']) if (Array.isArray(al[key])) return al[key];
  return [];
}

/**
 * Склейка SSE-событий with-timestamp (чистая функция — тестируема без сети).
 * - audio_base64 склеиваются по порядку прихода;
 * - alignment хранится по chunk_seq: новое событие того же chunk_seq ЗАМЕНЯЕТ снимок (не дописывает);
 * - глобальное время слова = start/end + chunk_audio_offset_sec.
 */
export function assembleTimestampEvents(events) {
  const audio = [];
  const chunks = new Map(); // chunk_seq → { offset, items }
  let order = 0;
  for (const ev of events) {
    if (ev.audio_base64) audio.push(Buffer.from(ev.audio_base64, 'base64'));
    if (ev.alignment !== undefined) {
      const seq = ev.chunk_seq ?? ev.alignment?.chunk_seq ?? 0;
      const offset = Number(ev.chunk_audio_offset_sec ?? ev.alignment?.chunk_audio_offset_sec ?? 0);
      const prev = chunks.get(seq);
      chunks.set(seq, { offset, items: alignmentItems(ev.alignment), order: prev ? prev.order : order++ });
    }
  }
  const words = [...chunks.entries()]
    .sort((a, b) => (Number(a[0]) - Number(b[0])) || a[1].order - b[1].order)
    .flatMap(([, c]) => c.items.map((w) => ({ text: w.text ?? w.word, start: Number(w.start) + c.offset, end: Number(w.end) + c.offset })));
  return { audio: Buffer.concat(audio), words };
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

/** Длительность WAV из заголовка (PCM): байты data / byteRate. */
export function wavDurationSec(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  let p = 12;
  let byteRate = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(p + 16);
    if (id === 'data') return byteRate ? Math.min(size, buf.length - p - 8) / byteRate : null;
    p += 8 + size + (size % 2);
  }
  return null;
}

/**
 * TTS с таймингами слов. model — обязателен (в калибровке только 's2.1-pro-free').
 * @returns {{ audio: Buffer, words: {text,start,end}[], durationSec: number|null }}
 */
export async function tts({ text, voiceId, model, format, sampleRate, normalize, prosody }) {
  if (!model) throw new Error('tts: model обязателен (без значения по умолчанию)');
  if (!text || !voiceId) throw new Error('tts: text и voiceId обязательны');
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
  const { audio, words } = assembleTimestampEvents(events);
  return { audio, words, durationSec: format === 'wav' ? wavDurationSec(audio) : null };
}

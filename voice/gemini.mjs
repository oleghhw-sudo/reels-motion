// Клиент Gemini TTS без SDK (задача 007). Ключ — только из окружения: node --env-file=.env … (GEMINI_API_KEY,
// env.manifest.json → env.vars). Модель и голос — без значений по умолчанию (гейт 2): передаются явно.
//
// tts()        → POST /v1beta/models/<model>:generateContent (unary): WAV 24 кГц моно 16 бит (по документации) →
//                ресемплинг ffmpeg swr → 48 кГц, тем же фильтром, что в 002 (voice/run.mjs).
// listVoices() → GET /v1beta/voices (каталог, бесплатно).
// Gemini TTS таймингов слов НЕ даёт — их даёт voice/align.mjs по готовому аудио.
import { spawnSync } from 'node:child_process';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const OUT_SR = 48000;
export const RESAMPLE = `aresample=${OUT_SR}:resampler=swr:filter_size=64:phase_shift=10:cutoff=0.97`;
const RETRY_429 = [5, 15, 45]; // с — как voice/run.mjs; остальные ошибки без повторов

export class GeminiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new GeminiError(0, 'GEMINI_API_KEY не задан. Запуск: node --env-file=.env voice/<скрипт>.mjs (ключ — в .env, см. env.manifest.json)');
  return k;
}

async function fail(res, what) {
  let detail = '';
  try {
    const j = await res.json();
    detail = j.error?.message ?? JSON.stringify(j).slice(0, 300);
  } catch {
    /* тело не JSON */
  }
  const s = res.status;
  const d = detail ? ` — ${detail}` : '';
  if (s === 400) throw new GeminiError(s, `${what}: 400 — неверный запрос (модель/голос/тело)${d}`);
  if (s === 401) throw new GeminiError(s, `${what}: 401 — ключ не принят (GEMINI_API_KEY)${d}`);
  if (s === 403) throw new GeminiError(s, `${what}: 403 — нет доступа (ключ без прав на API, регион или модель недоступна на тарифе)${d}`);
  if (s === 429) throw new GeminiError(s, `${what}: 429 — лимит бесплатного тарифа (запросы/мин или в сутки)${d}`);
  if (s >= 500) throw new GeminiError(s, `${what}: ${s} — ошибка сервера Google, не повторяю${d}`);
  throw new GeminiError(s, `${what}: HTTP ${s}${d}`);
}

async function withRetry429(fn, label) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof GeminiError && e.status === 429 && attempt < RETRY_429.length) {
        console.log(`  ${label}: 429, повтор через ${RETRY_429[attempt]} с`);
        await new Promise((r) => setTimeout(r, RETRY_429[attempt] * 1000));
        continue;
      }
      throw e;
    }
  }
}

/** Голоса. Поля REST бывают camelCase или snake_case — читаем оба. Все страницы до pageSize итогов. */
export async function listVoices({ search, languageCode, pageSize }) {
  const out = [];
  let token = '';
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ page_size: String(pageSize) });
    if (search) q.set('search', search);
    if (languageCode) q.set('language_code', languageCode);
    if (token) q.set('page_token', token);
    const res = await withRetry429(async () => {
      const r = await fetch(`${BASE}/voices?${q}`, { headers: { 'x-goog-api-key': apiKey() } });
      if (!r.ok) await fail(r, 'GET /v1beta/voices');
      return r;
    }, 'voices');
    const j = await res.json();
    for (const v of j.voices ?? []) {
      out.push({
        id: v.id ?? v.name ?? null,
        name: v.displayName ?? v.display_name ?? v.id ?? v.name,
        description: v.description ?? '',
        gender: v.gender ?? null,
        languageCode: v.languageCode ?? v.language_code ?? null,
        accent: v.accent ?? null,
        pitch: v.pitch ?? null,
        type: v.type ?? null,
      });
    }
    token = j.nextPageToken ?? j.next_page_token ?? '';
    if (!token) break;
  }
  return out;
}

/** WAV-заголовок: частота, каналы, бит, смещение и длина data. */
export function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let p = 12;
  const fmt = {};
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') Object.assign(fmt, { channels: buf.readUInt16LE(p + 10), sampleRate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) });
    if (id === 'data') return { ...fmt, dataOffset: p + 8, dataBytes: Math.min(size, buf.length - p - 8) };
    p += 8 + size + (size % 2);
  }
  return null;
}

/** Ресемплинг WAV → WAV 48 кГц s16 через ffmpeg (stdin → stdout). */
export function resampleTo48k(wav) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-af', RESAMPLE, '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'], { input: wav, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ресемплинг: ${r.stderr.toString().slice(-300)}`);
  return r.stdout;
}

/**
 * TTS. model, voice — обязательны. style — необязателен (Google советует начинать с пустого).
 * Ответ по документации — WAV (RIFF) 24 кГц; если пришёл сырой PCM (audio/L16) — оборачиваем по rate из mimeType.
 * @returns {{ wav: Buffer, sampleRate: 48000, durationSec: number, meta: object }}
 */
export async function tts({ text, voice, model, style }) {
  if (!model) throw new Error('tts: model обязателен (без значения по умолчанию)');
  if (!voice) throw new Error('tts: voice обязателен');
  if (!text) throw new Error('tts: text обязателен');
  const part = { text };
  if (style) part.speech_metadata = { style };
  const body = { contents: [{ role: 'user', parts: [part] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice } } } };
  const res = await withRetry429(async () => {
    const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) await fail(r, `POST ${model}:generateContent`);
    return r;
  }, `tts ${voice}`);
  const j = await res.json();
  const inline = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const data = inline?.inlineData ?? inline?.inline_data;
  if (!data?.data) throw new GeminiError(200, `ответ без аудио: finishReason=${j.candidates?.[0]?.finishReason ?? '—'} ${JSON.stringify(j.promptFeedback ?? {}).slice(0, 200)}`);
  let src = Buffer.from(data.data, 'base64');
  const mime = data.mimeType ?? data.mime_type ?? null;
  let info = parseWav(src);
  let container = 'wav';
  if (!info) {
    // сырой PCM s16le: частота из mimeType (audio/L16;rate=24000), иначе 24000 по документации
    const rate = Number(/rate=(\d+)/.exec(mime ?? '')?.[1] ?? 24000);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0, 'ascii'); h.writeUInt32LE(36 + src.length, 4); h.write('WAVE', 8, 'ascii'); h.write('fmt ', 12, 'ascii');
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
    h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36, 'ascii'); h.writeUInt32LE(src.length, 40);
    src = Buffer.concat([h, src]);
    info = parseWav(src);
    container = 'pcm';
  }
  const wav = resampleTo48k(src);
  const out = parseWav(wav);
  return {
    wav,
    sampleRate: OUT_SR,
    durationSec: out.dataBytes / (OUT_SR * 2),
    meta: {
      model,
      voice,
      style: style ?? null,
      modelVersion: j.modelVersion ?? null,
      mimeType: mime,
      sourceContainer: container,
      source: { sampleRate: info.sampleRate, channels: info.channels, bits: info.bits, durationSec: info.dataBytes / (info.sampleRate * info.channels * (info.bits / 8)) },
      finishReason: j.candidates?.[0]?.finishReason ?? null,
      usageMetadata: j.usageMetadata ?? null,
    },
  };
}

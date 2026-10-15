// Часть Б калибровки (задача 002): голоса из voice/calibration.json × фразы voice/phrases.uk.json →
// out/voice/<slug>/<n>.wav (48 кГц) + <n>.words.json, метрики, out/voice/report.md, out/voice/listen.html.
// Запуск только через calibrate.mjs --run. voice/calibration.json скрипт только ЧИТАЕТ (гейт 5).
//
// Формат (ревью 002-A): запрашиваем pcm 44100 моно s16le (48000 для pcm сервер отклоняет: 400), собираем WAV
// одним заголовком (fish.mjs pcmToWav), затем ffmpeg swr → 48000 Гц. Тайминги от ресемплинга не меняются.
// Модель — константа MODEL, единственная в файле; каждый запрос пишет её в <n>.words.json (проверка «нет платных»).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FishError, tts } from './fish.mjs';
import { phraseMetrics } from './metrics.mjs';
import { writeListenPage } from './listen.mjs';

export const MODEL = 's2.1-pro-free';
const REQUEST = { format: 'pcm', sampleRate: 44100, normalize: false };
const OUT_SR = 48000;
const RETRY_429 = [5, 15, 45]; // с; 402 и прочие ошибки — без повторов

export const SCALE = [
  ['Естественность', '1 — «робот / артефакты», 3 — «живой, но заметно синтетический», 5 — «не отличить от диктора»'],
  ['Ударения и произношение', '1 — «≥2 ошибки во фразе», 3 — «1 ошибка», 5 — «без ошибок, ’ и ґ корректны»'],
  ['Темп и интонация под Reels', '1 — «монотонно/медленно», 3 — «нормально», 5 — «энергично и разборчиво»'],
  ['Синхрон подсветки', '1 — «уезжает > 0.3 с», 3 — «местами», 5 — «слово в слово»'],
];

function readJson(file, what) {
  if (!existsSync(file)) throw new Error(`${what}: нет файла ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function ff(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr.slice(-400)}`);
  return r;
}

const probeDuration = (file) => Number(ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout.trim());

/** Integrated LUFS и true peak (dBTP) через ebur128; итоговый блок Summary в stderr. */
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const summary = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = summary.match(/I:\s+(-?[\d.]+|-inf)\s+LUFS/);
  const tp = summary.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/);
  const num = (m) => (m && m[1] !== '-inf' ? Number(m[1]) : null);
  return { lufs: num(lufs), truePeakDb: num(tp) };
}

async function ttsWithRetry(args, label) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tts(args);
    } catch (e) {
      if (e instanceof FishError && e.status === 429 && attempt < RETRY_429.length) {
        console.log(`  ${label}: 429, повтор через ${RETRY_429[attempt]} с`);
        await new Promise((r) => setTimeout(r, RETRY_429[attempt] * 1000));
        continue;
      }
      throw e;
    }
  }
}

/** Названия голосов из производных списков --list (если есть); иначе — только id. */
function voiceTitles(outDir) {
  const titles = {};
  for (const f of ['candidates.json', 'candidates-uk.json']) {
    const p = join(outDir, f);
    if (existsSync(p)) for (const v of JSON.parse(readFileSync(p, 'utf8')).voices ?? []) titles[v.id] = v.title;
  }
  return titles;
}

export async function run({ root, outDir }) {
  const calib = readJson(join(root, 'voice', 'calibration.json'), 'voice/calibration.json (создаёт Олег)');
  const { phrases } = readJson(join(root, 'voice', 'phrases.uk.json'), 'voice/phrases.uk.json');
  if (!Array.isArray(calib.voices) || calib.voices.length === 0) throw new Error('voice/calibration.json: поле voices — непустой массив id');
  const titles = voiceTitles(outDir);
  console.log(`FISH_API_KEY ${process.env.FISH_API_KEY ? 'задан' : 'НЕ задан'}; модель ${MODEL}; формат ${REQUEST.format} ${REQUEST.sampleRate} → WAV ${OUT_SR}`);
  console.log(`Голосов: ${calib.voices.length}, фраз: ${phrases.length}, запросов: ${calib.voices.length * phrases.length}\n`);

  const results = [];
  for (const voiceId of calib.voices) {
    const slug = voiceId.slice(0, 8);
    const dir = join(outDir, slug);
    mkdirSync(dir, { recursive: true });
    const voice = { id: voiceId, slug, title: titles[voiceId] ?? voiceId, url: `https://fish.audio/m/${voiceId}/`, phrases: [] };
    for (const ph of phrases) {
      const label = `${slug} #${ph.n}`;
      const r = await ttsWithRetry({ text: ph.text, voiceId, model: MODEL, ...REQUEST }, label);
      const raw = join(dir, `${ph.n}.raw44k.wav`);
      const wav = join(dir, `${ph.n}.wav`);
      writeFileSync(raw, r.audio);
      ff('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', `aresample=${OUT_SR}:resampler=swr:filter_size=64:phase_shift=10:cutoff=0.97`, '-c:a', 'pcm_s16le', wav]);
      rmSync(raw);
      const wavDurationSec = probeDuration(wav);
      const m = phraseMetrics({ text: ph.text, words: r.words, wavDurationSec, loudness: loudness(wav) });
      const meta = { model: MODEL, request: REQUEST, outSampleRate: OUT_SR, events: r.events, chunks: r.chunks, pcmDurationSec: r.durationSec, reportedDurationSec: r.reportedDurationSec };
      writeFileSync(join(dir, `${ph.n}.words.json`), `${JSON.stringify({ voiceId, phrase: ph, meta, words: r.words }, null, 2)}\n`);
      voice.phrases.push({ ...ph, wav: `${slug}/${ph.n}.wav`, words: r.words, meta, metrics: m });
      const miss = [...m.coverage.missing.map((x) => `−${x.word}`), ...m.coverage.extra.map((x) => `+${x.word}`)].join(' ');
      console.log(
        `${label}  ${m.ok ? 'OK  ' : 'FAIL'}  слова ${m.coverage.matched}/${m.coverage.textWords}${miss ? ` [${miss}]` : ''}  монот ${m.monotonic.ok ? 'да' : 'НЕТ'}  конец ${m.end.gapMs} мс  пауз>400 ${m.pauses.length}  ${m.tempo.wpm} сл/мин  ${m.tempo.cps} симв/с  ${m.loudness.lufs} LUFS  ${m.loudness.truePeakDb} dBTP  (${wavDurationSec.toFixed(2)} с, чанков ${r.chunks})`,
      );
    }
    results.push(voice);
  }

  const models = new Set(results.flatMap((v) => v.phrases.map((p) => p.meta.model)));
  const summary = { generatedAt: new Date().toISOString(), model: MODEL, modelsUsed: [...models], request: REQUEST, outSampleRate: OUT_SR, voices: results.map(({ phrases: ps, ...v }) => ({ ...v, phrases: ps.map(({ words, ...p }) => p) })) };
  writeFileSync(join(outDir, 'metrics.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, 'report.md'), reportMd(results));
  const listen = writeListenPage({ outDir, voices: results, scale: SCALE });
  console.log(`\nМодели в запросах: ${[...models].join(', ')}`);
  console.log(`${join(outDir, 'report.md')}\n${join(outDir, 'metrics.json')}\n${listen}`);
  return results;
}

const fmt = (x, d = 1) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));

function reportMd(voices) {
  const L = [];
  L.push('# Калибровка голоса — сводка (задача 002)', '');
  L.push(`Модель: \`${MODEL}\` · запрос: ${REQUEST.format} ${REQUEST.sampleRate} Гц, normalize=false → WAV ${OUT_SR} Гц · автометрики без ASR.`, '');
  L.push('Оценочная шкала (1–5):', '');
  for (const [k, v] of SCALE) L.push(`- **${k}**: ${v}`);
  L.push('', 'Колонки: Слова — совпало/в тексте, расхождения поимённо (−нет в alignment, +лишнее); Конец — WAV минус конец последнего слова; cps — символы без пробелов / отрезок речи (как в readcheck).', '');
  for (const v of voices) {
    L.push(`## ${v.title} — \`${v.id}\``, '', v.url, '');
    L.push('| # | Проверка | Вердикт | Слова | Монот. | Конец, мс | Паузы > 400 мс | сл/мин | cps | LUFS | dBTP | Естеств. | Ударения | Темп | Синхрон |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const p of v.phrases) {
      const m = p.metrics;
      const diff = [...m.coverage.missing.map((x) => `−${x.word}`), ...m.coverage.extra.map((x) => `+${x.word}`)].join(' ');
      const pauses = m.pauses.map((x) => `${x.after}→${x.before} ${x.ms}`).join('; ') || '—';
      L.push(`| ${p.n} | ${p.checks} | ${m.ok ? 'OK' : 'FAIL'} | ${m.coverage.matched}/${m.coverage.textWords}${diff ? ` ${diff}` : ''} | ${m.monotonic.ok ? 'да' : 'НЕТ'} | ${m.end.gapMs} | ${pauses} | ${fmt(m.tempo.wpm)} | ${fmt(m.tempo.cps, 2)} | ${fmt(m.loudness?.lufs)} | ${fmt(m.loudness?.truePeakDb)} |  |  |  |  |`);
    }
    const main = v.phrases.filter((p) => p.n <= 5 && p.metrics.tempo.cps !== null);
    const avg = (f) => (main.length ? main.reduce((sum, p) => sum + f(p), 0) / main.length : null);
    L.push('', `Среднее по фразам 1–5: ${fmt(avg((p) => p.metrics.tempo.wpm))} сл/мин, ${fmt(avg((p) => p.metrics.tempo.cps), 2)} cps.`, '');
  }
  return `${L.join('\n')}\n`;
}

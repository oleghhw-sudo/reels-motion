#!/usr/bin/env node
// Превью музыки ролика «Юридичний контур АНЦ» (задача 032 п. 3): кандидат из videos/yurkontur/music/candidates.json
// под отрезок ролика с одобренной озвучкой (videos/yurkontur/voice/approved.json), видео — готовый аниматик отрезка.
//   1. Голос и трек сверяются по sha256 манифестов (вне репо по path); несовпадение — exit 1.
//   2. Музыка: позиция трека = время ролика + --offset; приглушение на фразах — огибающая из words.json (фразы = слова
//      с паузами < 0.6 с): под речью музыка на DUCK_DB ниже речи, в паузах ≥ 0.6 с поднимается на LIFT_DB;
//      атака 0.15 с, отпускание 0.45 с; вход 0.5 с, выход — затухание к концу ролика (локап).
//   3. Сумма → loudnorm (два прохода, линейно) до −16 LUFS, true peak −1.5 dBTP; затем замер ebur128.
//   4. Проверки (exit 1 при нарушении): итог −16 ± 0.5 LUFS, TP ≤ −1 dBTP, музыка под речью на 18…22 дБ ниже речи.
//   --self-test — позитивный контроль: та же сборка с музыкой +10 дБ обязана провалить проверку «под речью».
// Запуск: node videos/yurkontur/music-preview.mjs --track 2a0f4530 --video out/yurkontur/animatic/032-b4-6.mp4 \
//           --from 100 --to 159.005 [--offset 0] --out out/yurkontur/music/preview-2a0f4530.mp4
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const selfTest = process.argv.includes('--self-test');
const trackId = arg('--track');
const video = arg('--video');
const FROM = Number(arg('--from'));
const TO = Number(arg('--to'));
const OFFSET = Number(arg('--offset') ?? 0);
const out = arg('--out');
if (!trackId || (!selfTest && (!video || !out)) || !Number.isFinite(FROM) || !Number.isFinite(TO) || TO <= FROM) {
  console.error('Использование: music-preview.mjs --track <id> --from S --to S [--offset S] --video <mp4> --out <mp4> | --self-test --track <id> --from S --to S');
  process.exit(1);
}

/** Уровни (решение Олега 09.11): под речью −18…−22 дБ относительно речи; цель — середина. */
const DUCK_DB = 20;
const LIFT_DB = 5;
const PHRASE_GAP = 0.6;
const ATTACK = 0.15;
const RELEASE = 0.45;
const TARGET = { I: -16, TP: -1.5, LRA: 11 };
const SR = 48000;

const expand = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const run = (args, quiet = true) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...(quiet ? ['-v', 'info'] : []), '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr.slice(-600)}`);
  return r.stderr;
};
const die = (m) => {
  console.error(m);
  process.exit(1);
};

// ---------------------------------------------------------------- 1. сверка манифестов
const vman = JSON.parse(readFileSync(join(ROOT, 'videos/yurkontur/voice/approved.json'), 'utf8'));
const vdir = expand(vman.path);
const vfull = vman.files.find((f) => f.name === 'full.wav');
if (sha256(join(vdir, 'full.wav')) !== vfull.sha256) die(`озвучка ${vman.version}: full.wav не совпадает с approved.json`);
const words = JSON.parse(readFileSync(join(ROOT, 'videos/yurkontur/voice/words.json'), 'utf8'));
if (sha256(join(ROOT, 'videos/yurkontur/voice/words.json')) !== vman.files.find((f) => f.name === 'words.json').sha256) die('words.json репо отличается от одобренного');
const mman = JSON.parse(readFileSync(join(ROOT, 'videos/yurkontur/music/candidates.json'), 'utf8'));
const track = mman.tracks.find((t) => t.id === trackId);
if (!track) die(`нет кандидата ${trackId} в videos/yurkontur/music/candidates.json`);
const mfile = join(expand(mman.path), track.file);
if (!existsSync(mfile)) die(`нет файла ${mfile}`);
if (sha256(mfile) !== track.sha256) die(`${track.file}: sha256 не совпадает с манифестом`);
if (!track.commercialUse) die(`${track.title}: лицензия не разрешает коммерческое использование`);
const DUR = TO - FROM;
if (OFFSET + TO > track.durationSec) die(`трек ${track.durationSec} с короче нужного (${(OFFSET + TO).toFixed(1)} с)`);

// ---------------------------------------------------------------- 2. огибающая приглушения (время отрезка)
const ws = words.blocks.flatMap((b) => b.words).filter((w) => w.end > FROM - 1 && w.start < TO + 1);
const phrases = [];
for (const w of ws) {
  const last = phrases.at(-1);
  if (last && w.start - last[1] < PHRASE_GAP) last[1] = w.end;
  else phrases.push([w.start, w.end]);
}
const speechAt = (t) => phrases.some(([a, b]) => t >= a && t <= b);
const ENV_RATE = 1000; // точек в секунду; ffmpeg растянет до 48 кГц
const n = Math.ceil(DUR * ENV_RATE);
const env = new Float32Array(n);
let g = speechAt(FROM) ? 0 : 1; // 0 — под речью, 1 — подъём в паузе
for (let i = 0; i < n; i++) {
  const t = FROM + i / ENV_RATE;
  const want = speechAt(t) ? 0 : 1;
  const k = 1 / ((want < g ? ATTACK : RELEASE) * ENV_RATE);
  g += Math.sign(want - g) * Math.min(Math.abs(want - g), k);
  const fadeIn = Math.min(1, (t - FROM) / 0.5);
  const fadeOut = Math.min(1, Math.max(0, (TO - t) / 3.5));
  env[i] = 10 ** ((LIFT_DB * g) / 20) * fadeIn * fadeOut;
}
// WAV float32 моно на 1 кГц
function wavF32(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(32, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 4, 40);
  for (let i = 0; i < samples.length; i++) b.writeFloatLE(samples[i], 44 + i * 4);
  return b;
}
const WORK = join(ROOT, 'out/yurkontur/music/work', trackId);
mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, 'env.wav'), wavF32(env, ENV_RATE));

// ---------------------------------------------------------------- 3. уровни
const voiceCut = join(WORK, 'voice.wav');
run(['-ss', String(FROM), '-t', String(DUR), '-i', join(vdir, 'full.wav'), '-ac', '2', '-ar', String(SR), '-c:a', 'pcm_f32le', voiceCut]);
const musicCut = join(WORK, 'music.wav');
run(['-ss', String(FROM + OFFSET), '-t', String(DUR), '-i', mfile, '-ac', '2', '-ar', String(SR), '-c:a', 'pcm_f32le', musicCut]);
/** Интегральная громкость (LUFS) файла, опционально только по фразам речи. */
function lufs(file, onlySpeech = false) {
  let f = file;
  if (onlySpeech) {
    const sel = phrases.map(([a, b]) => `between(t,${Math.max(0, a - FROM).toFixed(3)},${Math.max(0, b - FROM).toFixed(3)})`).join('+');
    f = join(WORK, `sp-${Math.abs(hashStr(file))}.wav`);
    run(['-i', file, '-af', `aselect='${sel}',asetpts=N/SR/TB`, '-c:a', 'pcm_f32le', f]);
  }
  const e = run(['-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(e.slice(e.lastIndexOf('Summary')))?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(e.slice(e.lastIndexOf('Summary')))?.[1]);
  return { I, TP };
}
function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}
const voiceSp = lufs(voiceCut, true).I;
const musicI = lufs(musicCut).I;
// база: музыка под речью = речь − DUCK_DB. Громкость трека в моменты фраз отличается от средней по отрезку, поэтому
// второй проход поправляет базу по замеру подложки на тех же фразах (самотест: итог на 10 дБ громче)
const bed = join(WORK, 'bed.wav');
const buildBed = (gainDb) => run(['-i', musicCut, '-i', join(WORK, 'env.wav'), '-filter_complex', `[1:a]aresample=${SR},aformat=channel_layouts=stereo[e];[0:a]volume=${gainDb.toFixed(2)}dB[m];[m][e]amultiply[out]`, '-map', '[out]', '-c:a', 'pcm_f32le', bed]);
let baseGainDb = voiceSp - DUCK_DB - musicI;
buildBed(baseGainDb);
baseGainDb += voiceSp - lufs(bed, true).I - DUCK_DB;
baseGainDb += selfTest ? 10 : 0;
buildBed(baseGainDb);

// ---------------------------------------------------------------- 4. сведение, нормализация, замер
const sum = join(WORK, 'sum.wav');
run(['-i', voiceCut, '-i', bed, '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0:duration=first[out]', '-map', '[out]', '-c:a', 'pcm_f32le', sum]);
const p1 = run(['-i', sum, '-af', `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-']);
const ln = JSON.parse(p1.slice(p1.lastIndexOf('{'), p1.lastIndexOf('}') + 1));
const mix = join(WORK, 'mix.wav');
const lnArgs = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${ln.input_i}:measured_TP=${ln.input_tp}:measured_LRA=${ln.input_lra}:measured_thresh=${ln.input_thresh}:offset=${ln.target_offset}:linear=true`;
run(['-i', sum, '-af', `${lnArgs},aresample=${SR}`, '-c:a', 'pcm_s24le', mix]);
const fin = lufs(mix);
// музыка под речью относительно речи — по тем же фразам, после тех же усилений (нормализация линейная — одинаково для обоих)
const bedSp = lufs(bed, true).I;
const under = voiceSp - bedSp;

const rows = [
  ['итог, LUFS integrated', fin.I.toFixed(1), `${TARGET.I} ± 0.5`, Math.abs(fin.I - TARGET.I) <= 0.5],
  ['true peak, dBTP', fin.TP.toFixed(1), '≤ −1.0', fin.TP <= -1.0],
  ['музыка под речью, дБ ниже речи', under.toFixed(1), '18…22', under >= 18 && under <= 22],
];
console.log(`${track.title} — ${track.creator} (${track.license}, ${track.bpmMeasured} BPM) · отрезок ${FROM}–${TO} с, трек с ${(FROM + OFFSET).toFixed(1)} с${selfTest ? ' · САМОТЕСТ: музыка +10 дБ' : ''}`);
for (const [k, v, need, ok] of rows) console.log(`  ${ok ? 'OK ' : 'ПРОВАЛ'} ${k}: ${v} (нужно ${need})`);
const allOk = rows.every((r) => r[3]);

if (selfTest) {
  const caught = !rows[2][3];
  console.log(caught ? 'self-test: OK (громкая музыка поймана)' : 'self-test: ПРОВАЛ (громкая музыка не поймана)');
  process.exit(caught ? 0 : 1);
}
if (!allOk) die('Превью не собрано: уровни вне допуска');

// ---------------------------------------------------------------- 5. превью: видео аниматика + сведённый звук
mkdirSync(dirname(join(ROOT, out)), { recursive: true });
run(['-i', join(ROOT, video), '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', join(ROOT, out)]);
writeFileSync(join(WORK, 'levels.json'), JSON.stringify({ track: track.id, from: FROM, to: TO, offset: OFFSET, voiceSpeechLufs: +voiceSp.toFixed(2), musicLufsRaw: +musicI.toFixed(2), baseGainDb: +baseGainDb.toFixed(2), duckDb: DUCK_DB, liftDb: LIFT_DB, final: fin, musicUnderSpeechDb: +under.toFixed(2) }, null, 1));
console.log(`превью: ${out}`);

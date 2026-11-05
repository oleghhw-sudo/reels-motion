#!/usr/bin/env node
// audio/analyze/run.mjs — обёртка анализатора трека (задача 021).
//
//   npm run audio:analyze -- <file> --id <video-id> [--from S --to S] [--bpm-hint N]
//       → videos/<id>/beats.json, audio.json (производные, можно в git);
//         out/<id>/audio/clicks.wav, qa.png (+ work/: декодированный вход и стемы Demucs — кэш)
//   npm run audio:selftest [-- --negative]
//       → позитивные контроли на синтетике в out/_audio-selftest (selftest.py); --negative обязан упасть
//
// Среда (env.manifest.json → data_dirs, гейт 2 — дефолтов нет): ASR_PYTHON — python окружения с demucs и librosa
// (.venv-asr, audio/analyze/requirements.txt); AUDIO_MODELS_DIR — кэш весов Demucs. Значения — из окружения или .env.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const die = (m, code = 1) => { console.error(`audio:analyze: ${m}`); process.exit(code); };
const VALUED = ['--id', '--from', '--to', '--bpm-hint'];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : undefined; };

const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1');
const pyRaw = fromEnv('ASR_PYTHON');
if (!pyRaw) die('ASR_PYTHON не задан (окружение или .env) — python с demucs и librosa; см. env.manifest.json, проверка: npm run check -- --scope audio-analysis');
const python = isAbsolute(pyRaw) ? pyRaw : join(ROOT, pyRaw);
if (!existsSync(python)) die(`ASR_PYTHON=${pyRaw}: файла нет`);
const models = fromEnv('AUDIO_MODELS_DIR');
if (!models) die('AUDIO_MODELS_DIR не задан (окружение или .env) — каталог кэша весов Demucs; см. env.manifest.json, проверка: npm run check -- --scope audio-analysis');
const env = { ...process.env, AUDIO_MODELS_DIR: models };

if (args.includes('--self-test')) {
  const r = spawnSync(python, [join(HERE, 'selftest.py'), join(ROOT, 'out', '_audio-selftest'), ...(args.includes('--negative') ? ['--negative'] : [])], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

const unknown = args.filter((a) => a.startsWith('--') && !VALUED.includes(a));
const file = args.find((a, i) => !a.startsWith('--') && (i === 0 || !VALUED.includes(args[i - 1])));
const id = opt('--id');
if (unknown.length || !file || !id) die(`использование: npm run audio:analyze -- <file> --id <video-id> [--from S --to S] [--bpm-hint N]${unknown.length ? ` (неизвестно: ${unknown.join(' ')})` : ''}`);
if (!/^[\w.-]+$/.test(id)) die(`id «${id}»: только буквы, цифры, точка, дефис, подчёркивание`);
const videoDir = join(ROOT, 'videos', id);
if (!existsSync(videoDir) || !statSync(videoDir).isDirectory()) die(`папки videos/${id} нет — id ролика с опечаткой?`);
if (!existsSync(file)) die(`файл ${file} не найден`);

const outDir = join(ROOT, 'out', id, 'audio');
mkdirSync(outDir, { recursive: true });
const pass = VALUED.filter((n) => n !== '--id' && opt(n) !== undefined).flatMap((n) => [n, opt(n)]);
const r = spawnSync(python, [join(HERE, 'analyze.py'), file, outDir, ...pass], { stdio: 'inherit', env });
if (r.status !== 0) process.exit(r.status ?? 1); // 3 — «сетка не найдена»: в videos/<id> ничего не пишется

for (const f of ['beats.json', 'audio.json']) copyFileSync(join(outDir, f), join(videoDir, f));
const beats = JSON.parse(readFileSync(join(videoDir, 'beats.json'), 'utf8'));
console.log(`\nvideos/${id}/beats.json, audio.json — записаны. Прослушка: out/${id}/audio/clicks.wav, картинка: out/${id}/audio/qa.png`);
if (beats.downbeatConfidence === 'low') console.log('ВНИМАНИЕ: downbeatConfidence = low — сильная доля не подтверждена, прослушка clicks.wav обязательна (высокий громкий клик = сильная доля).');
if (beats.tempo === 'variable') console.log(`ВНИМАНИЕ: tempo = variable (отклонение от ровной сетки ${beats.gridDeviationMs} мс) — доли брать только из beats[], не считать по bpm.`);

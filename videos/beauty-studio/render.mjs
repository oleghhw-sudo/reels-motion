#!/usr/bin/env node
// Рендер и проверки ролика beauty-studio (один бандл на все кадры).
//   node videos/beauty-studio/render.mjs stills        — QA-кадры → out/stills/beauty/ (+ safe zones, BackgroundPicker)
//   node videos/beauty-studio/render.mjs video         — out/beauty-studio-reel.mp4 (H.264 high crf 18, yuv420p, 30 fps, AAC 48k 192k, faststart)
//   node videos/beauty-studio/render.mjs determinism   — кадр сцены 02 дважды → sha256 обязан совпасть
//   node videos/beauty-studio/render.mjs frames 12,345 — произвольные кадры
//   node videos/beauty-studio/render.mjs loudness      — ebur128 на готовом MP4: I ≈ −14 LUFS (±0.5), true peak ≤ −1 dBTP
//   node videos/beauty-studio/render.mjs sync [--self-test] — смены сцен в MP4 на кадрах round(доля·30) ±1
//                                                       (--self-test: сетка, сдвинутая на 4 кадра, обязана УПАСТЬ)
// Перед первым запуском: prepare-assets.mjs (ассеты) и npm run check -- --scope beauty-studio.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BUNDLE = join(ROOT, 'out', 'bundle');
const STILLS = join(ROOT, 'out', 'stills', 'beauty');
const MP4 = join(ROOT, 'out', 'beauty-studio-reel.mp4');
const COMP = 'BeautyStudioReel';
const [mode, arg] = process.argv.slice(2);
const SCENES = parseYaml(readFileSync(join(HERE, 'scenes.yaml'), 'utf8'));
const FPS = SCENES.format.fps;

const die = (msg) => {
  console.error(`\nОТКАЗ render: ${msg}`);
  process.exit(1);
};
const sh = (args) => {
  const r = spawnSync('npx', ['remotion', ...args, '--log=error'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')}\n${String(r.stderr).slice(-1500)}`);
  return r;
};
const bundle = () => {
  if (!existsSync(join(HERE, 'assets.manifest.json'))) die('нет videos/beauty-studio/assets.manifest.json — сначала prepare-assets.mjs');
  sh(['bundle', 'src/index.ts', `--out-dir=${BUNDLE}`]);
  mkdirSync(STILLS, { recursive: true });
};
const still = (frame, name, props) => {
  const out = join(STILLS, `${name}.png`);
  const a = ['still', BUNDLE, COMP, out, `--frame=${frame}`];
  if (props) a.push(`--props=${JSON.stringify(props)}`);
  sh(a);
  return out;
};

// Кадры смены сцен: round(from · fps) — from в scenes.yaml стоят на сильных долях.
const boundaries = () => SCENES.scenes.slice(1).map((s) => ({ id: s.id, sec: s.from, frame: Math.round(s.from * FPS) }));

// по 2 кадра на сцену: «середина анимации» и «устоялось» (кадры — от границ сцен, см. scenes.yaml)
const QA = [
  [20, 'hook-a-mid'], [105, 'hook-b-settled'],
  [159, 'approach-a-mid'], [228, 'approach-b-settled'],
  [296, 'works-a-mid'], [360, 'works-b-settled'],
  [428, 'services-a-mid'], [523, 'services-b-settled'],
  [549, 'details-a-mid'], [610, 'details-b-settled'],
  [652, 'studio-a-mid'], [700, 'studio-b-settled'],
  [767, 'contacts-a-mid'], [815, 'contacts-b-settled'],
  [862, 'logo-a-mid'], [959, 'logo-b-settled'],
];
const SAFE = [[105, 'safe-hook'], [470, 'safe-services'], [815, 'safe-contacts']];
const DET_FRAME = 300; // 02 Наші роботи, кадры в полёте

if (mode === 'stills') {
  bundle();
  for (const [f, n] of QA) console.log(still(f, `${String(f).padStart(3, '0')}-${n}`));
  for (const [f, n] of SAFE) console.log(still(f, `${String(f).padStart(3, '0')}-${n}`, { showSafeZones: true }));
  sh(['still', BUNDLE, 'BackgroundPicker', join(STILLS, 'background-picker.png')]);
} else if (mode === 'frames') {
  bundle();
  for (const f of (arg ?? '').split(',').filter(Boolean)) console.log(still(Number(f), `f${f.padStart(3, '0')}`));
} else if (mode === 'determinism') {
  bundle();
  const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const a = h(still(DET_FRAME, 'det-a'));
  const b = h(still(DET_FRAME, 'det-b'));
  console.log(`кадр ${DET_FRAME} (02 Наші роботи): ${a}\n${' '.repeat(26)}${b}`);
  if (a !== b) die('ДЕТЕРМИНИЗМ НАРУШЕН');
  console.log('OK: sha256 совпадают');
} else if (mode === 'video') {
  bundle();
  const tmp = MP4.replace(/\.mp4$/, '.tmp.mp4');
  sh([
    'render', BUNDLE, COMP, tmp,
    '--codec=h264', '--crf=18', '--pixel-format=yuv420p', '--audio-codec=aac', '--audio-bitrate=192k', '--concurrency=100%',
  ]);
  // faststart: moov в начало (без перекодирования)
  run('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c', 'copy', '-movflags', '+faststart', MP4]);
  rmSync(tmp, { force: true });
  const p = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', MP4]).stdout);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const au = p.streams.find((s) => s.codec_type === 'audio');
  console.log(`${MP4}\n  видео: ${v.codec_name} ${v.profile} ${v.width}×${v.height} ${v.pix_fmt} ${v.r_frame_rate} кадров ${v.nb_frames}` +
    `\n  звук: ${au.codec_name} ${au.sample_rate} Гц ${au.channels} кан ${Math.round(au.bit_rate / 1000)} кбит/с\n  длительность ${p.format.duration} с`);
} else if (mode === 'loudness') {
  if (!existsSync(MP4)) die(`нет ${MP4} — сначала режим video`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', MP4, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const sum = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const I = Number(sum.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const TP = Number(sum.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const LRA = Number(sum.match(/LRA:\s+(-?[\d.]+) LU/)?.[1]);
  console.log(`integrated ${I} LUFS · true peak ${TP} dBTP · LRA ${LRA} LU`);
  const bad = [];
  if (!(Math.abs(I - -14) <= 0.5)) bad.push(`I ${I} вне −14 ± 0.5 LUFS — подстройте music.gain в scenes.yaml (×10^(Δ/20))`);
  if (!(TP <= -1)) bad.push(`true peak ${TP} > −1 dBTP`);
  if (bad.length) die(bad.join('; '));
  console.log('OK: громкость');
} else if (mode === 'sync') {
  if (!existsSync(MP4)) die(`нет ${MP4} — сначала режим video`);
  const selfTest = process.argv.includes('--self-test');
  // Кадры в серых 54×96. d[f] — средний |ΔY| кадров f−1→f по всему кадру, dB[f] — по нижним 20%
  // (шторка входит снизу). Смена сцены = момент, где меняется ДИНАМИКА картинки: скачок
  // onset[f] = max(|d[f] − d[f−1]|, |dB[f] − dB[f−1]|). Пик самой d не годится: у уходящей сцены
  // своё движение (полёт кадров 02, смена лиц 04), а шторка dark→dark почти не меняет пиксели.
  const W = 54, H = 96, N = W * H, B0 = Math.floor(H * 0.8) * W;
  const raw = run('ffmpeg', ['-v', 'error', '-i', MP4, '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { binary: true }).stdout;
  const frames = raw.length / N;
  const d = new Float64Array(frames);
  const dB = new Float64Array(frames);
  for (let f = 1; f < frames; f++) {
    let acc = 0, accB = 0;
    for (let i = 0; i < N; i++) {
      const x = Math.abs(raw[f * N + i] - raw[(f - 1) * N + i]);
      acc += x;
      if (i >= B0) accB += x;
    }
    d[f] = acc / N;
    dB[f] = accB / (N - B0);
  }
  const onset = (f) => (f < 2 ? 0 : Math.max(Math.abs(d[f] - d[f - 1]), Math.abs(dB[f] - dB[f - 1])));
  const shift = selfTest ? 4 : 0; // позитивный контроль: ожидание сдвинуто на 4 кадра → обязано упасть
  let bad = 0;
  console.log(`кадров в MP4: ${frames}${selfTest ? '  (SELF-TEST: ожидаемые кадры сдвинуты на +4)' : ''}`);
  console.log('сцена      доля, с   ожид. кадр  скачок в окне ±6  Δкадр  скачок  d[f−1]→d[f]  низ dB[f−1]→dB[f]');
  for (const b of boundaries()) {
    const want = b.frame + shift;
    let best = b.frame - 6;
    for (let f = b.frame - 6; f <= b.frame + 6; f++) if (f > 1 && f < frames && onset(f) > onset(best)) best = f;
    const ok = Math.abs(best - want) <= 1;
    if (!ok) bad++;
    console.log(
      `${b.id.padEnd(10)} ${b.sec.toFixed(3).padStart(7)}   ${String(want).padStart(5)}        ${String(best).padStart(5)}        ${String(best - want).padStart(3)}  ${onset(best).toFixed(1).padStart(6)}  ${d[best - 1].toFixed(1)}→${d[best].toFixed(1)}  ${dB[best - 1].toFixed(1)}→${dB[best].toFixed(1)}  ${ok ? '✓' : '✗'}`,
    );
  }
  if (bad) die(`смен сцен не на доле: ${bad}`);
  console.log('OK: все смены сцен на кадрах сильных долей (±1)');
} else {
  die('режим: stills | video | determinism | frames <n,n> | loudness | sync [--self-test]');
}

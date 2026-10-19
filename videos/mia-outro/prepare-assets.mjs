#!/usr/bin/env node
// Ассеты аутро MIA → videos/mia-outro/assets/ (gitignore) + public/videos/mia-outro (ссылка) + assets.manifest.json + out/mia-outro/license-report.md
//   npm run mia:prepare            (= node --experimental-strip-types videos/mia-outro/prepare-assets.mjs)
// Источник — ТОЛЬКО MIA_SHORT_DIR (env.manifest.json → data_dirs; окружение или .env). Исходники не меняются: читаются и перекодируются копии.
// Данные — videos/mia-outro/outro.yaml (невосстановимое, только чтение). Вырезка фигур здесь НЕ делается: берутся готовые *_cut.png,
// по их альфе строятся слои обводки (сглаженный силуэт: тонкие пряди без обводки — метод card_concept.py архитектора).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildTimeline, checkZones, parseOutro, sfxPlan, zonesFrom, zonesFromShots } from '../../src/videos/mia-outro/model.ts';

const SCRIPT_VERSION = '2.1.0'; // 2.0 — динамика v2: погоня, impact-слои, звук v2 из SFX_EXTERNAL_DIR; 2.1 — звуковой бюджет v3 (задача 018): sfx.whip.on, sfx.riser.heroes, card необязателен
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'assets');
const PUBLIC_LINK = join(ROOT, 'public', 'videos', 'mia-outro');
const die = (m) => { console.error(`\nОТКАЗ prepare-assets (mia-outro): ${m}\n`); process.exit(1); };
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0) die(`${cmd} ${args.slice(0, 8).join(' ')}… → exit ${r.status}\n${(r.stderr || '').slice(-1500)}`);
  return r.stdout;
};
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim();

// ---------------------------------------------------------------- источник и данные
const DIR = fromEnv('MIA_SHORT_DIR');
if (!DIR) die('MIA_SHORT_DIR не задан (окружение или .env). Пример: MIA_SHORT_DIR="/Users/…/MIA short" npm run mia:prepare');
const A = join(DIR, '_outro-analysis');
for (const rel of ['shots.json', 'src', 'cards']) if (!existsSync(join(A, rel))) die(`MIA_SHORT_DIR=${DIR}: нет _outro-analysis/${rel}`);
const yamlPath = join(HERE, 'outro.yaml');
// разбор и проверка ссылок (схема, sfx.whip.on / sfx.riser.heroes) — до rmSync(OUT): ошибка в yaml не стирает готовые ассеты
let outro;
try { outro = parseOutro(parse(readFileSync(yamlPath, 'utf8'))); } catch (e) { die(e.message); }
const shotsPath = join(A, 'shots.json');
const shotZones = zonesFromShots(JSON.parse(readFileSync(shotsPath, 'utf8')));
const fps = outro.format.fps;
const L = outro.format.landscape;
const P = outro.format.portrait;
const srcFile = (id) => {
  for (const ext of ['mp4', 'mov']) { const f = join(A, 'src', `${id}.${ext}`); if (existsSync(f)) return f; }
  die(`нет исходника ${id} в ${join(A, 'src')}`);
};
const probe = (f) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', f]));
  const s = j.streams[0];
  const [a, b] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: a / b, durationSec: Number(j.format.duration) };
};

rmSync(OUT, { recursive: true, force: true });
for (const d of ['live', 'cards', 'bg', 'grain', 'sfx']) mkdirSync(join(OUT, d), { recursive: true });
const assets = [];
const add = (rel, extra = {}) => { assets.push({ file: rel, sha256: sha256(join(OUT, rel)), ...extra }); return rel; };

// ---------------------------------------------------------------- проверка зон до работы с медиа (та же функция, что в композиции)
const episodes = {};
for (const ep of Object.keys(outro.episodes)) {
  const tl = buildTimeline(outro, ep);
  const z = checkZones(tl, zonesFrom(outro, shotZones));
  if (z.errors.length) die(`${ep}: запретные зоны:\n  ✗ ${z.errors.join('\n  ✗ ')}`);
  episodes[ep] = tl;
  console.log(`✓ ${ep}: ${tl.items.length} пунктов, ${tl.durationInFrames} кадров; зоны чисты${z.allowed.length ? ` (${z.allowed.length} вырезок в зоне «только кроп» допущено)` : ''}`);
}

// ---------------------------------------------------------------- живые планы: точные кадры исходника → 16:9 и высокая версия под 9:16
const srcInfo = {};
const live = {};
for (const [ep, tl] of Object.entries(episodes)) {
  for (const p of tl.items) {
    if (p.kind === 'card' || !p.srcFrames) continue;
    const { src, from, to } = p.srcFrames;
    const key = `${src}_f${from}-${to}`;
    if (live[key]) continue;
    const f = srcFile(src);
    srcInfo[src] ??= { file: basename(f), sha256: sha256(f), ...probe(f) };
    const info = srcInfo[src];
    if (Math.abs(info.fps - fps) > 1e-6) die(`${src}: ${info.fps} fps ≠ ${fps} (format.fps outro.yaml)`);
    const n = to - from + 1;
    const total = Math.round(info.durationSec * info.fps);
    if (to >= total) die(`${src}: кадр ${to} за концом файла (${total} кадров)`);
    const sel = `select='between(n\\,${from}\\,${to})',setpts=N/(${fps}*TB)`;
    const enc = ['-an', '-frames:v', String(n), '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-g', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    const land = `live/${key}.land.mp4`;
    const port = `live/${key}.port.mp4`;
    run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `${sel},scale=${L.w}:${L.h}:flags=lanczos`, ...enc, join(OUT, land)]);
    const portH = P.h;
    const portW = 2 * Math.round((portH * info.width) / info.height / 2);
    run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `${sel},scale=${portW}:${portH}:flags=lanczos`, ...enc, join(OUT, port)]);
    live[key] = {
      src, from, to, frames: n,
      land: add(land), port: add(port), portW, portH,
      // масштаб исходника в кадре: > 1 — апскейл (мягче)
      scaleLand: +(L.h / info.height).toFixed(3), scalePort: +(portH / info.height).toFixed(3),
    };
    console.log(`  ✓ ${key.padEnd(18)} ${n} кадров  ${info.width}×${info.height} → ${L.w}×${L.h} (×${live[key].scaleLand}), ${portW}×${portH} (×${live[key].scalePort})`);
  }
}

// ---------------------------------------------------------------- карточки: фигура по альфе готовой вырезки + слои обводки
// Раскладка 16:9 — как в эталоне (card_concept.py): фигура у края напротив имени, низ уходит за кадр на 40 px.
// 9:16 — своя (задача 008): фигура снизу по центру, имя сверху (ниже safe zone 220 px).
const HERO_H = { MIA: 1150, DARK: 1240, BLOND: 1250, OFFICER: 1250 }; // высота фигуры в кадре 16:9, px (эталон; DARK — как в прототипе 008)
// Подчистка готовых вырезок (решение Олега): у DARK_new2_cut.png у правого края — кусок руки MIA. Маска: «кожа»
// (R > 0.55, R−G > 0.10, R−B > 0.14) только в окне у правого края + эллипс по контуру руки; исходный PNG не меняется.
const CLEANUP = {
  'DARK_new2_cut.png': { skin: { x0: 596, y0: 350, y1: 470 }, ellipse: [642, 412, 20, 26], why: 'кусок руки MIA у правого края' },
};
const PAD = 60;
const { white: OW, black: OB, shadow: OS } = outro.card.outline;
const cards = {};
const cutDir = join(DIR, outro.card.cutouts);
const darken = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k))).map((v) => v.toString(16).padStart(2, '0')).join('');
const lighten = (hex, k) => '#' + [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(v + (255 - v) * k); }).map((v) => v.toString(16).padStart(2, '0')).join('');
const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const tmp = join(OUT, '.tmp');
mkdirSync(tmp, { recursive: true });

for (const tl of Object.values(episodes)) {
  for (const p of tl.items) {
    if (p.kind !== 'card' || cards[p.hero]) continue;
    const origCut = join(cutDir, p.cutout);
    if (!existsSync(origCut)) die(`нет вырезки ${origCut}`);
    let cutPath = origCut;
    const cl = CLEANUP[p.cutout];
    if (cl) {
      const a = join(tmp, `${p.hero}.a.png`);
      const m = join(tmp, `${p.hero}.m.png`);
      const a2 = join(tmp, `${p.hero}.a2.png`);
      cutPath = join(tmp, `${p.hero}.clean.png`);
      run('magick', [origCut, '-alpha', 'extract', a]);
      run('magick', [origCut, '-alpha', 'off', '-fx', `(i>=${cl.skin.x0} && j>=${cl.skin.y0} && j<=${cl.skin.y1} && u.r>0.55 && (u.r-u.g)>0.10 && (u.r-u.b)>0.14) ? 1 : 0`, '-morphology', 'Dilate', 'Disk:4', '-fill', 'white', '-draw', `ellipse ${cl.ellipse.join(',').replace(/^(\d+),(\d+),/, '$1,$2 ')} 0,360`, m]);
      run('magick', [a, '(', m, '-negate', ')', '-compose', 'Multiply', '-composite', a2]);
      run('magick', [origCut, '-alpha', 'off', a2, '-compose', 'CopyOpacity', '-composite', cutPath]);
      const n = Number(run('magick', [m, '-format', '%[fx:mean*w*h]', 'info:']).trim());
      console.log(`  · подчистка ${p.cutout}: ${cl.why} — убрано ${Math.round(n)} px`);
    }
    const trimmed = join(tmp, `${p.hero}.trim.png`);
    run('magick', [cutPath, '-trim', '+repage', trimmed]);
    const [bw, bh] = run('magick', ['identify', '-format', '%w %h', trimmed]).trim().split(' ').map(Number);
    // какие края кадра исходника фигура касает (срез кадром): там обводки быть не должно, в 9:16 верхний срез растворяется в фон
    const edgeAlpha = (geom) => Number(run('magick', [cutPath, '-alpha', 'extract', '-crop', geom, '+repage', '-format', '%[fx:maxima]', 'info:']).trim());
    const [cw0, ch0] = run('magick', ['identify', '-format', '%w %h', cutPath]).trim().split(' ').map(Number);
    const touches = { top: edgeAlpha(`${cw0}x1+0+0`) > 0.5, bottom: edgeAlpha(`${cw0}x1+0+${ch0 - 1}`) > 0.5, left: edgeAlpha(`1x${ch0}+0+0`) > 0.5, right: edgeAlpha(`1x${ch0}+${cw0 - 1}+0`) > 0.5 };
    const entry = { hero: p.hero, cutout: p.cutout, cutoutSha256: sha256(origCut), cleanup: cl ? cl.why : null, bbox: { w: bw, h: bh }, touches, layout: {} };
    for (const [orient, F] of [['land', L], ['port', P]]) {
      let h = orient === 'land' ? HERO_H[p.hero] ?? 1200 : 1380;
      // 9:16: крупный план шире кадра допустим до 1.9× (бока уходят за край, лицо по центру); иначе фигура мелкая
      if (orient === 'port') h = Math.min(h, Math.round((1.9 * F.w * bh) / bw));
      const w = Math.round((h * bw) / bh);
      const x = orient === 'land' ? (p.side === 'left' ? F.w - w - 60 : 60) : Math.round((F.w - w) / 2 + (p.side === 'left' ? 40 : -40));
      const y = F.h - h + 40;
      const base = `cards/${p.hero}.${orient}`;
      const fig = join(OUT, `${base}.figure.png`);
      run('magick', [trimmed, '-filter', 'Lanczos', '-resize', `x${h}`, '-bordercolor', 'none', '-border', String(PAD), fig]);
      const solid = join(tmp, `${p.hero}.${orient}.solid.png`);
      // сглаженный силуэт: порог альфы 200 → открытие 15×15 (убрать пряди) → размытие 8 → порог 50 %
      run('magick', [fig, '-alpha', 'extract', '-threshold', '78%', '-morphology', 'Open', 'Square:7', '-blur', '0x8', '-threshold', '50%', solid]);
      for (const [name, px, col] of [['black', OB, 'black'], ['white', OW, 'white']]) {
        const mask = join(tmp, `${p.hero}.${orient}.${name}.mask.png`);
        run('magick', [solid, '-morphology', 'Dilate', `Disk:${px}`, '-blur', '0x1.2', mask]);
        run('magick', ['-size', `${run('magick', ['identify', '-format', '%wx%h', fig]).trim()}`, `xc:${col}`, mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', join(OUT, `${base}.${name}.png`)]);
      }
      // impact-кадр (#аниме): фигура жёстким ч/б-постером (порог яркости) + белый контур по силуэту
      run('magick', [fig, '-alpha', 'off', '-colorspace', 'Gray', '-blur', '0x1.5', '-threshold', '37%', '(', fig, '-alpha', 'extract', '-threshold', '50%', ')', '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', join(OUT, `${base}.poster.png`)]);
      const ringMask = join(tmp, `${p.hero}.${orient}.ring.mask.png`);
      run('magick', [solid, '-morphology', 'Dilate', 'Disk:12', ringMask]);
      run('magick', ['-size', `${run('magick', ['identify', '-format', '%wx%h', fig]).trim()}`, 'xc:white', ringMask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', join(OUT, `${base}.ring.png`)]);
      entry.layout[orient] = {
        figure: add(`${base}.figure.png`), black: add(`${base}.black.png`), white: add(`${base}.white.png`),
        poster: add(`${base}.poster.png`), ring: add(`${base}.ring.png`),
        // центр героя в кадре: из него — лучи, раскрытие фона кругом, линии скорости impact-кадра
        center: { x: Math.round(x + w / 2), y: Math.round(y + h * 0.4) },
        // позиция слоя (с полями PAD) в кадре и размер фигуры без полей
        x: x - PAD, y: y - PAD, w: w + 2 * PAD, h: h + 2 * PAD, pad: PAD, shadow: OS,
      };
    }
    // фон: растр точек (размер растёт слева направо, как в эталоне), цвет точек — от bg
    const dot = lum(p.bg) < 0.2 ? lighten(p.bg, 0.18) : darken(p.bg, 0.3);
    entry.bg = p.bg;
    entry.dot = dot;
    entry.rays = p.tagColor ?? (lum(p.bg) > 0.55 ? '#000000' : '#ffffff');
    entry.raysAlpha = p.tagColor ? 0.14 : lum(p.bg) > 0.55 ? 0.12 : 0.16;
    entry.bgLayer = {};
    for (const [orient, F] of [['land', L], ['port', P]]) {
      const step = 22;
      const maxr = 7;
      const lines = [];
      for (let y = -step, row = 0; y < F.h + step; y += step, row++)
        for (let x = -step; x < F.w + step; x += step) {
          const xx = x + (row % 2 ? step / 2 : 0);
          const r = maxr * (0.25 + 0.75 * Math.max(0, Math.min(1, xx / F.w)));
          lines.push(`circle ${xx.toFixed(1)},${y} ${(xx + r).toFixed(2)},${y}`);
        }
      const drawFile = join(tmp, `dots.${p.hero}.${orient}.mvg`);
      writeFileSync(drawFile, `fill '${dot}'\n${lines.join('\n')}\n`);
      const rel = `bg/${p.hero}.${orient}.dots.png`;
      run('magick', ['-size', `${F.w}x${F.h}`, 'xc:none', '-draw', `@${drawFile}`, join(OUT, rel)]);
      entry.bgLayer[orient] = add(rel);
    }
    cards[p.hero] = entry;
    console.log(`  ✓ карточка ${p.hero.padEnd(8)} срез кадром: ${Object.entries(touches).filter(([, v]) => v).map(([k]) => k).join(',') || 'нет'}; вырезка ${bw}×${bh} → 16:9 h${entry.layout.land.h - 2 * PAD}, 9:16 h${entry.layout.port.h - 2 * PAD}; точки ${dot}`);
  }
}

// зерно: 4 тайла с seed (детерминированно), выбираются по номеру кадра «на двойках»
const grain = [];
for (let k = 0; k < 4; k++) {
  const rel = `grain/grain-${k}.png`;
  run('magick', ['-seed', String(1000 + k), '-size', '512x512', 'xc:gray50', '-attenuate', '0.6', '+noise', 'Gaussian', '-colorspace', 'Gray', join(OUT, rel)]);
  grain.push(add(rel));
}

// ---------------------------------------------------------------- SFX v2: внешние (SFX_EXTERNAL_DIR, лицензия unknown → licenseWarning) + щелчок из нашей библиотеки
const EXT = fromEnv('SFX_EXTERNAL_DIR');
if (!EXT || !existsSync(join(EXT, 'index.json'))) die('SFX_EXTERNAL_DIR не задан или в нём нет index.json (env.manifest.json → data_dirs; обычно …/reels-motion/sfx/raw/external)');
const extIndex = JSON.parse(readFileSync(join(EXT, 'index.json'), 'utf8'));
const SFX_LUFS = -16; // каждый внешний звук сначала приводится к одной громкости (README: −38…−9 LUFS), потом ×gainVsMusic
const v = spawnSync('node', [join(ROOT, 'sfx', 'collect.mjs'), '--verify'], { encoding: 'utf8' });
if (v.status !== 0) die(`sfx/collect.mjs --verify: library не совпадает с manifest.json — npm run sfx:collect\n${(v.stdout + v.stderr).slice(-800)}`);
const sfxMan = JSON.parse(readFileSync(join(ROOT, 'sfx', 'manifest.json'), 'utf8'));
const sfx = {};
const PREFIX = 'sfx/raw/external/';
const takeExt = (dir, name) => {
  if (sfx[name]) return name;
  if (!dir.startsWith(PREFIX)) die(`outro.yaml sfx: папка «${dir}» должна начинаться с ${PREFIX} (читается относительно SFX_EXTERNAL_DIR)`);
  const d = join(EXT, dir.slice(PREFIX.length));
  const meta = extIndex.find((x) => x.id === name);
  if (!meta) die(`внешний звук ${name} нет в ${join(EXT, 'index.json')}`);
  const src = join(d, meta.file);
  if (!existsSync(src)) die(`нет файла ${src}`);
  const rel = `sfx/${name}.wav`;
  const gain = +(SFX_LUFS - meta.lufs).toFixed(2);
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', `volume=${gain}dB`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', '-map_metadata', '-1', join(OUT, rel)]);
  sfx[name] = { id: name, file: add(rel), durationMs: Math.round(meta.dur * 1000), peakMs: Math.round(meta.peak_t * 1000), gainDb: gain, type: meta.type, source: `${meta.pack} — ${meta.origin}`, srcSha256: sha256(src), license: meta.license, licenseWarning: meta.licenseWarning !== false };
  return name;
};
const takeLib = (id) => {
  if (sfx[id]) return id;
  const s0 = sfxMan.sounds.find((x) => x.id === id);
  if (!s0) die(`звук ${id} из outro.yaml нет в sfx/manifest.json`);
  const rel = `sfx/${id}.wav`;
  copyFileSync(join(ROOT, 'sfx', s0.file), join(OUT, rel));
  const src = sfxMan.sources.find((x) => x.id === s0.source);
  sfx[id] = { id, file: add(rel), durationMs: s0.durationMs, peakMs: s0.transientMs, gainDb: 0, type: s0.type, source: src ? `${src.id} (${src.url}${src.commit ? ` @${src.commit.slice(0, 7)}` : ''}), ${s0.origName}` : s0.source, license: s0.license, licenseWarning: !/^(CC0|MIT)$/.test(s0.license) };
  return id;
};

// ---------------------------------------------------------------- музыка + SFX → микс серии (+ тишина holdAfter), нормализация −14 LUFS / −1 dBTP (loudnorm, 2 прохода)
// Цель TP −1.5: запас 0.5 дБ под перехлёст AAC при кодировании (черновик с целью −1.0 дал −0.9 dBTP).
// SFX сводятся здесь, а не секвенциями Remotion: там старт квантуется кадром (42 мс), а пик должен лечь на событие по времени пика с точностью до мс.
const musicSrc = join(DIR, outro.music.file);
if (!existsSync(musicSrc)) die(`нет трека ${musicSrc}`);
const rawRel = 'music.raw.wav';
run('ffmpeg', ['-v', 'error', '-y', '-ss', String(outro.music.from), '-to', String(outro.music.to), '-i', musicSrc, '-vn', '-map_metadata', '-1', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', join(OUT, rawRel)]);
add(rawRel);
const loud = (file) => {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const sm = e.slice(e.lastIndexOf('Summary:')); // итог, а не покадровый лог
  return { I: Number(sm.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]), TP: Number(sm.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]) };
};
const mixes = {};
for (const [ep, tl] of Object.entries(episodes)) {
  const cfg = outro.episodes[ep].sfx;
  const cues = []; // {key, role, at (с, старт в ролике), peakAt, offset (с от начала файла), dur (с, null — до конца), fadeIn}
  const fps = tl.fps;
  const cue = (key, role, peakAt, extra = {}) => {
    const pk = sfx[key].peakMs / 1000;
    let at = peakAt - pk;
    let offset = 0;
    if (at < 0) { offset = -at; at = 0; }
    cues.push({ key, role, peakAt: +peakAt.toFixed(4), at: +at.toFixed(4), offset: +offset.toFixed(4), dur: null, fadeIn: 0, ...extra });
  };
  // звуковой бюджет (задача 018): свист — только на склейках из sfx.whip.on, нарастание — только перед героями sfx.riser.heroes,
  // щелчок — только если задан sfx.card. Файл из pick назначается по порядковому номеру склейки / карточки среди ВСЕХ
  // (как в v2), поэтому оставшиеся звуки — те же файлы, что были на этих местах в v2: A/B отличается только убранными слоями.
  const plan = sfxPlan(outro, ep);
  const whipOn = new Set(plan.whip);
  const riserOn = new Set(plan.riser);
  let w = 0;
  let h = 0;
  for (const p of tl.items) {
    if (p.in === 'whip') {
      const key = cfg.whip.pick[w++ % cfg.whip.pick.length];
      if (whipOn.has(p.index)) cue(takeExt(cfg.whip.dir, key), `whip→${p.index}`, p.startSec);
    }
    if (p.kind === 'card') {
      const hit = p.startSec;
      if (riserOn.has(p.hero)) {
        const rk = takeExt(cfg.riser.dir, cfg.riser.pick[h % cfg.riser.pick.length]);
        // нарастание: пик = удар, после удара обрезано; если не помещается до начала ролика — начало срезается (fade-in 0.3 с)
        cue(rk, `riser ${p.hero}`, hit, { fadeIn: 0.3 });
        const c = cues[cues.length - 1];
        c.dur = +(sfx[rk].peakMs / 1000 - c.offset).toFixed(4);
      }
      cue(takeExt(cfg.impact.dir, cfg.impact.pick[h % cfg.impact.pick.length]), `impact ${p.hero}`, hit);
      if (cfg.card) cue(takeLib(cfg.card), `card ${p.hero}`, hit);
      cue(takeExt(cfg.slam.dir, cfg.slam.pick[h % cfg.slam.pick.length]), `slam ${p.hero} (имя +3 к)`, hit + 3 / fps);
      h++;
    }
    if (p.kind === 'final') cue(takeExt(cfg.final.dir, cfg.final.pick[0]), 'final (взрыв)', p.startSec);
  }
  const inputs = ['-i', join(OUT, rawRel), ...cues.flatMap((c) => ['-i', join(OUT, sfx[c.key].file)])];
  const fc = cues.map((c, i) => {
    const trim = `atrim=start=${c.offset}${c.dur ? `:duration=${c.dur}` : ''},asetpts=PTS-STARTPTS`;
    const fade = c.fadeIn ? `,afade=t=in:d=${c.fadeIn}` : '';
    return `[${i + 1}:a]${trim}${fade},aresample=48000,aformat=channel_layouts=stereo,volume=${cfg.gainVsMusic},adelay=${Math.round(c.at * 1000)}:all=1[s${i}]`;
  }).join(';') + `;[0:a]apad=whole_dur=${tl.durationSec}[mu];[mu]${cues.map((_, i) => `[s${i}]`).join('')}amix=inputs=${cues.length + 1}:normalize=0:duration=first[m]`;
  const premix = join(tmp, `premix.${ep}.wav`);
  run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[m]', '-ar', '48000', '-c:a', 'pcm_s24le', premix]);
  const p1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', premix, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m1 = JSON.parse(p1.slice(p1.lastIndexOf('{'), p1.lastIndexOf('}') + 1));
  const lnf = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true:print_format=json`;
  const rel = `mix.${ep}.wav`;
  const p2 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', '-i', premix, '-af', `${lnf},aresample=48000`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-map_metadata', '-1', join(OUT, rel)], { encoding: 'utf8' });
  if (p2.status !== 0) die(`loudnorm ${ep}: ${p2.stderr.slice(-800)}`);
  const t2 = JSON.parse(p2.stderr.slice(p2.stderr.lastIndexOf('{'), p2.stderr.lastIndexOf('}') + 1));
  mixes[ep] = { file: add(rel), durationSec: tl.durationSec, cues, plan: { whip: plan.whip, riser: plan.riser, card: !!cfg.card }, gainVsMusic: cfg.gainVsMusic, sfxLufs: SFX_LUFS, loudness: { musicOnly: loud(join(OUT, rawRel)), premix: { I: Number(m1.input_i), TP: Number(m1.input_tp) }, loudnormType: t2.normalization_type, after: loud(join(OUT, rel)) } };
  const L2 = mixes[ep].loudness;
  console.log(`  ✓ микс ${ep}: музыка ${outro.music.from}–${outro.music.to} с + тишина ${outro.music.holdAfter} с + ${cues.length} SFX; до нормализации I ${L2.premix.I} / TP ${L2.premix.TP} → I ${L2.after.I} LUFS / TP ${L2.after.TP} dBTP (${L2.loudnormType})`);
}
const music = { raw: rawRel, source: { file: outro.music.file, sha256: sha256(musicSrc) }, from: outro.music.from, to: outro.music.to, holdAfter: outro.music.holdAfter, license: outro.music.license, mixes };

rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------- ссылка public/, манифест, отчёт о лицензиях
mkdirSync(dirname(PUBLIC_LINK), { recursive: true });
try { if (lstatSync(PUBLIC_LINK)) unlinkSync(PUBLIC_LINK); } catch { /* нет */ }
symlinkSync(relative(dirname(PUBLIC_LINK), OUT), PUBLIC_LINK);

const manifest = {
  generatedAt: new Date().toISOString(),
  script: `videos/mia-outro/prepare-assets.mjs ${SCRIPT_VERSION}`,
  outroSha256: sha256(yamlPath),
  shots: { sha256: sha256(shotsPath), excludedZones: shotZones },
  publicBase: 'videos/mia-outro',
  sources: srcInfo,
  live, cards, grain, music, sfx,
  assets,
};
writeFileSync(join(HERE, 'assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const lic = [
  '# Лицензии — аутро MIA (videos/mia-outro)', '',
  `Сгенерировано: ${manifest.generatedAt} (prepare-assets ${SCRIPT_VERSION}). Гейт 6: лицензия каждого звука и музыки записана; ограничения — предупреждением.`, '',
  '| Что | Файл | Источник | Лицензия | Предупреждение |', '|---|---|---|---|---|',
  `| Музыка | ${outro.music.file} (${outro.music.from}–${outro.music.to} с) | MIA_SHORT_DIR | ${outro.music.license} | ⚠ тариф Suno не подтверждён: некоммерческое использование — ок по словам Олега; коммерческое — проверить тариф |`,
  ...Object.values(sfx).map((s) => `| SFX (${s.type}) | ${s.id} | ${s.source} | ${s.license} | ${s.licenseWarning ? '⚠ licenseWarning: лицензия неизвестна — только для некоммерческого черновика; перед публикацией в Instagram заменить на CC0 (outro.yaml sfx.note)' : '—'} |`),
  `| Шрифт | Anton-Regular.ttf | google/fonts ofl/anton | SIL OFL 1.1 | latinOnly: только латиница |`,
  `| Шрифт | Oswald-VF.ttf | google/fonts ofl/oswald | SIL OFL 1.1 | — |`,
  `| Видео | ${Object.keys(srcInfo).sort().join(', ')} | генерации Seedance (MIA_SHORT_DIR) | собственные материалы Олега | — |`,
  `| Картинка | ${Object.values(cards).map((c) => c.cutout).join(', ')} | вырезки архитектора (MIA_SHORT_DIR/_outro-analysis/cards) | собственные материалы Олега | — |`,
  '',
];
mkdirSync(join(ROOT, 'out', 'mia-outro'), { recursive: true });
writeFileSync(join(ROOT, 'out', 'mia-outro', 'license-report.md'), lic.join('\n'));
console.log(`\nOK: ${assets.length} файлов → ${relative(ROOT, OUT)}; манифест videos/mia-outro/assets.manifest.json; лицензии out/mia-outro/license-report.md`);

#!/usr/bin/env node
// Ассеты аутро MIA v4 (задача 030, этап В) → videos/mia-outro/assets-v4/ (gitignore) + public/videos/mia-outro-v4 (ссылка)
// + videos/mia-outro/assets.v4.manifest.json + out/mia-outro/pilot-030/{sound-v4.md, ab/v3.wav, ab/v4.wav, upscale.txt}.
//   npm run mia:prepare:v4
// Вход: videos/mia-outro/outro.v4-picks.yaml (предложение v4, только чтение), assets.manifest.json v3 (живые планы и микс v3 —
// сначала npm run mia:prepare). outro.yaml (v3) не читается и не меняется (гейт 5).
// Окружение (env.manifest.json): MIA_SHORT_DIR, SFX_EXTERNAL_DIR (scope mia-outro), REALESRGAN_DIR (scope mia-outro-v4).
// Делает: апскейл вырезки ROOK (prepare.upscale, замер пика памяти /usr/bin/time -l; > 10 ГБ — отказ), карточки «досье»
// (фон = кадр-источник вырезки: цвет и обработанный — монохром, затемнение, размытие, сетка; фигура; лицо по Vision),
// рамку кисти для lockCarry (Vision hand pose на последних кадрах живого плана), огонёк заряда для lightMatch, звук v4 по sfx.events.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildTimeline, checkZones, dbIn, dossierClock, isDossier, isSfxV4, labelText, parseAt, parseOutro, zonesFrom } from '../../src/videos/mia-outro/model.ts';
import { CROP_VARIANTS, cropFor } from '../../src/videos/mia-outro/vertical.ts';

const SCRIPT_VERSION = '1.0.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'assets-v4');
const PUBLIC_LINK = join(ROOT, 'public', 'videos', 'mia-outro-v4');
const PILOT = join(ROOT, 'out', 'mia-outro', 'pilot-030');
const die = (m) => { console.error(`\nОТКАЗ prepare-v4 (mia-outro): ${m}\n`); process.exit(1); };
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0) die(`${cmd} ${args.slice(0, 8).join(' ')}… → exit ${r.status}\n${(r.stderr || '').slice(-1500)}`);
  return r.stdout;
};
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
const fromEnv = (n) => process.env[n] ?? envText.match(new RegExp(`^${n}=(.+)$`, 'm'))?.[1]?.trim();
const need = (n, scope) => fromEnv(n) || die(`${n} не задан (окружение или .env) — npm run check -- --scope ${scope}`);

const DIR = need('MIA_SHORT_DIR', 'mia-outro');
const EXT = need('SFX_EXTERNAL_DIR', 'mia-outro');
const ESR = need('REALESRGAN_DIR', 'mia-outro-v4');
const A = join(DIR, '_outro-analysis');
const yamlPath = join(HERE, 'outro.v4-picks.yaml');
let outro;
try { outro = parseOutro(parse(readFileSync(yamlPath, 'utf8'))); } catch (e) { die(e.message); }
if (!isDossier(outro.card)) die('outro.v4-picks.yaml: card.style ≠ dossier');
const CARD = outro.card;
const V3 = JSON.parse(readFileSync(join(HERE, 'assets.manifest.json'), 'utf8'));
const V3_ASSETS = join(HERE, 'assets');
if (!existsSync(join(V3_ASSETS, V3.music.mixes.ep01?.file ?? 'нет'))) die('нет ассетов v3 (живые планы, микс) — сначала npm run mia:prepare');
const fps = outro.format.fps;
const FR = { land: outro.format.landscape, port: outro.format.portrait };

rmSync(OUT, { recursive: true, force: true });
for (const d of ['cards', 'sfx', 'tmp']) mkdirSync(join(OUT, d), { recursive: true });
mkdirSync(join(PILOT, 'ab'), { recursive: true });
const tmp = join(OUT, 'tmp');
const assets = [];
const add = (rel) => { assets.push({ file: rel, sha256: sha256(join(OUT, rel)) }); return rel; };

// ---------------------------------------------------------------- таймлайн и зоны (та же функция, что в композиции)
const episodes = {};
for (const ep of Object.keys(outro.episodes)) {
  const tl = buildTimeline(outro, ep);
  const z = checkZones(tl, zonesFrom(outro, V3.shots.excludedZones));
  if (z.errors.length) die(`${ep}: запретные зоны:\n  ✗ ${z.errors.join('\n  ✗ ')}`);
  for (const p of tl.items) if (p.kind !== 'card' && p.srcFrames && !V3.live[`${p.srcFrames.src}_f${p.srcFrames.from}-${p.srcFrames.to}`]) die(`живого плана ${p.srcFrames.src} f${p.srcFrames.from}-${p.srcFrames.to} нет в assets.manifest.json v3 — npm run mia:prepare`);
  episodes[ep] = tl;
  console.log(`✓ ${ep}: ${tl.items.length} пунктов, ${tl.durationInFrames} кадров; зоны чисты; живые планы — из v3`);
}

// ---------------------------------------------------------------- Vision: лица и кисти
const VF = join(ROOT, 'out', 'bin', 'vision-face');
mkdirSync(dirname(VF), { recursive: true });
run('swiftc', ['-O', '-o', VF, join(ROOT, 'tools', 'matte', 'vision-face.swift')]);
const vision = (files) => JSON.parse(run(VF, files));
const geom = (f) => run('magick', ['identify', '-format', '%w %h', f]).trim().split(' ').map(Number);

// ---------------------------------------------------------------- вырезки: подчистка (как v3) и апскейл (prepare.upscale)
const CLEANUP = { 'DARK_new2_cut.png': { skin: { x0: 596, y0: 350, y1: 470 }, ellipse: [642, 412, 20, 26], why: 'кусок руки MIA у правого края (как v3)' } };
const cutDir = join(DIR, outro.card.cutouts);
const upscale = {};
const cleanCut = (hero, file) => {
  const orig = join(cutDir, file);
  if (!existsSync(orig)) die(`нет вырезки ${orig}`);
  const cl = CLEANUP[file];
  if (!cl) return orig;
  const a = join(tmp, `${hero}.a.png`), m = join(tmp, `${hero}.m.png`), a2 = join(tmp, `${hero}.a2.png`), out = join(tmp, `${hero}.clean.png`);
  run('magick', [orig, '-alpha', 'extract', a]);
  run('magick', [orig, '-alpha', 'off', '-fx', `(i>=${cl.skin.x0} && j>=${cl.skin.y0} && j<=${cl.skin.y1} && u.r>0.55 && (u.r-u.g)>0.10 && (u.r-u.b)>0.14) ? 1 : 0`, '-morphology', 'Dilate', 'Disk:4', '-fill', 'white', '-draw', `ellipse ${cl.ellipse[0]},${cl.ellipse[1]} ${cl.ellipse[2]},${cl.ellipse[3]} 0,360`, m]);
  run('magick', [a, '(', m, '-negate', ')', '-compose', 'Multiply', '-composite', a2]);
  run('magick', [orig, '-alpha', 'off', a2, '-compose', 'CopyOpacity', '-composite', out]);
  return out;
};
const doUpscale = (hero, src) => {
  const u = outro.prepare?.upscale?.[hero];
  if (!u) return src;
  const out = join(tmp, `${hero}.x${u.scale}.png`);
  const bin = join(ESR, 'realesrgan-ncnn-vulkan');
  const r = spawnSync('/usr/bin/time', ['-l', bin, '-i', src, '-o', out, '-n', u.model, '-s', String(u.scale), '-m', join(ESR, 'models')], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(out)) die(`апскейл ${hero}: exit ${r.status}\n${r.stderr.slice(-800)}`);
  const peak = Number(r.stderr.match(/(\d+)\s+peak memory footprint/)?.[1]);
  const rss = Number(r.stderr.match(/(\d+)\s+maximum resident set size/)?.[1]);
  const real = Number(r.stderr.match(/([\d.]+) real/)?.[1]);
  if (!(peak > 0)) die(`апскейл ${hero}: не нашёл «peak memory footprint» в выводе /usr/bin/time -l`);
  if (peak > 10 * 2 ** 30) die(`апскейл ${hero}: пик памяти ${(peak / 2 ** 30).toFixed(2)} ГБ > 10 ГБ — стоп (задача 030 п. 2); вариант — модель realesr-animevideov3-x2`);
  const [w0, h0] = geom(src), [w1, h1] = geom(out);
  upscale[hero] = { tool: u.tool, model: u.model, scale: u.scale, from: `${w0}×${h0}`, to: `${w1}×${h1}`, peakMemBytes: peak, maxRssBytes: rss, realSec: real, binSha256: sha256(bin) };
  // результат — новая вырезка рядом (assets-v4), исходная в MIA_SHORT_DIR не меняется
  copyFileSync(out, join(OUT, 'cards', `${hero}.cut.x${u.scale}.png`));
  add(`cards/${hero}.cut.x${u.scale}.png`);
  console.log(`  ✓ апскейл ${hero} ${u.model} ×${u.scale}: ${w0}×${h0} → ${w1}×${h1}; пик памяти ${(peak / 2 ** 30).toFixed(2)} ГБ (RSS ${(rss / 2 ** 20).toFixed(0)} МБ), ${real} с`);
  return out;
};

// кадр-источник вырезки: cards/src/<имя без _cut>.(png|jpg); смещение вырезки в нём (вырезка — кусок кадра в масштабе 1:1 или весь кадр)
const sourceOf = (file) => {
  for (const ext of ['png', 'jpg']) { const f = join(cutDir, 'src', `${file.replace(/_cut\.png$/, '')}.${ext}`); if (existsSync(f)) return f; }
  die(`нет кадра-источника для ${file} в ${join(cutDir, 'src')} (bg.source: cutoutSource)`);
};
/** Вырезка в координатах кадра-источника: та же пропорция → масштаб; иначе кусок 1:1 — смещение подбором по лицу ±6 px (RMSE в окне лица). */
const placeInSource = (cut, src, cutFace, srcFaces) => {
  const [cw, ch] = geom(cut), [sw, sh] = geom(src);
  if (Math.abs(cw / ch - sw / sh) < 0.01) return { k: sw / cw, ox: 0, oy: 0, how: `весь кадр, масштаб ${(sw / cw).toFixed(3)}` };
  const f = srcFaces.find((s) => Math.abs(s.w - cutFace.w) / cutFace.w < 0.1) ?? die(`${cut}: лицо вырезки не найдено в кадре-источнике`);
  const ox0 = f.x - cutFace.x, oy0 = f.y - cutFace.y;
  const win = `${cutFace.w}x${cutFace.h}+${cutFace.x}+${cutFace.y}`;
  const cutWin = join(tmp, 'cutwin.png');
  run('magick', [cut, '-background', 'black', '-alpha', 'remove', '-crop', win, '+repage', cutWin]);
  let best = null;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const ox = ox0 + dx, oy = oy0 + dy;
    const r = spawnSync('magick', ['compare', '-metric', 'RMSE', cutWin, '(', src, '-crop', `${cutFace.w}x${cutFace.h}+${cutFace.x + ox}+${cutFace.y + oy}`, '+repage', ')', 'null:'], { encoding: 'utf8' });
    const e = Number(r.stderr.match(/\(([\d.e-]+)\)/)?.[1]);
    if (best === null || e < best.e) best = { e, ox, oy };
  }
  return { k: 1, ox: best.ox, oy: best.oy, how: `кусок 1:1 со смещением (${best.ox}, ${best.oy}), RMSE окна лица ${best.e.toFixed(4)}` };
};

// ---------------------------------------------------------------- карточки «досье»
const FONT_ANTON = join(ROOT, 'public', 'fonts', 'Anton', 'Anton-Regular.ttf');
const fontkit = createRequire(import.meta.url)('fontkit');
const anton = fontkit.openSync(FONT_ANTON);
const em = (text) => anton.layout(text).glyphs.reduce((s, g) => s + g.advanceWidth, 0) / anton.unitsPerEm;
// подпись: Oswald (переменный) при wght 500 — как в карточке (fontWeight 500)
const oswald = fontkit.openSync(join(ROOT, 'public', 'fonts', 'Oswald', 'Oswald-VF.ttf')).getVariation({ wght: 500 });
const tagEmOf = (text) => oswald.layout(text).glyphs.reduce((s, g) => s + g.advanceWidth, 0) / oswald.unitsPerEm;
/** Подпись в две строки (для узкой зоны у крупного плана): разрыв по словам с наименьшей шириной длинной строки; одно слово → null. */
const tag2Of = (text) => {
  const w = text.split(' ');
  let best = null;
  for (let i = 1; i < w.length; i++) {
    const lines = [w.slice(0, i).join(' '), w.slice(i).join(' ')];
    const em = Math.max(...lines.map(tagEmOf));
    if (!best || em < best.em) best = { lines, em: +em.toFixed(4) };
  }
  return best;
};
// «холодный монохром»: серый с холодным оттенком (R ×0.92, B ×1.06), затем затемнение darken; размытие blurPx при 1080p; сетка
const coldMono = (darken) => ['-colorspace', 'Gray', '-colorspace', 'sRGB', '-channel', 'R', '-evaluate', 'multiply', '0.92', '-channel', 'B', '-evaluate', 'multiply', '1.06', '+channel', '-evaluate', 'multiply', String(1 - darken)];
const gridMvg = (W, H, step, alpha) => {
  const f = join(tmp, `grid.${W}x${H}.mvg`);
  const l = [];
  for (let x = step; x < W; x += step) l.push(`line ${x},0 ${x},${H}`);
  for (let y = step; y < H; y += step) l.push(`line 0,${y} ${W},${y}`);
  writeFileSync(f, `stroke 'rgba(255,255,255,${alpha})'\nstroke-width 1\n${l.join('\n')}\n`);
  return f;
};
const cards = {};
for (const tl of Object.values(episodes)) {
  let nn = 0;
  for (const p of tl.items) {
    if (p.kind !== 'card') continue;
    nn++;
    if (cards[p.hero]) continue;
    const clean = cleanCut(p.hero, p.cutout);
    const big = doUpscale(p.hero, clean);
    const srcImg = sourceOf(p.cutout);
    const flat = join(tmp, `${p.hero}.flat.png`);
    run('magick', [clean, '-background', '#808080', '-alpha', 'remove', flat]);
    const [vc, vs] = vision([flat, srcImg]);
    const cutFace = vc.faces[0] ?? die(`Vision: нет лица на вырезке ${p.cutout} — рамке (card.lock target: face) не на что встать`);
    const place = placeInSource(clean, srcImg, cutFace, vs.faces);
    const [cw, ch] = geom(clean), [sw, sh] = geom(srcImg);
    // вырезка в координатах источника: (x·k + ox, y·k + oy)
    const toSrc = (r) => ({ x: r.x * place.k + place.ox, y: r.y * place.k + place.oy, w: r.w * place.k, h: r.h * place.k });
    const faceSrc = toSrc(cutFace);
    const entry = { hero: p.hero, nn, cutout: p.cutout, cutoutSha256: sha256(join(cutDir, p.cutout)), source: relative(DIR, srcImg), sourceSha256: sha256(srcImg), placement: place.how, faceConf: +cutFace.conf.toFixed(3), cleanup: CLEANUP[p.cutout]?.why ?? null, upscaled: !!upscale[p.hero], nameEm: +em(OUTRO_NAME(p)).toFixed(4), tagline: p.tagline.toUpperCase(), tagEm: +tagEmOf(p.tagline.toUpperCase()).toFixed(4), tag2: tag2Of(p.tagline.toUpperCase()), label: labelText(CARD.label.format, nn, OUTRO_NAME(p), p.tagline) };
    const trimInfo = run('magick', [clean, '-format', '%@', 'info:']).trim().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/).slice(1).map(Number);
    const [tw, th, tx, ty] = trimInfo;
    const touchesTop = ty === 0;
    for (const orient of ['land', 'port']) {
      const { w: W, h: H } = FR[orient];
      const base = `cards/${p.hero}.${orient}`;
      let fig, face, bgK, bgX;
      if (orient === 'land') {
        // 16:9 — фигура ровно на своём месте в замершем кадре: фон и фигура в одном масштабе (кадр-источник → кадр)
        bgK = H / sh; bgX = (W - sw * bgK) / 2;
        const k = place.k * bgK; // пиксель вырезки → пиксель кадра
        fig = { x: Math.round(bgX + place.ox * bgK), y: Math.round(place.oy * bgK), w: Math.round(cw * k), h: Math.round(ch * k) };
        run('magick', [big, '-filter', 'Lanczos', '-resize', `${fig.w}x${fig.h}!`, join(OUT, `${base}.figure.png`)]);
        face = { x: bgX + faceSrc.x * bgK, y: faceSrc.y * bgK, w: faceSrc.w * bgK, h: faceSrc.h * bgK };
      } else {
        // 9:16 — раскладка v3 (фигура снизу по центру со сдвигом от имени, высота 1380 / до 1.9 ширины кадра); фон — кадр-источник
        // cover, сдвинут так, чтобы лицо фона стояло над лицом фигуры (по горизонтали)
        let h = Math.min(1380, Math.round((1.9 * W * th) / tw));
        const w = Math.round((h * tw) / th);
        const x = Math.round((W - w) / 2 + (p.side === 'left' ? 40 : -40));
        const y = H - h + 40;
        const k = h / th;
        fig = { x, y, w, h };
        run('magick', [big, '-crop', `${tw * (upscale[p.hero]?.scale ?? 1)}x${th * (upscale[p.hero]?.scale ?? 1)}+${tx * (upscale[p.hero]?.scale ?? 1)}+${ty * (upscale[p.hero]?.scale ?? 1)}`, '+repage', '-filter', 'Lanczos', '-resize', `${w}x${h}!`, join(OUT, `${base}.figure.png`)]);
        face = { x: x + (cutFace.x - tx) * k, y: y + (cutFace.y - ty) * k, w: cutFace.w * k, h: cutFace.h * k };
        bgK = H / sh;
        bgX = Math.max(W - sw * bgK, Math.min(0, face.x + face.w / 2 - (faceSrc.x + faceSrc.w / 2) * bgK));
      }
      // фон: cover-окно кадра-источника W×H — цвет (до скана) и «досье» (после)
      const color = join(OUT, `${base}.bg.color.jpg`);
      run('magick', [srcImg, '-filter', 'Lanczos', '-resize', `${Math.round(sw * bgK)}x${H}!`, '-crop', `${W}x${H}+${Math.round(-bgX)}+0`, '+repage', '-quality', '92', color]);
      const blur = CARD.bg.blurPx * (Math.min(W, H) / 1080);
      run('magick', [color, ...(CARD.bg.mono ? coldMono(CARD.bg.darken) : ['-evaluate', 'multiply', String(1 - CARD.bg.darken)]), '-blur', `0x${blur}`, '-draw', `@${gridMvg(W, H, CARD.bg.grid.stepPx * (Math.min(W, H) / 1080), CARD.bg.grid.alpha)}`, '-quality', '92', join(OUT, `${base}.bg.dossier.jpg`)]);
      const r1 = (v) => Math.round(v);
      entry[orient] = {
        bgColor: add(`${base}.bg.color.jpg`), bgDossier: add(`${base}.bg.dossier.jpg`), figure: add(`${base}.figure.png`),
        fig, face: { x: r1(face.x), y: r1(face.y), w: r1(face.w), h: r1(face.h) },
        // растворение верха фигуры 120 px — только 9:16 и только если вырезка срезана верхом кадра (как v3)
        fadeTop: orient === 'port' && touchesTop,
      };
    }
    cards[p.hero] = entry;
    console.log(`  ✓ досье ${p.hero.padEnd(8)} ${entry.placement}; лицо 16:9 ${JSON.stringify(entry.land.face)}, 9:16 ${JSON.stringify(entry.port.face)}; label «${entry.label}» (${entry.label.length} симв.)`);
  }
}
function OUTRO_NAME(p) { return outro.names[p.hero] ?? p.title; }

// ---------------------------------------------------------------- lockCarry: рамка кисти на последних snapFrames кадрах живого плана перед карточкой
const carry = {};
for (const tl of Object.values(episodes)) {
  tl.items.forEach((p, i) => {
    if (p.kind !== 'card' || p.in !== 'lockCarry') return;
    const prev = tl.items[i - 1];
    const key = `${prev.srcFrames.src}_f${prev.srcFrames.from}-${prev.srcFrames.to}`;
    const L = V3.live[key];
    const nCheck = CARD.lock.snapFrames;
    const first = L.frames - nCheck;
    const pat = join(tmp, `carry_%02d.png`);
    run('ffmpeg', ['-v', 'error', '-y', '-i', join(V3_ASSETS, L.land), '-vf', `select='gte(n\\,${first})'`, '-vsync', '0', pat]);
    const files = Array.from({ length: nCheck }, (_, j) => join(tmp, `carry_${String(j + 1).padStart(2, '0')}.png`));
    const res = vision(files);
    const from = CARD.lock.carryFrom;
    if (from !== 'hand') die(`lockCarry: card.lock.carryFrom «${from}» не поддержан`);
    const rects = res.map((r, j) => {
      const h = r.hands[0] ?? die(`lockCarry ${p.hero}: Vision не нашёл кисть на кадре ${first + j} плана ${key}`);
      return { pos: first + j, x: h.x, y: h.y, w: h.w, h: h.h, faces: r.faces.length };
    });
    // 9:16: та же рамка в координатах высокой версии и кропа плана (vertical.ts, выбор Олега outro.yaml → crops)
    const crop = cropFor(key, outro.episodes.ep01.vertical.crops);
    const cx = CROP_VARIANTS[key]?.[crop] ?? 0.5;
    const left = Math.max(FR.port.w - L.portW, Math.min(0, FR.port.w / 2 - cx * L.portW));
    const sx = L.portW / FR.land.w, sy = L.portH / FR.land.h;
    carry[p.hero] = { from, plan: key, crop, land: rects.map(({ faces, ...r }) => r), port: rects.map(({ pos, x, y, w, h }) => ({ pos, x: Math.round(left + x * sx), y: Math.round(y * sy), w: Math.round(w * sx), h: Math.round(h * sy) })), facesFound: rects.map((r) => r.faces) };
    console.log(`  ✓ lockCarry ${p.hero}: ${key} кадры ${first}–${L.frames - 1}, кисть ${JSON.stringify(carry[p.hero].land.map((r) => [r.x, r.y, r.w, r.h]))}; лиц Vision: ${carry[p.hero].facesFound.join(',')}`);
  });
}

// ---------------------------------------------------------------- lightMatch: огонёк заряда на последнем кадре плана заряда (h7) — красные пиксели
const light = {};
for (const tl of Object.values(episodes)) {
  tl.items.forEach((p, i) => {
    if (p.kind !== 'final' || p.in !== 'lightMatch') return;
    const charge = [...tl.items.slice(0, i)].reverse().find((x) => x.kind === 'live' && x.hit === 7);
    if (!charge) die('lightMatch: нет живого плана заряда на h7');
    const key = `${charge.srcFrames.src}_f${charge.srcFrames.from}-${charge.srcFrames.to}`;
    const L = V3.live[key];
    const last = join(tmp, 'charge_last.png');
    run('ffmpeg', ['-v', 'error', '-y', '-i', join(V3_ASSETS, L.land), '-vf', `select='eq(n\\,${L.frames - 1})'`, '-vsync', '0', '-frames:v', '1', last]);
    const bb = run('magick', [last, '-fx', '(u.r>0.8 && u.g<0.3 && u.b<0.3) ? 1 : 0', '-format', '%@ %[fx:mean*w*h]', 'info:']).trim();
    const m = bb.match(/(\d+)x(\d+)\+(\d+)\+(\d+) ([\d.]+)/);
    if (!m || Number(m[5]) < 4) die(`lightMatch: на последнем кадре ${key} нет красного огонька (порог R>0.8, G,B<0.3; мягче — проходит рыжий свет двери): «${bb}»`);
    const [w, h, x, y, n] = m.slice(1).map(Number);
    const land = { x: Math.round(x + w / 2), y: Math.round(y + h / 2), r: Math.max(4, Math.round(Math.max(w, h) / 2)), pixels: Math.round(n) };
    const crop = cropFor(key, outro.episodes.ep01.vertical.crops);
    const cx = CROP_VARIANTS[key]?.[crop] ?? 0.5;
    const left = Math.max(FR.port.w - L.portW, Math.min(0, FR.port.w / 2 - cx * L.portW));
    const sx = L.portW / FR.land.w;
    light.final = { plan: key, crop, land, port: { x: Math.round(left + land.x * sx), y: Math.round((land.y * L.portH) / FR.land.h), r: Math.round(land.r * sx) } };
    console.log(`  ✓ lightMatch: огонёк ${key} f${L.frames - 1} 16:9 ${JSON.stringify(land)}; 9:16 ${JSON.stringify(light.final.port)}`);
  });
}

// ---------------------------------------------------------------- звук v4 по sfx.events
const extIndex = JSON.parse(readFileSync(join(EXT, 'index.json'), 'utf8'));
const sfxMan = JSON.parse(readFileSync(join(ROOT, 'sfx', 'manifest.json'), 'utf8'));
// конкретный файл из sources — выбор билдера (outro.yaml v3: «по слуху/замерам билдера»): первый из списка источника,
// для whip — по порядку событий (need-02 → переворот, hook-03 → наводка); freeze/tick — наш CC0 из sfx/library
const PICK = { whip: ['need-02', 'hook-03'], freeze: ['remotion__shutter-modern'], tick: ['kenney__tick-001'], riser: ['epic4-06'], final: ['epic4-08'] };
const loud = (file) => {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const sm = e.slice(e.lastIndexOf('Summary:'));
  return { I: Number(sm.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]), TP: Number(sm.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]) };
};
const sfxFiles = {};
const takeSfx = (id) => {
  if (sfxFiles[id]) return sfxFiles[id];
  const ext = extIndex.find((x) => x.id === id);
  const rel = `sfx/${id}.wav`;
  if (ext) {
    const src = join(EXT, ext.type === 'whoosh' ? 'whoosh' : ext.type, ext.file);
    if (!existsSync(src)) die(`нет файла ${src}`);
    run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', '-map_metadata', '-1', join(OUT, rel)]);
    sfxFiles[id] = { id, file: add(rel), lufs: ext.lufs, peak: ext.peak_t, dur: ext.dur, source: `${ext.pack} — ${ext.origin}`, license: ext.license, licenseWarning: ext.licenseWarning !== false, srcSha256: sha256(src) };
  } else {
    const s = sfxMan.sounds.find((x) => x.id === id) ?? die(`звук ${id} нет ни во внешних (index.json), ни в sfx/manifest.json`);
    copyFileSync(join(ROOT, 'sfx', s.file), join(OUT, rel));
    sfxFiles[id] = { id, file: add(rel), lufs: s.lufs, peak: s.transientMs / 1000, dur: s.durationMs / 1000, source: s.source, license: s.license, licenseWarning: !/^(CC0|MIT)$/.test(s.license), srcSha256: s.sha256 };
  }
  return sfxFiles[id];
};
const mixes = {};
const soundRows = [];
for (const [ep, tl] of Object.entries(episodes)) {
  const cfg = outro.episodes[ep].sfx;
  if (!isSfxV4(cfg)) die(`${ep}.sfx — не схема v4 (events)`);
  const rawRel = 'music.raw.wav';
  copyFileSync(join(V3_ASSETS, V3.music.raw), join(OUT, rawRel));
  add(rawRel);
  const musicI = loud(join(OUT, rawRel)).I;
  const hits = outro.music.hits;
  const cardsTl = tl.items.filter((p) => p.kind === 'card');
  const cues = []; // {event, id, peakAt, at, offset, maxTail, gainDb}
  const ducks = []; // {from, to, db}
  const whipQueue = [...PICK.whip];
  for (const e of cfg.events) {
    const a = parseAt(e.at);
    // final: в why.mix число — провал музыки ПОСЛЕ взрыва, не громкость взрыва; сам взрыв — 0 дБ к музыке
    const db = e.sound === 'final' ? null : dbIn(e.why.mix);
    const times = [];
    if (a.kind === 'item') times.push({ t: tl.items.find((p) => p.src === a.src && p.from === a.from).startSec, who: e.at });
    else if (a.kind === 'cardFreeze' || a.kind === 'cardLock') for (const c of cardsTl.filter((c) => e.heroes.includes(c.hero))) {
      const ck = dossierClock(CARD, c.in === 'lockCarry', cards[c.hero].label.length);
      times.push({ t: c.startSec + (a.kind === 'cardLock' ? ck.lockEnd / fps : 0), who: c.hero });
    }
    else if (a.kind === 'card') times.push({ t: cardsTl.find((c) => c.hero === a.hero).startSec, who: a.hero });
    else times.push({ t: hits[a.hit - 1] - a.minusSec, who: e.at });
    if (e.sound === 'silence') {
      // пауза перед взрывом: SFX нет, музыка «−N дБ на S с» до удара
      const dur = Number(e.why.mix.match(/на\s+([\d.,]+)\s*с/u)?.[1]?.replace(',', '.')) || die(`${e.id}: в why.mix нет длительности «на N с»`);
      ducks.push({ from: times[0].t, to: times[0].t + dur, db, why: e.id });
      soundRows.push({ event: e.id, at: times.map((x) => x.t.toFixed(3)).join(', '), file: '— (тишина SFX)', gainDb: `музыка ${db} дБ`, peak: '—', tail: '—' });
      continue;
    }
    const id = e.sound === 'whip' ? whipQueue.shift() ?? die('whip: событий больше, чем файлов в PICK.whip') : PICK[e.sound][0];
    const s = takeSfx(id);
    // громкость: файл приводится к громкости музыки (LUFS), затем why.mix «−N дБ»; final без числа — 0 дБ к музыке (единственный громкий)
    const gainDb = +((musicI - s.lufs) + (db ?? 0)).toFixed(2);
    // предел хвоста после пика: freeze «≤ 0.15 с», whip «хвост ≤ 0.35 с», riser — обрезан на пике (кончается на фризе)
    const tailCap = Number(e.why.gap.match(/(?:≤|хвост ≤)\s*([\d.,]+)\s*с/u)?.[1]?.replace(',', '.'));
    for (const x of times) cues.push({ event: e.id, who: x.who, id, peakAt: x.t, gainDb, tailCap: e.sound === 'riser' ? 0 : Number.isFinite(tailCap) ? tailCap : null, fadeIn: e.sound === 'riser' ? 0.3 : 0, untilHold: e.sound === 'final' });
    // после взрыва музыка «−N дБ на 1 долю» (второе число в why.mix финала)
    if (e.sound === 'final') {
      const m = e.why.mix.match(/музыка\s*([−\-]\d+)\s*дБ\s*на\s*1\s*долю/u);
      if (m) ducks.push({ from: times[0].t, to: times[0].t + 60 / outro.music.bpm, db: Number(m[1].replace('−', '-')), why: `${e.id} (после взрыва)` });
    }
  }
  cues.sort((a, b) => a.peakAt - b.peakAt);
  // старт = пик − время пика в файле; хвост: до старта следующего события (fade 60 мс, mix.tailTrim), не дольше tailCap после пика; final — до holdAfter
  const FADE = Number(cfg.mix.tailTrim.match(/(\d+)\s*мс/u)?.[1]) / 1000 || die('sfx.mix.tailTrim: нет «N мс»');
  for (const c of cues) {
    const s = sfxFiles[c.id];
    c.at = c.peakAt - s.peak;
    c.offset = 0;
    if (c.at < 0) { c.offset = -c.at; c.at = 0; }
  }
  cues.forEach((c, i) => {
    const s = sfxFiles[c.id];
    let end = c.at + (s.dur - c.offset);
    const reasons = ['естественный конец'];
    const nextStart = cues.slice(i + 1).find((x) => x.at > c.at + 1e-6)?.at;
    if (nextStart !== undefined && nextStart < end) { end = nextStart; reasons[0] = 'до следующего события'; }
    if (c.tailCap !== null && c.peakAt + c.tailCap < end) { end = c.peakAt + c.tailCap; reasons[0] = c.tailCap === 0 ? 'обрезан на пике' : `≤ ${c.tailCap} с после пика`; }
    if (c.untilHold && tl.musicSec < end) { end = tl.musicSec; reasons[0] = 'до hold (обрыв музыки)'; }
    c.dur = +(end - c.at).toFixed(4);
    c.tailAfterPeak = +(end - c.peakAt).toFixed(3);
    c.cut = reasons[0];
    c.fadeOut = c.tailCap === 0 ? 0.01 : Math.min(FADE, c.dur / 2);
  });
  const hpf = cfg.mix.hpfHz;
  const inputs = ['-i', join(OUT, rawRel), ...cues.flatMap((c) => ['-i', join(OUT, sfxFiles[c.id].file)])];
  const duckExpr = ducks.length ? ducks.map((d) => `if(between(t,${d.from.toFixed(4)},${d.to.toFixed(4)}),${Math.pow(10, d.db / 20).toFixed(4)},1)`).join('*') : '1';
  const fc = cues.map((c, i) => {
    const fadeIn = c.fadeIn ? `,afade=t=in:d=${c.fadeIn}` : '';
    return `[${i + 1}:a]atrim=start=${c.offset.toFixed(4)}:duration=${c.dur},asetpts=PTS-STARTPTS${fadeIn},afade=t=out:st=${Math.max(0, c.dur - c.fadeOut).toFixed(4)}:d=${c.fadeOut.toFixed(4)},highpass=f=${hpf},aresample=48000,aformat=channel_layouts=stereo,volume=${c.gainDb}dB,adelay=${Math.round(c.at * 1000)}:all=1[s${i}]`;
  }).join(';') + `;[0:a]volume='${duckExpr}':eval=frame,apad=whole_dur=${tl.durationSec}[mu];[mu]${cues.map((_, i) => `[s${i}]`).join('')}amix=inputs=${cues.length + 1}:normalize=0:duration=first[m]`;
  // премикс во float (без клипа на 0 dBFS), затем усиление к целевой громкости и лимитер до loudnorm (mix.limiter): потолок ceilingDbtp,
  // лимитер на 4× передискретизации (ловит межотсчётные пики), после него loudnorm 2 прохода — поправка в доли дБ, режим linear
  const T = cfg.mix.target;
  const premix = join(tmp, `premix.${ep}.wav`);
  run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[m]', '-ar', '48000', '-c:a', 'pcm_f32le', premix]);
  const lim = join(tmp, `limited.${ep}.wav`);
  const ceil = Math.pow(10, (cfg.mix.limiter.ceilingDbtp - 0.3) / 20).toFixed(4); // −0.3 дБ: запас на восстановление 192k → 48k
  const pre = loud(premix);
  run('ffmpeg', ['-v', 'error', '-y', '-i', premix, '-af', `volume=${(T.lufs - pre.I).toFixed(2)}dB,aresample=192000,alimiter=limit=${ceil}:level=disabled:attack=2:release=60,aresample=48000`, '-ar', '48000', '-c:a', 'pcm_f32le', lim]);
  const p1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', lim, '-af', `loudnorm=I=${T.lufs}:TP=${T.tp}:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m1 = JSON.parse(p1.slice(p1.lastIndexOf('{'), p1.lastIndexOf('}') + 1));
  const rel = `mix.${ep}.wav`;
  const p2 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', '-i', lim, '-af', `loudnorm=I=${T.lufs}:TP=${T.tp}:LRA=11:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true:print_format=json,aresample=48000`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-map_metadata', '-1', join(OUT, rel)], { encoding: 'utf8' });
  if (p2.status !== 0) die(`loudnorm ${ep}: ${p2.stderr.slice(-800)}`);
  const t2 = JSON.parse(p2.stderr.slice(p2.stderr.lastIndexOf('{'), p2.stderr.lastIndexOf('}') + 1));
  const after = loud(join(OUT, rel));
  mixes[ep] = { file: add(rel), durationSec: tl.durationSec, musicI, cues, ducks, hpfHz: hpf, limiter: cfg.mix.limiter, loudness: { premix: pre, limited: { I: Number(m1.input_i), TP: Number(m1.input_tp) }, loudnormType: t2.normalization_type, after } };
  for (const c of cues) soundRows.push({ event: c.event, who: c.who, at: c.peakAt.toFixed(3), file: c.id, gainDb: `${c.gainDb >= 0 ? '+' : ''}${c.gainDb} дБ`, peak: `${c.peakAt.toFixed(3)} с (пик файла ${sfxFiles[c.id].peak.toFixed(3)} с)`, tail: `${c.tailAfterPeak.toFixed(3)} с — ${c.cut}` });
  console.log(`  ✓ звук v4 ${ep}: ${cues.length} звуков + ${ducks.length} провала музыки; премикс I ${mixes[ep].loudness.premix.I} / TP ${mixes[ep].loudness.premix.TP}; после лимитера I ${m1.input_i} / TP ${m1.input_tp} → I ${after.I} LUFS / TP ${after.TP} dBTP (${t2.normalization_type})`);

  // A/B для Олега: одинаковая громкость по LUFS (v3 — микс v3 как есть, v4 — этот; при разнице > 0.2 LU v3 подгоняется усилением)
  const v3mix = join(V3_ASSETS, V3.music.mixes[ep].file);
  const l3 = loud(v3mix);
  const g = +(after.I - l3.I).toFixed(2);
  run('ffmpeg', ['-v', 'error', '-y', '-i', v3mix, ...(Math.abs(g) > 0.2 ? ['-af', `volume=${g}dB`] : []), '-c:a', 'pcm_s16le', join(PILOT, 'ab', 'v3.wav')]);
  copyFileSync(join(OUT, rel), join(PILOT, 'ab', 'v4.wav'));
  mixes[ep].ab = { v3: loud(join(PILOT, 'ab', 'v3.wav')), v4: loud(join(PILOT, 'ab', 'v4.wav')), v3GainDb: Math.abs(g) > 0.2 ? g : 0 };
  console.log(`  ✓ A/B ${ep}: v3 I ${mixes[ep].ab.v3.I} / TP ${mixes[ep].ab.v3.TP}; v4 I ${mixes[ep].ab.v4.I} / TP ${mixes[ep].ab.v4.TP} → ${relative(ROOT, join(PILOT, 'ab'))}/`);
}

// ---------------------------------------------------------------- ссылка public/, манифест, отчёт о звуке
rmSync(tmp, { recursive: true, force: true });
mkdirSync(dirname(PUBLIC_LINK), { recursive: true });
try { if (lstatSync(PUBLIC_LINK)) unlinkSync(PUBLIC_LINK); } catch { /* нет */ }
symlinkSync(relative(dirname(PUBLIC_LINK), OUT), PUBLIC_LINK);
const manifest = {
  generatedAt: new Date().toISOString(),
  script: `videos/mia-outro/prepare-v4.mjs ${SCRIPT_VERSION}`,
  outroSha256: sha256(yamlPath),
  v3ManifestGeneratedAt: V3.generatedAt,
  publicBase: 'videos/mia-outro-v4',
  cards, carry, light, upscale,
  music: { mixes },
  sfx: sfxFiles,
  assets,
};
writeFileSync(join(HERE, 'assets.v4.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const md = [
  '# Звук v4 — аутро MIA ep01 (задача 030)', '',
  `Сгенерировано: ${manifest.generatedAt} (prepare-v4 ${SCRIPT_VERSION}). Громкость события = файл приведён к громкости музыки (I ${mixes.ep01.musicI} LUFS) + «−N дБ» из why.mix; HPF ${mixes.ep01.hpfHz} Гц на всех SFX; хвосты — fade ${cfgFade()} мс.`, '',
  '| Событие | Кто | Файл | Громкость | Пик (в ролике) | Хвост после пика |', '|---|---|---|---|---|---|',
  ...soundRows.map((r) => `| ${r.event} | ${r.who ?? ''} | ${r.file} | ${r.gainDb} | ${r.peak} | ${r.tail} |`),
  '', `Провалы музыки: ${mixes.ep01.ducks.map((d) => `${d.why}: ${d.db} дБ ${d.from.toFixed(3)}–${d.to.toFixed(3)} с`).join('; ')}`,
  `Мастер: премикс I ${mixes.ep01.loudness.premix.I} / TP ${mixes.ep01.loudness.premix.TP}; лимитер ${mixes.ep01.limiter.ceilingDbtp} dBTP → I ${mixes.ep01.loudness.limited.I} / TP ${mixes.ep01.loudness.limited.TP}; loudnorm (${mixes.ep01.loudness.loudnormType}) → **I ${mixes.ep01.loudness.after.I} LUFS / TP ${mixes.ep01.loudness.after.TP} dBTP**`,
  `A/B: v3.wav I ${mixes.ep01.ab.v3.I} / TP ${mixes.ep01.ab.v3.TP} (усиление ${mixes.ep01.ab.v3GainDb} дБ); v4.wav I ${mixes.ep01.ab.v4.I} / TP ${mixes.ep01.ab.v4.TP}`,
  '', 'Лицензии (гейт 6): ' + Object.values(sfxFiles).map((s) => `${s.id} — ${s.license}${s.licenseWarning ? ' ⚠ licenseWarning' : ''}`).join('; '), '',
];
function cfgFade() { return outro.episodes.ep01.sfx.mix.tailTrim.match(/(\d+)\s*мс/u)?.[1]; }
writeFileSync(join(PILOT, 'sound-v4.md'), md.join('\n'));
console.log(`\nOK: ${assets.length} файлов → ${relative(ROOT, OUT)}; манифест videos/mia-outro/assets.v4.manifest.json; звук ${relative(ROOT, join(PILOT, 'sound-v4.md'))}`);

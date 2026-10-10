// Сценарий ролика: videos/beauty-studio/scenes.yaml (невосстановимое, правит человек) +
// производный манифест ассетов (prepare-assets.mjs). Оба импортируются ЯВНЫМИ путями;
// нет файла → сборка падает; не та схема → громкий отказ с перечнем ошибок.
import { parse } from 'yaml';
import { z } from 'zod';
import scenesText from '../../../videos/beauty-studio/scenes.yaml';
import assetsManifest from '../../../videos/beauty-studio/assets.manifest.json';
import { BEAUTY_SURFACE_IDS } from '../../theme/brands/beauty-studio.ts';
import { gridProblems, offGrid } from './grid.ts';

const surface = z.enum(BEAUTY_SURFACE_IDS);
const enter = z.object({ type: z.enum(['cut', 'curtain', 'dissolve']), ms: z.number().min(0) });
const base = { from: z.number(), to: z.number(), enter };
const pair = z.tuple([z.string(), z.string()]);

const sceneSchema = z.discriminatedUnion('id', [
  z.object({
    id: z.literal('hook'),
    ...base,
    video: z.object({
      asset: z.string(),
      startSec: z.number().min(0),
      objectPositionY: z.number().min(0).max(100),
      /** keyframes [сек сцены, object-position X %] — кроп 9:16 ведёт глаз */
      pan: z.array(z.tuple([z.number(), z.number().min(0).max(100)])).min(1),
      /** медленный наезд за сцену: [scale в начале, scale в конце] */
      zoom: z.tuple([z.number().positive(), z.number().positive()]),
    }),
    kicker: pair,
    title: pair,
    subtitle: z.string(),
    timing: z.object({ kickerSec: z.number(), titleSec: z.tuple([z.number(), z.number()]), titleMs: z.number(), subtitleSec: z.number() }),
  }),
  z.object({
    id: z.literal('approach'),
    ...base,
    label: pair,
    title: z.array(z.string()).min(1),
    coda: z.string(),
    image: z.string(),
    timing: z.object({ labelSec: z.number(), titleSec: z.array(z.number()).min(1), imageSec: z.number(), codaSec: z.number() }),
  }),
  z.object({
    id: z.literal('works'),
    ...base,
    title: z.array(z.string()).min(1),
    counter: z.string(),
    text: z.string(),
    frames: z.array(z.string()).length(5),
    /** пороги p появления кадров c, d, e (§5.4: .18/.42/.62 → на доли) */
    appearAt: z.tuple([z.number(), z.number(), z.number()]),
    timing: z.object({ titleSec: z.array(z.number()).min(1), copySec: z.number() }),
  }),
  z.object({
    id: z.literal('services'),
    ...base,
    label: pair,
    stepSec: z.number().positive(),
    items: z.array(z.object({ n: z.string(), name: z.string(), text: z.string(), image: z.string() })).length(4),
    timing: z.object({ firstPhotoSec: z.number() }),
  }),
  z.object({
    id: z.literal('details'),
    ...base,
    label: pair,
    title: z.array(z.string()).min(1),
    text: z.string(),
    faces: z.array(z.string()).min(1),
    timing: z.object({ titleSec: z.number(), textSec: z.number(), firstChangeSec: z.number(), intervalSec: z.number(), fadeMs: z.number() }),
  }),
  z.object({
    id: z.literal('studio'),
    ...base,
    label: pair,
    title: z.array(z.string()).min(1),
    frames: z.array(z.object({ image: z.string(), objectPosition: z.string() })).min(1),
    timing: z.object({ labelSec: z.number(), titleSec: z.array(z.number()).min(1), changesSec: z.array(z.number()), fadeMs: z.number() }),
  }),
  z.object({
    id: z.literal('contacts'),
    ...base,
    label: pair,
    title: z.array(z.string()).min(1),
    button: z.string(),
    hours: z.string(),
    phone: z.string(),
    address: z.string(),
    instagram: z.string(),
    timing: z.object({ titleSec: z.array(z.number()).min(1), buttonSec: z.number(), fillSec: z.number(), infoSec: z.number() }),
  }),
  z.object({
    id: z.literal('logo'),
    ...base,
    video: z.object({ asset: z.string(), startSec: z.number(), widthFrac: z.number().min(0.1).max(1) }),
    caption: z.string(),
    timing: z.object({ captionLastSec: z.number() }),
  }),
]);

const scriptSchema = z.object({
  id: z.literal('beauty-studio'),
  format: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30),
    durationSec: z.number().positive(),
    durationInFrames: z.number().int().positive(),
  }),
  background: z.object({
    brandSurface: z.literal('beauty-studio'),
    preset: z.string(),
    overrides: z.record(z.string(), z.unknown()),
    perScene: z.record(z.string(), surface),
    candidates: z.array(z.object({ id: surface, why: z.string() })).min(2).max(4),
  }),
  music: z.object({
    /** public-путь отрезка (staticFile) — пишет prepare-assets.mjs */
    file: z.string(),
    startInFile: z.number().min(0),
    /** линейный множитель; подбирается под ≈ −14 LUFS integrated на готовом MP4 */
    gain: z.number().min(0).max(4),
    fadeInSec: z.number().min(0),
    fadeOutSec: z.number().min(0),
    excerpt: z.object({ sourceStartSec: z.number().min(0), durationSec: z.number().positive() }),
    source: z.string().min(1),
    grid: z.object({ bpm: z.number().positive(), beatSec: z.number().positive(), barSec: z.number().positive(), downbeatsSec: z.array(z.number()).min(2) }),
  }),
  sfx: z.object({
    // музыка несёт ролик: не больше 3 мягких звуков, громкость ≤ 0.12; anchor — scene.<id> (пик на доле входа сцены)
    cues: z.array(z.object({ sound: z.string(), anchor: z.string().regex(/^scene\.[a-z]+$/), volume: z.number().min(0).max(0.12) })).max(3),
  }),
  scenes: z.array(sceneSchema).min(1),
});

export type BeautyScript = z.infer<typeof scriptSchema>;
export type BeautyScene = BeautyScript['scenes'][number];
export type SceneOf<K extends BeautyScene['id']> = Extract<BeautyScene, { id: K }>;

const fail = (msg: string): never => {
  throw new Error(`videos/beauty-studio/scenes.yaml: ${msg}`);
};

function load(): BeautyScript {
  let raw: unknown;
  try {
    raw = parse(scenesText);
  } catch (e) {
    return fail(`не разбирается как YAML: ${String(e)}`);
  }
  const r = scriptSchema.safeParse(raw);
  if (!r.success) return fail(`не по схеме:\n${r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  const sc = r.data;
  // Сцены идут встык и покрывают весь ролик; каждая — ровно один раз; фон задан для каждой.
  let t = 0;
  const seen = new Set<string>();
  for (const s of sc.scenes) {
    if (seen.has(s.id)) fail(`сцена ${s.id} повторяется`);
    seen.add(s.id);
    if (Math.abs(s.from - t) > 1e-6) fail(`сцена ${s.id} начинается в ${s.from}, ожидалось ${t} (сцены встык)`);
    if (s.to <= s.from) fail(`сцена ${s.id}: to ≤ from`);
    if (!sc.background.perScene[s.id]) fail(`background.perScene.${s.id} не задан`);
    t = s.to;
  }
  if (Math.abs(t - sc.format.durationSec) > 1e-6) fail(`сцены кончаются в ${t}, а durationSec = ${sc.format.durationSec}`);
  if (Math.round(sc.format.durationSec * sc.format.fps) !== sc.format.durationInFrames) {
    fail(`format: durationSec ${sc.format.durationSec} × fps ${sc.format.fps} ≠ durationInFrames ${sc.format.durationInFrames}`);
  }
  // Монтаж под музыку: каждая внутренняя граница сцены — на сильной доле или середине такта.
  const gp = gridProblems(sc.music.grid);
  if (gp.length) fail(`music.grid несогласована: ${gp.join('; ')}`);
  const bad = offGrid(sc.scenes.slice(1).map((x) => x.from), sc.music.grid);
  if (bad.length) fail(`границы сцен не на сетке долей: ${bad.map((b) => `${b.t} (ближайшая ${b.nearest.toFixed(3)}, Δ ${(b.deltaSec * 1000).toFixed(0)} мс)`).join(', ')}`);
  if (sc.music.startInFile + sc.format.durationSec > sc.music.excerpt.durationSec + 1e-6) {
    fail(`music: отрезок ${sc.music.excerpt.durationSec} с короче ролика ${sc.format.durationSec} с (startInFile ${sc.music.startInFile})`);
  }
  // Сценарий и ассеты должны быть согласованы: всё, на что ссылается yaml, подготовлено.
  const assets = assetsManifest.assets as Record<string, unknown>;
  const refs: string[] = [];
  for (const s of sc.scenes) {
    if ('video' in s) refs.push(s.video.asset);
    if (s.id === 'approach') refs.push(s.image);
    if (s.id === 'works') refs.push(...s.frames);
    if (s.id === 'services') refs.push(...s.items.map((i) => i.image));
    if (s.id === 'details') refs.push(...s.faces);
    if (s.id === 'studio') refs.push(...s.frames.map((f) => f.image));
  }
  const lack = refs.filter((id) => !assets[id]);
  if (lack.length) fail(`нет в assets.manifest.json: ${lack.join(', ')} — запустите prepare-assets.mjs`);
  const sfx = assetsManifest.sfx as Record<string, unknown>;
  const lackSfx = sc.sfx.cues.map((c) => c.sound).filter((id) => !sfx[id]);
  if (lackSfx.length) fail(`звуков нет в assets.manifest.json: ${lackSfx.join(', ')} — запустите prepare-assets.mjs`);
  const mm = assetsManifest.music as null | { file: string; durationSec: number };
  if (!mm || `${assetsManifest.publicPrefix}/${mm.file}` !== sc.music.file) {
    fail(`music.file = ${sc.music.file}, а в assets.manifest.json ${mm ? `${assetsManifest.publicPrefix}/${mm.file}` : 'музыки нет'} — запустите prepare-assets.mjs`);
  }
  return sc;
}

export const SCRIPT = load();
export const ASSETS = assetsManifest;

export function scene<K extends BeautyScene['id']>(id: K): SceneOf<K> {
  const s = SCRIPT.scenes.find((x) => x.id === id);
  if (!s) return fail(`нет сцены ${id}`);
  return s as SceneOf<K>;
}

/** Путь ассета для staticFile (public/<publicPrefix>/<file>). */
export function assetPath(id: string): string {
  const a = (ASSETS.assets as Record<string, { file: string }>)[id];
  if (!a) return fail(`ассет ${id} не подготовлен`);
  return `${ASSETS.publicPrefix}/${a.file}`;
}
export function sfxInfo(id: string): { path: string; transientMs: number } {
  const a = (ASSETS.sfx as Record<string, { file: string; transientMs: number }>)[id];
  if (!a) return fail(`звук ${id} не подготовлен`);
  return { path: `${ASSETS.publicPrefix}/${a.file}`, transientMs: a.transientMs };
}

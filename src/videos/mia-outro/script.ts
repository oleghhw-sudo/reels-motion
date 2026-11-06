// Аутро MIA: videos/mia-outro/outro.yaml (невосстановимое, только чтение) + производный assets.manifest.json (prepare-assets.mjs).
// Оба импортируются явными путями: нет файла → сборка падает; не та схема → громкий отказ с перечнем.
// Запретные зоны (outro.yaml forbidden + excluded из shots.json, зафиксированные в манифесте) проверяются при каждой сборке:
// нарушение → исключение в calculateMetadata → still/render/readcheck падают с текстом ошибки.
import { parse } from 'yaml';
import outroText from '../../../videos/mia-outro/outro.yaml';
import outroV4Text from '../../../videos/mia-outro/outro.v4-picks.yaml';
import manifestJson from '../../../videos/mia-outro/assets.manifest.json';
import manifestV4Json from '../../../videos/mia-outro/assets.v4.manifest.json';
import { assertZones, buildTimeline, parseOutro, zonesFrom, type Outro, type Timeline, type Zone } from './model.ts';

/** Файл серии (prop `script` композиций): v3 — outro.yaml (по умолчанию), v4 — предложение задачи 030 outro.v4-picks.yaml (гейт 5: рядом, не вместо). */
export const SCRIPTS = ['outro.yaml', 'outro.v4-picks.yaml'] as const;
export type ScriptFile = (typeof SCRIPTS)[number];
export const OUTROS: Record<ScriptFile, Outro> = { 'outro.yaml': parseOutro(parse(outroText)), 'outro.v4-picks.yaml': parseOutro(parse(outroV4Text)) };
/** v3 — для мест, которым вариант не важен (fps, кропы 9:16 — одинаковы в обоих файлах). */
export const OUTRO = OUTROS['outro.yaml'];

type Layer = { figure: string; black: string; white: string; poster: string; ring: string; center: { x: number; y: number }; x: number; y: number; w: number; h: number; pad: number; shadow: [number, number] };
export type Manifest = {
  outroSha256: string;
  publicBase: string;
  shots: { excludedZones: Zone[] };
  live: Record<string, { src: string; from: number; to: number; frames: number; land: string; port: string; portW: number; portH: number; scaleLand: number; scalePort: number }>;
  cards: Record<string, { hero: string; touches: { top: boolean; bottom: boolean; left: boolean; right: boolean }; bg: string; dot: string; rays: string; raysAlpha: number; layout: { land: Layer; port: Layer }; bgLayer: { land: string; port: string } }>;
  grain: string[];
  music: { mixes: Record<string, { file: string; durationSec: number }> };
};
export const MANIFEST = manifestJson as unknown as Manifest;

// ---------------------------------------------------------------- v4 (задача 030): videos/mia-outro/prepare-v4.mjs → assets.v4.manifest.json
export type Rect = { x: number; y: number; w: number; h: number };
type DossierLayer = { bgColor: string; bgDossier: string; figure: string; fig: Rect; face: Rect; fadeTop: boolean };
export type ManifestV4 = {
  outroSha256: string;
  publicBase: string;
  cards: Record<string, { hero: string; nn: number; nameEm: number; label: string; land: DossierLayer; port: DossierLayer }>;
  carry: Record<string, { from: 'hand'; plan: string; land: (Rect & { pos: number })[]; port: (Rect & { pos: number })[] }>;
  light: { final?: { plan: string; land: { x: number; y: number; r: number }; port: { x: number; y: number; r: number } } };
  music: { mixes: Record<string, { file: string; durationSec: number }> };
};
export const MANIFEST_V4 = manifestV4Json as unknown as ManifestV4;
export const assetV4 = (rel: string) => `${MANIFEST_V4.publicBase}/${rel}`;

export const liveKey = (s: { src: string; from: number; to: number }) => `${s.src}_f${s.from}-${s.to}`;
export const asset = (rel: string) => `${MANIFEST.publicBase}/${rel}`;

/** Таймлайн серии + проверка зон. inject — подложенные зоны (позитивный контроль через props). */
export function timelineFor(episode: string, inject: readonly Zone[] = [], script: ScriptFile = 'outro.yaml'): Timeline {
  const OUTRO = OUTROS[script];
  const v4 = script !== 'outro.yaml';
  const tl = buildTimeline(OUTRO, episode);
  assertZones(tl, zonesFrom(OUTRO, MANIFEST.shots.excludedZones, inject));
  for (const p of tl.items) {
    if (p.kind === 'card') {
      if (v4 ? !MANIFEST_V4.cards[p.hero] : !MANIFEST.cards[p.hero]) throw new Error(`${v4 ? 'assets.v4.manifest.json' : 'assets.manifest.json'}: нет карточки ${p.hero} — npm run ${v4 ? 'mia:prepare:v4' : 'mia:prepare'}`);
      if (v4 && p.in === 'lockCarry' && !MANIFEST_V4.carry[p.hero]) throw new Error(`assets.v4.manifest.json: нет рамки lockCarry для ${p.hero} — npm run mia:prepare:v4`);
      const shown = OUTRO.names[p.hero] ?? p.title;
      if (shown !== p.title) throw new Error(`outro.yaml: у ${p.hero} title «${p.title}», а names даёт «${shown}» — в кадре только names`);
    } else if (p.srcFrames && !MANIFEST.live[liveKey(p.srcFrames)]) throw new Error(`assets.manifest.json: нет плана ${liveKey(p.srcFrames)} — npm run mia:prepare`);
  }
  if (!MANIFEST.music.mixes[episode]) throw new Error(`assets.manifest.json: нет микса серии ${episode} — npm run mia:prepare`);
  if (v4 && !MANIFEST_V4.music.mixes[episode]) throw new Error(`assets.v4.manifest.json: нет микса серии ${episode} — npm run mia:prepare:v4`);
  if (v4 && tl.items.some((p) => p.kind === 'final' && p.in === 'lightMatch') && !MANIFEST_V4.light.final) throw new Error('assets.v4.manifest.json: нет огонька lightMatch — npm run mia:prepare:v4');
  return tl;
}

// Аутро MIA: videos/mia-outro/outro.yaml (невосстановимое, только чтение) + производный assets.manifest.json (prepare-assets.mjs).
// Оба импортируются явными путями: нет файла → сборка падает; не та схема → громкий отказ с перечнем.
// Запретные зоны (outro.yaml forbidden + excluded из shots.json, зафиксированные в манифесте) проверяются при каждой сборке:
// нарушение → исключение в calculateMetadata → still/render/readcheck падают с текстом ошибки.
import { parse } from 'yaml';
import outroText from '../../../videos/mia-outro/outro.yaml';
import manifestJson from '../../../videos/mia-outro/assets.manifest.json';
import { assertZones, buildTimeline, parseOutro, zonesFrom, type Timeline, type Zone } from './model.ts';

export const OUTRO = parseOutro(parse(outroText));

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

export const liveKey = (s: { src: string; from: number; to: number }) => `${s.src}_f${s.from}-${s.to}`;
export const asset = (rel: string) => `${MANIFEST.publicBase}/${rel}`;

/** Таймлайн серии + проверка зон. inject — подложенные зоны (позитивный контроль через props). */
export function timelineFor(episode: string, inject: readonly Zone[] = []): Timeline {
  const tl = buildTimeline(OUTRO, episode);
  assertZones(tl, zonesFrom(OUTRO, MANIFEST.shots.excludedZones, inject));
  for (const p of tl.items) {
    if (p.kind === 'card') {
      if (!MANIFEST.cards[p.hero]) throw new Error(`assets.manifest.json: нет карточки ${p.hero} — npm run mia:prepare`);
      const shown = OUTRO.names[p.hero] ?? p.title;
      if (shown !== p.title) throw new Error(`outro.yaml: у ${p.hero} title «${p.title}», а names даёт «${shown}» — в кадре только names`);
    } else if (p.srcFrames && !MANIFEST.live[liveKey(p.srcFrames)]) throw new Error(`assets.manifest.json: нет плана ${liveKey(p.srcFrames)} — npm run mia:prepare`);
  }
  if (!MANIFEST.music.mixes[episode]) throw new Error(`assets.manifest.json: нет микса серии ${episode} — npm run mia:prepare`);
  return tl;
}

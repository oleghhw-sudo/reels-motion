// 14 рецептов фонов. Рецепт — данные: какие слои, в каком порядке (снизу вверх), с какими параметрами.
// Цвета — ссылки на палитру пресета, поэтому любой рецепт работает с любым пресетом.
// Порядок слоёв по ARCHITECTURE.md: база → паттерн → зерно → виньетка → акцентный свет.

import { mixOklch, parseOklch } from '../theme/color.ts';
import type { Preset } from '../theme/presets.ts';
import type { ColorRef, LayerSpec, Recipe, ResolvedLayer } from './types.ts';

type Plain = Exclude<ColorRef, { mix: unknown }>;
/** Смесь двух цветов палитры (t: 0 → a, 1 → b) */
const M = (a: Plain, b: Plain, t: number): ColorRef => ({ mix: [a, b, t] });

export const RECIPES: Recipe[] = [
  {
    id: 'minimal-grain',
    label: 'Минимал',
    note: 'почти чистый цвет, живое зерно, мягкая виньетка — для плотного текста',
    layers: [
      { type: 'solid', color: 'bg' },
      { type: 'glow', color: M('bg', 'surface', 0.9), x: 0.5, y: 0.38, radius: 0.9, breathe: 0.04 },
      { type: 'grain' },
      { type: 'vignette', color: 'shade', strength: 0.45 },
    ],
  },
  {
    id: 'soft-mesh',
    label: 'Мягкий mesh',
    note: 'медленный mesh-градиент в тонах фона с намёком акцента',
    layers: [
      {
        type: 'shader',
        shader: 'mesh',
        colors: ['bg', M('bg', 'accent2', 0.6), M('bg', 'surface', 1), M('bg', 'accent', 0.4)],
        tempo: 0.35,
        timeOffsetMs: 4000,
        params: { distortion: 0.75, swirl: 0.25 },
      },
      { type: 'grain', opacity: 0.8 },
      { type: 'vignette', color: 'shade', strength: 0.4 },
    ],
  },
  {
    id: 'grain-corner',
    label: 'Зерно-угол',
    note: 'зернистый градиент из угла: акцент горит в верхнем углу, низ спокойный под текст',
    layers: [
      {
        type: 'shader',
        shader: 'grain',
        colorBack: 'bg',
        colors: [M('bg', 'accent', 0.45), M('bg', 'glow', 0.25), M('bg', 'accent2', 0.2)],
        tempo: 0.4,
        params: { shape: 'corners', softness: 0.8, intensity: 0.25, noise: 0.3, rotation: 180 },
      },
      { type: 'vignette', color: 'shade', strength: 0.3 },
    ],
  },
  {
    id: 'blueprint',
    label: 'Чертёж',
    note: 'инженерная сетка с крупными узлами, тех-подписи, медленный параллакс',
    layers: [
      { type: 'solid', color: 'bg' },
      { type: 'grid', variant: 'blueprint', color: M('bg', 'accent2', 0.45), size: 36, drift: [0, -6], mask: 'radial' },
      { type: 'grain', opacity: 0.7 },
      { type: 'vignette', color: 'shade', strength: 0.5 },
      { type: 'techLabels', color: 'textMuted', coords: true, opacity: 0.75 },
    ],
  },
  {
    id: 'neuro-net',
    label: 'Неро-сеть',
    note: 'органическая нейросеть Paper NeuroNoise, приглушённая под фон',
    layers: [
      { type: 'solid', color: 'bg' },
      {
        type: 'shader',
        shader: 'neuro',
        colors: ['bg', M('bg', 'accent2', 0.55), M('bg', 'glow', 0.6)],
        tempo: 0.3,
        params: { brightness: 0.02, contrast: 0.35, scale: 0.9 },
        opacity: 0.75,
      },
      { type: 'grain', opacity: 0.6 },
      { type: 'vignette', color: 'shade', strength: 0.55 },
    ],
  },
  {
    id: 'smoke-ring',
    label: 'Дым-кольцо',
    note: 'дымное кольцо в верхней трети — «портал» над заголовком',
    layers: [
      {
        type: 'shader',
        shader: 'smokeRing',
        colorBack: 'bg',
        colors: [M('bg', 'accent', 0.6), M('bg', 'glow', 0.35)],
        tempo: 0.45,
        params: { radius: 0.27, thickness: 0.55, innerShape: 0.75, noiseScale: 2.6, noiseIterations: 7, scale: 0.7, offsetY: -0.62 },
      },
      { type: 'grain', opacity: 0.8 },
      { type: 'vignette', color: 'shade', strength: 0.35 },
    ],
  },
  {
    id: 'light-beam',
    label: 'Световой луч',
    note: 'диагональный градиент и медленный блик, проходящий раз в 4 с',
    layers: [
      { type: 'gradient', from: M('bg', 'surface', 0.8), to: 'bg', angle: 160, drift: 6 },
      { type: 'glow', color: M('bg', 'glow', 0.35), x: 0.85, y: 0.1, radius: 0.8, breathe: 0.08, blend: 'screen' },
      { type: 'sweep', color: M('bg', 'glow', 0.3), angle: 115, width: 0.12, periodSec: 4, blend: 'screen' },
      { type: 'grain' },
      { type: 'vignette', color: 'shade', strength: 0.35 },
    ],
  },
  {
    id: 'editorial-paper',
    label: 'Журнальная бумага',
    note: 'бумажная текстура с волокнами и тонкой линовкой — светлая журнальная подача',
    layers: [
      { type: 'solid', color: 'bg' },
      { type: 'paper', color: 'text', relief: 0.35, blend: 'soft-light', opacity: 0.55 },
      { type: 'grid', variant: 'lines', color: M('bg', 'textMuted', 0.18), size: 96, drift: [0, 0], mask: 'none' },
      { type: 'grain', opacity: 0.8, animated: false },
      { type: 'vignette', color: 'shade', strength: 0.25 },
    ],
  },
  {
    id: 'dot-matrix',
    label: 'Точечная матрица',
    note: 'регулярные точки с радиальным затуханием и тёплым пятном акцента',
    layers: [
      { type: 'solid', color: 'bg' },
      { type: 'glow', color: M('bg', 'accent', 0.28), x: 0.3, y: 0.25, radius: 0.7, breathe: 0.06 },
      { type: 'grid', variant: 'dots', color: M('bg', 'textMuted', 0.5), size: 40, drift: [4, -3], mask: 'radial' },
      { type: 'grain', opacity: 0.7 },
      { type: 'vignette', color: 'shade', strength: 0.45 },
    ],
  },
  {
    id: 'simplex-bands',
    label: 'Симплекс-полосы',
    note: 'мягкие топографические полосы SimplexNoise в 3 тонах фона',
    layers: [
      {
        type: 'shader',
        shader: 'simplex',
        colors: ['bg', M('bg', 'surface', 0.8), M('bg', 'accent2', 0.3), 'bg'],
        tempo: 0.25,
        params: { stepsPerColor: 3, softness: 0.6, scale: 0.35 },
      },
      { type: 'grain', opacity: 0.7 },
      { type: 'vignette', color: 'shade', strength: 0.4 },
    ],
  },
  {
    id: 'static-mesh-dusk',
    label: 'Сумеречный mesh',
    note: 'StaticMeshGradient с волнами: акцент снизу как закат, верх глубокий',
    layers: [
      {
        type: 'shader',
        shader: 'staticMesh',
        colors: ['bg', M('bg', 'surface', 1), M('bg', 'accent', 0.45), M('bg', 'accent2', 0.35)],
        tempo: 0.5,
        params: { positions: 42, waveX: 0.6, waveXShift: 0.3, waveY: 0.8, waveYShift: 0.5, mixing: 0.85, rotation: 0, grainOverlay: 0.08 },
      },
      { type: 'grain', opacity: 0.7 },
      { type: 'vignette', color: 'shade', strength: 0.4 },
    ],
  },
  {
    id: 'flow-lines',
    label: 'Линии потока',
    note: 'короткие штрихи поля шума — ощущение течения данных',
    layers: [
      { type: 'solid', color: 'bg' },
      { type: 'noiseField', mode: 'lines', color: M('bg', 'accent2', 0.55), count: 260, speed: 0.12, seed: 'flow' },
      { type: 'grain', opacity: 0.7 },
      { type: 'vignette', color: 'shade', strength: 0.55 },
    ],
  },
  {
    id: 'particle-drift',
    label: 'Дрейф частиц',
    note: 'пыль в луче: частицы медленно поднимаются, тёплое свечение сверху',
    layers: [
      { type: 'gradient', from: 'bg', to: M('bg', 'surface', 1), angle: 180, drift: 0 },
      { type: 'glow', color: M('bg', 'glow', 0.4), x: 0.5, y: 0.05, radius: 0.9, breathe: 0.05, blend: 'screen' },
      { type: 'noiseField', mode: 'particles', color: M('bg', 'glow', 0.75), count: 140, speed: 0.15, seed: 'dust' },
      { type: 'grain' },
      { type: 'vignette', color: 'shade', strength: 0.45 },
    ],
  },
  {
    id: 'hud-scan',
    label: 'HUD-скан',
    note: 'тёмный mesh, сетка с уходом вниз, скан-блик и таймкод — тех-интерфейс',
    layers: [
      {
        type: 'shader',
        shader: 'mesh',
        colors: ['bg', M('bg', 'surface', 1), M('bg', 'accent2', 0.22), 'bg'],
        tempo: 0.3,
        params: { distortion: 0.5, swirl: 0.6 },
      },
      { type: 'grid', variant: 'lines', color: M('bg', 'accent', 0.22), size: 60, drift: [0, 10], mask: 'fade-bottom' },
      { type: 'sweep', color: M('bg', 'accent', 0.22), angle: 180, width: 0.05, periodSec: 3, blend: 'screen' },
      { type: 'grain', opacity: 0.7 },
      { type: 'vignette', color: 'shade', strength: 0.45 },
      { type: 'techLabels', color: 'textMuted', coords: false, opacity: 0.8 },
    ],
  },
];

export function getRecipe(id: string): Recipe {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`Неизвестный рецепт "${id}". Есть: ${RECIPES.map((x) => x.id).join(', ')}`);
  return r;
}

// ——— подстановка палитры ———

function shadeOf(preset: Preset): string {
  const { l, c, h } = parseOklch(preset.palette.bg);
  // Тёмный режим: глубже в тень; светлый: лёгкое тёплое затемнение (не серость)
  return preset.mode === 'dark'
    ? `oklch(${(l * 0.45).toFixed(4)} ${(c * 0.8).toFixed(4)} ${h})`
    : `oklch(${(l * 0.8).toFixed(4)} ${(c * 1.6).toFixed(4)} ${h})`;
}

export function resolveColor(ref: ColorRef, preset: Preset): string {
  if (typeof ref === 'string') return ref === 'shade' ? shadeOf(preset) : preset.palette[ref];
  const [a, b, t] = ref.mix;
  return mixOklch(resolveColor(a, preset), resolveColor(b, preset), t);
}

const COLOR_KEYS = ['color', 'from', 'to', 'colorBack'] as const;

export function resolveRecipe(recipe: Recipe, preset: Preset): ResolvedLayer[] {
  return recipe.layers.map((layer: LayerSpec) => {
    const out: Record<string, unknown> = { ...layer };
    for (const k of COLOR_KEYS) {
      if (k in layer && (layer as Record<string, unknown>)[k] !== undefined) {
        out[k] = resolveColor((layer as unknown as Record<string, ColorRef>)[k], preset);
      }
    }
    if ('colors' in layer) out.colors = layer.colors.map((c) => resolveColor(c, preset));
    return out as ResolvedLayer;
  });
}

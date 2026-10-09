// Типы рецептов фонов. Рецепт — ДАННЫЕ: список слоёв со ссылками на цвета палитры.
// resolveRecipe(recipe, preset) превращает ссылки в конкретные OKLCH-строки.

import type { Palette } from '../theme/presets.ts';

export type PaletteKey = keyof Palette;

/**
 * Ссылка на цвет: ключ палитры; 'shade' — затемнённый bg (тень/виньетка, считается от режима пресета);
 * или смесь двух ключей в OKLab (t: 0 → a, 1 → b).
 */
export type ColorRef = PaletteKey | 'shade' | { mix: [PaletteKey | 'shade', PaletteKey | 'shade', number] };

export type ShaderKind = 'mesh' | 'grain' | 'simplex' | 'neuro' | 'smokeRing' | 'staticMesh';

type Common = {
  /** Непрозрачность слоя 0..1 */
  opacity?: number;
  /** CSS mix-blend-mode */
  blend?: 'normal' | 'soft-light' | 'overlay' | 'multiply' | 'screen' | 'plus-lighter';
};

export type ShaderLayerSpec<C = ColorRef> = Common & {
  type: 'shader';
  shader: ShaderKind;
  /** Основные цвета шейдера (для neuro: [back, mid, front]) */
  colors: C[];
  /** Фон шейдера там, где он есть (grain, smokeRing) */
  colorBack?: C;
  /** Множитель времени: 1 = реальное время шейдера */
  tempo: number;
  /** Сдвиг времени, мс — чтобы стартовать не с «нулевой» фазы */
  timeOffsetMs?: number;
  /** Прочие параметры шейдера (distortion, swirl, shape …) — передаются как есть */
  params?: Record<string, number | string | boolean>;
};

export type SolidLayerSpec<C = ColorRef> = Common & { type: 'solid'; color: C };

export type GradientLayerSpec<C = ColorRef> = Common & {
  type: 'gradient';
  /** Линейный градиент сверху вниз с медленным дрейфом угла от кадра */
  from: C;
  to: C;
  angle: number;
  /** Амплитуда покачивания угла, градусы (0 — статично) */
  drift?: number;
};

export type GridLayerSpec<C = ColorRef> = Common & {
  type: 'grid';
  variant: 'lines' | 'dots' | 'blueprint';
  color: C;
  /** Шаг сетки, px */
  size: number;
  /** Сдвиг px за секунду по (x, y) — медленный параллакс */
  drift: [number, number];
  /** Маска: затухание сетки к краям ('radial') или к низу ('fade-bottom') */
  mask?: 'none' | 'radial' | 'fade-bottom';
};

export type GrainLayerSpec = Common & {
  type: 'grain';
  /** Если не задано — берётся из пресета */
  frequency?: number;
  animated?: boolean;
};

export type VignetteLayerSpec<C = ColorRef> = Common & {
  type: 'vignette';
  color: C;
  /** 0..1, насколько глубоко заходит затемнение */
  strength: number;
};

export type SweepLayerSpec<C = ColorRef> = Common & {
  type: 'sweep';
  color: C;
  /** Угол луча, градусы */
  angle: number;
  /** Ширина луча в долях диагонали */
  width: number;
  /** Период прохода, секунды */
  periodSec: number;
};

export type NoiseFieldLayerSpec<C = ColorRef> = Common & {
  type: 'noiseField';
  mode: 'particles' | 'lines';
  color: C;
  count: number;
  /** Скорость дрейфа шума (единиц шума в секунду) */
  speed: number;
  seed: string;
};

export type GlowLayerSpec<C = ColorRef> = Common & {
  type: 'glow';
  color: C;
  /** Центр в долях кадра */
  x: number;
  y: number;
  /** Радиус в долях ширины */
  radius: number;
  /** Амплитуда «дыхания» радиуса 0..1 (функция кадра) */
  breathe?: number;
};

export type PaperLayerSpec<C = ColorRef> = Common & {
  type: 'paper';
  color: C;
  /** Сила рельефа волокон 0..1 */
  relief: number;
};

export type TechLabelsLayerSpec<C = ColorRef> = Common & {
  type: 'techLabels';
  color: C;
  /** Показывать координаты/номера */
  coords: boolean;
};

export type LayerSpec<C = ColorRef> =
  | ShaderLayerSpec<C>
  | SolidLayerSpec<C>
  | GradientLayerSpec<C>
  | GridLayerSpec<C>
  | GrainLayerSpec
  | VignetteLayerSpec<C>
  | SweepLayerSpec<C>
  | NoiseFieldLayerSpec<C>
  | GlowLayerSpec<C>
  | PaperLayerSpec<C>
  | TechLabelsLayerSpec<C>;

/** Слой после подстановки палитры: все цвета — OKLCH-строки */
export type ResolvedLayer = LayerSpec<string>;

export type Recipe = {
  id: string;
  label: string;
  /** Одна строка: для чего и как выглядит */
  note: string;
  layers: LayerSpec[];
};

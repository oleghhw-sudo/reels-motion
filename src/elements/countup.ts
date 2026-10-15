// Motion Prompt #007 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#007
//
// Чистая математика Count-up (без React/remotion — её импортирует и CountUp.tsx, и countup.test.ts).
// Числа спецификации #007 перенесены без изменений. t — секунды от начала элемента (t = frame/fps − startSec).
import { clamp, seg } from '../motion/index.ts';

/** Тайминги и геометрия спецификации #007 (ячейка 539×208, шрифт 104 px). */
export const SPEC = {
  cellW: 539,
  cellH: 208,
  fontSize: 104,
  fadeIn: [0.1, 0.4],
  count: [0.45, 2.9],
  landSec: 2.9,
  chipFromSec: 0.35,
  /** Уход: число/полоса 0.4 с (4.0–4.4), чип 0.3 с (4.0–4.3) — относительно начала ухода. */
  exitSec: 0.4,
  chipExitSec: 0.3,
  numberCenterX: 539 / 2 + 42,
  numberCenterY: 96,
  chipR: 34,
  chipGap: 58,
  shakePx: 6,
  barW: 330,
  barH: 12,
  barY: 168,
} as const;

/** Пружина кита motion-prompt: 0 → перелёт → 1, 1 − e^(−d·t)·cos(w·t). */
export const spring = (t: number, w = 14, d = 7): number => (t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t));

/** Прогресс счёта p по окну 0.45–2.9 с. */
export const countProgress = (t: number): number => seg(t, SPEC.count[0], SPEC.count[1]);

/** Значение: round(from + (target − from)·(1 − (1 − p)^4)). */
export const countValue = (t: number, target: number, from = 0): number =>
  Math.round(from + (target - from) * (1 - Math.pow(1 - countProgress(t), 4)));

/** Масштаб «приземления» с 2.9 с: 1 + 0.07·e^(−7t)·cos(15t). */
export const landScale = (t: number): number => {
  const land = t - SPEC.landSec;
  return 1 + (land > 0 ? 0.07 * Math.exp(-7 * land) * Math.cos(15 * land) : 0);
};

export const isLanded = (t: number): boolean => t - SPEC.landSec > 0;

/** Непрозрачность числа и полосы: fade-in 0.1–0.4 с; уход только если задан exitAtSec. */
export const alpha = (t: number, exitAtSec?: number): number =>
  seg(t, SPEC.fadeIn[0], SPEC.fadeIn[1]) * (exitAtSec === undefined ? 1 : 1 - seg(t, exitAtSec, exitAtSec + SPEC.exitSec));

/** Масштаб чипа: пружина с 0.35 с; уход 0.3 с, если задан exitAtSec. */
export const chipScale = (t: number, exitAtSec?: number): number =>
  spring(t - SPEC.chipFromSec, 14, 7) * (exitAtSec === undefined ? 1 : 1 - seg(t, exitAtSec, exitAtSec + SPEC.chipExitSec));

/** Дрожь чипа по вертикали (px спецификации): 6·(1 − p)^3·sin(30u), 0 после окончания счёта. */
export const chipBob = (t: number): number => {
  const p = countProgress(t);
  return (p < 1 ? Math.pow(1 - p, 3) : 0) * SPEC.shakePx * Math.sin(t * 30);
};

/** Доля заполнения полосы value/target (0..1). */
export const barFill = (value: number, target: number): number => (target === 0 ? 1 : clamp(value / target));

/** Украинский формат: тысячи через неразрывный пробел U+00A0 (2 480). */
export const formatUk = (n: number): string => {
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return n < 0 ? `−${s}` : s;
};

// Ported from Rieranthony/product-film-skill @fe11efc4 · MIT (c) 2026 Rieranthony — plugins/product-film/skills/product-film/templates/kit/move.ts
// Magic move: тот же элемент летит туда, где он нужен следующей сцене, меняя размер в пути. Ни карточек, ни склеек:
// элемент и есть переход. Остальное содержимое — блюр-свап (swapIn).
// Изменения при переносе: пружина по умолчанию — SPR.glide из ./tokens.ts (те же 150/20/1); clamp01 → clamp из ./index.ts.
// Тексты лицензий — THIRD-PARTY-LICENSES.md.
import { clamp } from './index.ts';
import { step, type SpringConfig } from './spring.ts';
import { SPR } from './tokens.ts';

export type Rect = { x: number; y: number; w: number; h: number };

/** Прямоугольник элемента в момент t: из from в to на пружине, отпущенной в start (с). */
export function move(t: number, start: number, from: Rect, to: Rect, config: SpringConfig = SPR.glide): Rect {
  const u = step(t - start, config);
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u,
    w: from.w + (to.w - from.w) * u,
    h: from.h + (to.h - from.h) * u,
  };
}

/** Содержимое, которое входит после посадки движения и уходит перед следующим: короткий блюр-свап (с). */
export function swapIn(t: number, from: number, to: number, delay = 0.18, out = 0.1) {
  const enter = clamp((t - from - delay) / 0.18);
  const leave = to === Infinity ? 0 : clamp((t - (to - out)) / out);
  const value = enter * (1 - leave);
  return { opacity: value, filter: value < 1 ? `blur(${(1 - value) * 10}px)` : undefined, visible: value > 0 };
}

export const center = (rect: Rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

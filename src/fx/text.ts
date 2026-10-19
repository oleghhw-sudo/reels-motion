// src/fx/text.ts — display-текст карточки как чистые функции времени: слэм имени (#008), штамп номера, плашка подписи (#005).
// Перелёт разрешён только display-словам (living-motion §−1); обычный текст для чтения сюда не ставить.
import { seg } from '../motion/index.ts';
import { step } from '../motion/spring.ts';
import { SLAM, STAMP, TAG, type SlamPreset, type StampPreset, type TagPreset } from './presets.ts';

export type SlamState = { scale: number; opacity: number; trail: { scale: number; alpha: number }[] };

/** Слэм через t с после входа (t < 0 — ещё нет): масштаб from→1 с перелётом, шлейф из копий первые trail.dur с, полёт полупрозрачен. */
export function slam(t: number, P: SlamPreset = SLAM): SlamState | null {
  if (t < 0) return null;
  const scale = 1 + (P.from - 1) * (1 - step(t, P.spring));
  const trail =
    t <= P.trail.dur
      ? Array.from({ length: P.trail.copies }, (_, i) => {
          const gi = P.trail.copies - i; // дальняя копия первой (под ближними)
          return { scale: scale * (1 + P.trail.grow * gi * Math.max(0, 1 - t * P.trail.fade)), alpha: P.trail.alpha[gi - 1] ?? P.trail.alpha[P.trail.alpha.length - 1] };
        })
      : [];
  return { scale, opacity: scale > P.fly.above ? P.fly.opacity : 1, trail };
}

/** Штамп через t с (t < 0 — ещё нет): масштаб from→1 на пружине. */
export function stamp(t: number, P: StampPreset = STAMP): number | null {
  if (t < 0) return null;
  return 1 + (P.from - 1) * (1 - step(t, P.spring));
}

/** Плашка через t с (t < 0 — ещё нет): p — раскрытие маски 0..1, slide — сдвиг текста, px (въезжает слева). */
export function tagReveal(t: number, P: TagPreset = TAG): { p: number; slide: number } | null {
  if (t < 0) return null;
  const p = P.ease(seg(t, 0, P.dur));
  return { p, slide: -(1 - p) * P.slide };
}

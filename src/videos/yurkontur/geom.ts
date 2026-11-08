// Чистая геометрия ломаных (без React) — для кадра, раскладки и тестов.
import { clamp, lerp, type Pt } from '../../motion/index.ts';

/** Точка на доле k длины ломаной (без скругления) — для бусины договора и т. п. */
export function along(P: readonly Pt[], k: number): [number, number] {
  const segs = P.slice(1).map((q, i) => Math.hypot(q[0] - P[i][0], q[1] - P[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let s = clamp(k) * total;
  for (let i = 0; i < segs.length; i++) {
    if (s <= segs[i]) {
      const u = segs[i] ? s / segs[i] : 0;
      return [lerp(P[i][0], P[i + 1][0], u), lerp(P[i][1], P[i + 1][1], u)];
    }
    s -= segs[i];
  }
  const last = P[P.length - 1];
  return [last[0], last[1]];
}

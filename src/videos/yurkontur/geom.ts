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

/** Ортогональная ломаная → SVG d со скруглёнными углами радиуса r. */
export function roundedPath(P: readonly Pt[], r = 14): string {
  if (P.length < 2) return '';
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const [cx, cy] = P[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: Pt = [bx - ((bx - ax) / l1) * rr, by - ((by - ay) / l1) * rr];
    const p2: Pt = [bx + ((cx - bx) / l2) * rr, by + ((cy - by) / l2) * rr];
    d += ` L${p1[0]},${p1[1]} Q${bx},${by} ${p2[0]},${p2[1]}`;
  }
  const last = P[P.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

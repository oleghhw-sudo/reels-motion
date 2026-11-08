// Движение по связям схемы (режим hud, правки Олега 08.11 по кадру блока 5): фон чистый, без фактуры и штриховки.
// Вдоль каждой включённой связи бегут 6–10 трасс: головка-точка охрой r 3 px + графитовый хвост 200–450 px с затуханием
// прозрачности к нулю, толщина 1.4–1.8 px; скорость и фаза у каждой своя. Петля — те же трассы цветом loopTrace.
// Бледная нить самой связи рисуется в SVG (Scheme.tsx). Canvas лежит под узлами: подложки --paper закрывают трассы под
// карточками и текстом. Размеры — в экранных px (не зависят от наезда). Всё — функция (t, cam, связи); псевдослучай — hash.
import React, { useLayoutEffect, useRef } from 'react';
import { clamp, hash, lerp, type Pt } from '../../motion/index.ts';
import type { Cam } from './camera.ts';
import { C } from './tokens.ts';

export type Track = {
  /** Ортогональная ломаная мира (углы скругляются радиусом r) */
  pts: Pt[];
  /** Момент включения связи, с (трассы выходят из начала после него); null — связь не включена */
  on: number | null;
  kind: 'flow' | 'loop' | 'contract';
  /** Доля длины, до которой связь уже прорисована (петля); 1 — вся */
  maxK?: number;
  /** Для contract — положение головки, доля длины */
  headK?: number;
  /** Множитель прозрачности (приглушение блока 6) */
  alpha?: number;
};

export type FieldProps = { t: number; cam: Cam; tracks: Track[]; perChannel: number; width: number; height: number };

/** Нормы трасс (экранные px / px в секунду). */
export const TRACE = { headR: 3, tail: [200, 450], width: [1.4, 1.8], speed: [150, 280], tailAlpha: 0.62, corner: 14, gap: 24, maxTailOfChannel: 0.45 } as const;
// Короткий канал (общий план блока 5: ~220 px экрана) не вмещает 10 хвостов по 200–450 px — они сливаются в сплошную линию.
// Поэтому: хвост ≤ 45 % длины канала на экране; трассы канала идут по кругу длиной ≥ n · (0.6 · хвост + 24 px) —
// на коротком канале одновременно видно 3–4 трассы с небольшим перекрытием хвостов, на длинном (наезд) — все 6–10.

type Dense = { P: Pt[]; L: number[]; total: number };
/** Ломаная со скруглёнными углами → плотные точки + накопленная длина. */
export function densify(pts: readonly Pt[], r: number = TRACE.corner): Dense {
  const P: Pt[] = [];
  if (pts.length) P.push(pts[0]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: Pt = [bx - ((bx - ax) / l1) * rr, by - ((by - ay) / l1) * rr];
    const p2: Pt = [bx + ((cx - bx) / l2) * rr, by + ((cy - by) / l2) * rr];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      P.push([(1 - u) * (1 - u) * p1[0] + 2 * (1 - u) * u * bx + u * u * p2[0], (1 - u) * (1 - u) * p1[1] + 2 * (1 - u) * u * by + u * u * p2[1]]);
    }
  }
  if (pts.length > 1) P.push(pts[pts.length - 1]);
  const L: number[] = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, L, total: L[L.length - 1] ?? 0 };
}
function pointAt(d: Dense, s: number): [number, number] {
  const x = clamp(s, 0, d.total);
  let lo = 0;
  let hi = d.L.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (d.L[m] <= x) lo = m;
    else hi = m;
  }
  const seg = d.L[hi] - d.L[lo] || 1;
  const u = (x - d.L[lo]) / seg;
  return [lerp(d.P[lo][0], d.P[hi][0], u), lerp(d.P[lo][1], d.P[hi][1], u)];
}
function rgba(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${clamp(a).toFixed(3)})`;
}

/** Хвост от s1 (головка) назад до s0: отрезки ~5 экранных px, прозрачность от a0 у головки к нулю. */
function drawTail(ctx: CanvasRenderingContext2D, d: Dense, s0: number, s1: number, tailLen: number, color: string, a0: number, px: number): void {
  const step = 5 * px;
  for (let s = s1; s > s0; s -= step) {
    const sB = Math.max(s0, s - step);
    const k = (s1 - s) / tailLen; // 0 у головки → 1 у конца хвоста
    const a = a0 * Math.pow(1 - clamp(k), 1.6);
    if (a < 0.005) break;
    const p = pointAt(d, s);
    const q = pointAt(d, sB);
    ctx.strokeStyle = rgba(color, a);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
}

export function drawField(ctx: CanvasRenderingContext2D, p: FieldProps): void {
  const { t, cam, tracks, width, height } = p;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy);
  ctx.lineCap = 'butt';
  const px = 1 / cam.s;
  tracks.forEach((tr, ti) => {
    if (tr.pts.length < 2) return;
    const d = densify(tr.pts);
    const limit = d.total * clamp(tr.maxK ?? 1);
    const A = tr.alpha ?? 1;
    if (tr.kind === 'contract') {
      // выделенный договор блока 5: охровый хвост 380 px, 3 px (бусина — в SVG поверх узлов)
      const head = d.total * clamp(tr.headK ?? 0);
      const tail = 380 * px;
      ctx.lineWidth = 3 * px;
      drawTail(ctx, d, Math.max(0, head - tail), head, tail, C.tight, 0.95 * A, px);
      return;
    }
    if (tr.on === null || t < tr.on) return;
    const tailCol = tr.kind === 'loop' ? C.loopTrace : C.ink;
    const headCol = tr.kind === 'loop' ? C.loopTrace : C.tight;
    const n = p.perChannel;
    for (let j = 0; j < n; j++) {
      const seed = ti * 7919 + j * 104729;
      const v = lerp(TRACE.speed[0], TRACE.speed[1], hash(seed + 1)) * px; // мир/с
      const tail = Math.min(lerp(TRACE.tail[0], TRACE.tail[1], hash(seed + 2)) * px, d.total * TRACE.maxTailOfChannel);
      const w = lerp(TRACE.width[0], TRACE.width[1], hash(seed + 3)) * px;
      const cycle = Math.max(d.total + tail, n * (0.6 * tail + TRACE.gap * px));
      const delay = ((j / n + (0.35 * (hash(seed + 4) - 0.5)) / n) * cycle) / v;
      const run = (t - tr.on - delay) * v;
      if (run < 0) continue; // трасса ещё не вышла из начала связи
      const head = run % cycle;
      if (head > d.total + tail) continue; // трасса «за сценой» — ждёт своей очереди
      const hVis = Math.min(head, limit);
      const s0 = Math.max(0, head - tail);
      if (s0 >= hVis) continue;
      ctx.lineWidth = w;
      drawTail(ctx, d, s0, hVis, tail, tailCol, TRACE.tailAlpha * A, px);
      if (head <= limit) {
        const hp = pointAt(d, head);
        ctx.fillStyle = rgba(headCol, A);
        ctx.beginPath();
        ctx.arc(hp[0], hp[1], TRACE.headR * px, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

export const Field: React.FC<FieldProps> = (p) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) throw new Error('Field: canvas 2d недоступен');
    drawField(ctx, p);
  });
  return <canvas ref={ref} width={p.width} height={p.height} style={{ position: 'absolute', left: 0, top: 0, width: p.width, height: p.height }} />;
};

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

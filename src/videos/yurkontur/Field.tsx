// Поле режима hud: тонкие графитовые линии на бумаге. Плотнее вдоль активных трасс (поток, петля), реже в пустых зонах.
// Рисуется в координатах мира с трансформацией камеры (линии остаются тонкими при наезде). Без текста (canvas — только графика).
// Всё — функция (t, cam, трассы, плотность); псевдослучай — hash(i) (гейт 1: без Math.random/rAF/таймеров).
import React, { useLayoutEffect, useRef } from 'react';
import { clamp, frac, hash, lerp, type Pt } from '../../motion/index.ts';
import type { Cam } from './camera.ts';
import { C } from './tokens.ts';

/** Активная трасса: ломаная мира + вес (0..1 — насколько она «горит») + цвет частиц. */
export type Track = { pts: Pt[]; w: number; particles: 'ink' | 'accent' | 'none' };

export type FieldProps = { t: number; cam: Cam; tracks: Track[]; density: number; width: number; height: number };

/** Полная плотность (density = 1): фон 3 000 линий в видимой области, вдоль трасс 7 линий на 4 px длины · вес, частицы 0.6 на 4 px. */
const FULL = { bg: 3000, perPx: 7, partPerPx: 0.6 } as const;

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${clamp(a).toFixed(3)})`;
}

export function drawField(ctx: CanvasRenderingContext2D, p: FieldProps): void {
  const { t, cam, tracks, width, height } = p;
  const d = clamp(p.density, 0.1, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy);
  const px = 1 / cam.s; // 1 экранный пиксель в единицах мира
  // видимая область мира (+ запас)
  const vx0 = -cam.ox / cam.s - 400;
  const vy0 = -cam.oy / cam.s - 100;
  const vw = width / cam.s + 800;
  const vh = height / cam.s + 200;

  // 1) фон: редкие почти горизонтальные линии, медленный дрейф вправо
  ctx.lineWidth = 0.6 * px;
  const nBg = Math.round(FULL.bg * d);
  for (let i = 0; i < nBg; i++) {
    const speed = 8 + 40 * hash(i + 20011);
    const len = 30 + 260 * hash(i + 30013) ** 2;
    const x = vx0 + frac(hash(i) + (t * speed) / vw) * vw;
    const y = vy0 + hash(i + 10007) * vh;
    const ang = (hash(i + 40009) - 0.5) * 0.18;
    ctx.strokeStyle = hexA(C.line2, 0.2 + 0.4 * hash(i + 50021));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // 2) вдоль трасс: пучки линий по направлению отрезка, разлёт поперёк, бег по направлению потока
  tracks.forEach((tr, ti) => {
    if (tr.w <= 0.01) return;
    for (let si = 0; si < tr.pts.length - 1; si++) {
      const a = tr.pts[si];
      const b = tr.pts[si + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1) continue;
      const ux = (b[0] - a[0]) / L;
      const uy = (b[1] - a[1]) / L;
      const n = Math.round(L * FULL.perPx * d * tr.w * 0.4);
      const seed = ti * 100003 + si * 7919;
      ctx.lineWidth = 0.8 * px;
      for (let j = 0; j < n; j++) {
        const h0 = hash(seed + j);
        const h1 = hash(seed + j + 61001);
        const spread = (hash(seed + j + 62003) - 0.5) * 2;
        const off = Math.sign(spread) * (10 + 150 * Math.abs(spread) ** 1.6); // пучок вокруг оси: плотнее у оси, хвосты до ±160
        const len = 30 + 200 * h1 * h1;
        const speed = 40 + 160 * hash(seed + j + 63011);
        const k = frac(h0 + (t * speed) / (L + len)) * (L + len) - len;
        const k0 = Math.max(0, k);
        const k1 = Math.min(L, k + len);
        if (k1 <= k0) continue;
        const al = (0.15 + 0.45 * hash(seed + j + 64007)) * tr.w * (1 - Math.abs(spread) * 0.4);
        ctx.strokeStyle = hexA(C.ink, al);
        ctx.beginPath();
        ctx.moveTo(a[0] + ux * k0 - uy * off, a[1] + uy * k0 + ux * off);
        ctx.lineTo(a[0] + ux * k1 - uy * off, a[1] + uy * k1 + ux * off);
        ctx.stroke();
      }
      // частицы по оси трассы
      if (tr.particles === 'none') continue;
      const np = Math.round(L * FULL.partPerPx * d * tr.w * 0.25);
      const col = tr.particles === 'accent' ? C.accent : C.muted;
      for (let j = 0; j < np; j++) {
        const k = frac(hash(seed + j + 70001) + t * (0.12 + 0.2 * hash(seed + j + 71003)) * (300 / L)) * L;
        const off = (hash(seed + j + 72011) - 0.5) * 18;
        const warm = tr.particles === 'ink' && hash(seed + j + 73009) < 0.1;
        ctx.fillStyle = hexA(warm ? C.tight : col, (warm ? 0.85 : 0.35 + 0.4 * hash(seed + j + 74017)) * tr.w);
        ctx.beginPath();
        ctx.arc(a[0] + ux * k - uy * off, a[1] + uy * k + ux * off, (1 + 1.4 * hash(seed + j + 75011)) * px * 1.2, 0, Math.PI * 2);
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

/** Ломаная → точки с интерполяцией (для частиц/договора): точка на доле k длины. */
export function along(P: readonly Pt[], k: number): [number, number] {
  const segs = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
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

// Поле режима hud: тысячи тонких линий (графит на бумаге), пучки вдоль потока, частицы по схеме.
// Canvas 2D без текста (правило motion-prompt: canvas — только графика). Всё — функция кадра:
// рисуем в useLayoutEffect по (frame, density), псевдослучай — hash(i) (гейт 1: без Math.random/rAF).
import React, { useLayoutEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { frac, hash, lerp, through, type Pt } from '../../motion/index.ts';
import { C } from './tokens.ts';
import { FLOW_PATH, LOOP_PATH } from './schema.ts';

export type FieldProps = {
  /** Плотность 0.25..1 — множитель к полной: линий 3600, пучков 6×160, частиц 900 */
  density: number;
  /** Прозрачность всего поля (камера/вспышка снаружи) */
  opacity?: number;
};

const FULL = { lines: 3600, bundles: 6, perBundle: 160, particles: 900, loopParticles: 180 } as const;
const W = 1920;
const H = 1080;

/** Точка на полилинии по доле длины k ∈ [0,1). */
function alongPolyline(P: readonly Pt[], k: number): [number, number] {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < P.length; i++) {
    const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    segs.push(d);
    total += d;
  }
  let s = k * total;
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

const LOOP_CURVE = through(LOOP_PATH, 10);

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

export function drawField(ctx: CanvasRenderingContext2D, t: number, density: number): void {
  const d = Math.max(0.1, Math.min(1, density));
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'butt';

  // 1) поле тонких линий: почти горизонтальные, с лёгким разлётом, медленный дрейф вправо
  const nLines = Math.round(FULL.lines * d);
  ctx.lineWidth = 0.7;
  for (let i = 0; i < nLines; i++) {
    const h0 = hash(i);
    const h1 = hash(i + 10007);
    const h2 = hash(i + 20011);
    const h3 = hash(i + 30013);
    const speed = 12 + 70 * h2; // px/с
    const len = 40 + 360 * h3 * h3;
    const x0 = frac(h0 + (t * speed) / (W + len)) * (W + len) - len;
    const y0 = h1 * H;
    const ang = (h2 - 0.5) * 0.22;
    const a = 0.18 + 0.42 * hash(i + 40009);
    ctx.strokeStyle = hexA(C.line2, a);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
  }

  // 2) пучки: плотные полосы графита между узлами потока (аналог ярких пучков референса)
  const nB = FULL.bundles;
  const per = Math.round(FULL.perBundle * d);
  ctx.lineWidth = 1;
  for (let b = 0; b < nB; b++) {
    const k0 = (b + 0.5) / nB;
    const [cx, cy] = alongPolyline(FLOW_PATH, k0);
    for (let j = 0; j < per; j++) {
      const i = b * 1000 + j;
      const h0 = hash(i + 50021);
      const h1 = hash(i + 60013);
      const h2 = hash(i + 70001);
      const speed = 90 + 260 * h2;
      const len = 80 + 420 * h0;
      const span = 520;
      const x0 = cx - span / 2 + frac(h1 + (t * speed) / span) * span;
      const y0 = cy + (hash(i + 80021) - 0.5) * 2 * (14 + 60 * h0);
      const a = 0.05 + 0.3 * hash(i + 90001) * (1 - Math.abs(x0 + len / 2 - cx) / span);
      if (a <= 0.01) continue;
      ctx.strokeStyle = hexA(C.ink, a);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + len, y0);
      ctx.stroke();
    }
  }

  // 3) частицы основного потока: скани → картка
  const nP = Math.round(FULL.particles * d);
  for (let i = 0; i < nP; i++) {
    const h0 = hash(i + 100003);
    const h1 = hash(i + 110017);
    const h2 = hash(i + 120011);
    const speed = 0.05 + 0.09 * h1; // доля пути в секунду
    const k = frac(h0 + t * speed);
    const [x, y] = alongPolyline(FLOW_PATH, k);
    const dy = (h2 - 0.5) * 2 * (6 + 26 * hash(i + 130001));
    const r = 0.9 + 1.6 * hash(i + 140007);
    const warm = hash(i + 150001) < 0.12;
    ctx.fillStyle = hexA(warm ? C.tight : C.muted, warm ? 0.8 : 0.35 + 0.4 * h2);
    ctx.beginPath();
    ctx.arc(x, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4) частицы петли навчання (рідше, зелені, пунктирно — «так працюватиме»)
  const nL = Math.round(FULL.loopParticles * d);
  for (let i = 0; i < nL; i++) {
    const h0 = hash(i + 200003);
    const h1 = hash(i + 210017);
    const k = frac(h0 + t * (0.03 + 0.04 * h1));
    const idx = k * (LOOP_CURVE.length - 1);
    const j = Math.floor(idx);
    const u = idx - j;
    const p0 = LOOP_CURVE[j];
    const p1 = LOOP_CURVE[Math.min(LOOP_CURVE.length - 1, j + 1)];
    const x = lerp(p0[0], p1[0], u);
    const y = lerp(p0[1], p1[1], u) + (hash(i + 220011) - 0.5) * 10;
    ctx.fillStyle = hexA(C.accent, 0.3 + 0.5 * hash(i + 230001));
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + hash(i + 240007), 0, Math.PI * 2);
    ctx.fill();
  }
}

export const Field: React.FC<FieldProps> = ({ density, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const t = frame / fps;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) throw new Error('Field: canvas 2d недоступен');
    drawField(ctx, t, density);
  }, [t, density]);
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity }} />;
};

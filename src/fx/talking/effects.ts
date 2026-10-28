// src/fx/talking/effects.ts — чистые функции кадра трёх эффектов пилота (cinematic-fx §3 O: O9 bignum, O8 figma, O7 lens).
// Вход — u (секунды от t0), d (длина окна), параметры из плана; выход — числа для компонентов. Кривые — E (src/motion),
// время — секунды; никаких таймеров и случайностей (гейт 1). Числа — §3 O; что пришлось выбрать самому — помечено «выбор».
import { E } from '../../motion/tokens.ts';
import { BACK, backEnv, travel } from './window.ts';
import type { BignumFx, Effect, FigmaFx, LensFx, Rect } from './plan.ts';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- O9 цифра за головой
export const BIGNUM = { size: 900, color: '#f3e9d2', stroke: 6, enter: 0.35, scaleFrom: 1.12, blurFrom: 24, rise: 24, exitLift: 90, exitBlur: 24 } as const;
export type BignumState = { env: number; scale: number; blur: number; dy: number; opacity: number };
/** Вход из размытия и 112 % за enter, всплытие на rise за всё окно (линейно), уход вверх в размытие за back. */
export const bignum = (u: number, d: number, back: number = BACK.default): BignumState => {
  const env = backEnv(u, d, back);
  if (env <= 0) return { env: 0, scale: BIGNUM.scaleFrom, blur: BIGNUM.blurFrom, dy: 0, opacity: 0 };
  const a = E.out(clamp01(u / BIGNUM.enter));
  const b = Math.min(back, BACK.max, d / 2);
  const x = u > d - b ? E.in(clamp01((u - (d - b)) / b)) : 0;
  return {
    env,
    scale: lerp(BIGNUM.scaleFrom, 1, a),
    blur: BIGNUM.blurFrom * (1 - a) + BIGNUM.exitBlur * x,
    dy: -BIGNUM.rise * clamp01(u / d) - BIGNUM.exitLift * x,
    opacity: Math.min(a, env),
  };
};

// ---------------------------------------------------------------- O8 выделение как в Figma
export const FIGMA = {
  blue: '#0d99ff', letterStep: 0.022, letterStart: 0.08, letterIn: 0.12, letterBlur: 10, letterRise: 8,
  maxWidth: 820, charW: 0.64, lineH: 1.12, // charW — ширина буквы в долях кегля (выбор, оценка для Unbounded 700)
  frameStart: 0.22, frameDur: 0.3, stretchAt: 0.55, stretchDur: 0.3, stretch: 1.28, handle: 14, cursorMove: 0.1, underIn: 0.12, underGap: 36,
  safeLeft: 64, safeRight: 1080 - 140, badgeFlipX: 760, // safe zones ARCHITECTURE.md; бейдж курсора уходит влево от курсора правее badgeFlipX
} as const;
export type FigmaLetter = { ch: string; italic: boolean; opacity: number; blur: number; dy: number };
export type FigmaState = {
  env: number; fontSize: number; x: number; y: number; w: number; h: number; // бокс слова (до растяжения), y — верх
  letters: FigmaLetter[];
  frame: number; // 0…1 рост рамки из левого нижнего угла
  stretch: number; // 1…1.28 по X (origin слева)
  cursor: { x: number; y: number; opacity: number };
  under: { text: string; opacity: number }[];
  sizeBadge: string;
};
/** Геометрия слова: ширина ПОСЛЕ растяжения ×1.28 ≤ maxWidth (820) и внутри safe zones (64…940); бокс центрирован по растянутому виду. */
export const figmaGeom = (e: FigmaFx) => {
  const n = e.word.length;
  const fontSize = Math.min(150, Math.floor(FIGMA.maxWidth / FIGMA.stretch / (n * FIGMA.charW)));
  const w = Math.round(n * FIGMA.charW * fontSize), h = Math.round(fontSize * FIGMA.lineH);
  const x = Math.round(FIGMA.safeLeft + (FIGMA.safeRight - FIGMA.safeLeft - w * FIGMA.stretch) / 2);
  return { fontSize, w, h, x, y: e.y - Math.round(h / 2) };
};
export const figma = (u: number, d: number, e: FigmaFx, back: number = BACK.default): FigmaState => {
  const env = backEnv(u, d, back);
  const g = figmaGeom(e);
  const italicSet = new Set(e.italic.split(''));
  let italicLeft = e.italic.length; // курсивом — первые вхождения букв из italic (1–2 буквы)
  const letters: FigmaLetter[] = e.word.split('').map((ch, i) => {
    const age = u - FIGMA.letterStart - i * FIGMA.letterStep;
    const a = E.out(clamp01(age / FIGMA.letterIn));
    const it = italicSet.has(ch) && italicLeft > 0;
    if (it) italicLeft--;
    return { ch, italic: it, opacity: a, blur: FIGMA.letterBlur * (1 - a), dy: FIGMA.letterRise * (1 - a) };
  });
  const frame = E.out(clamp01((u - FIGMA.frameStart) / FIGMA.frameDur));
  const tS = FIGMA.stretchAt * d;
  const stretch = lerp(1, FIGMA.stretch, E.out(clamp01((u - tS) / FIGMA.stretchDur)));
  // курсор: тянет рамку из левого нижнего угла к правому верхнему; на ударном слове перескакивает к правому нижнему маркеру и тянет вправо
  const toHandle = E.ui(clamp01((u - (tS - FIGMA.cursorMove)) / FIGMA.cursorMove));
  const cxDrag = lerp(g.x, g.x + g.w, frame), cyDrag = lerp(g.y + g.h, g.y, frame);
  const cxHandle = g.x + g.w * stretch, cyHandle = g.y + g.h;
  const cursor = { x: lerp(cxDrag, cxHandle, toHandle), y: lerp(cyDrag, cyHandle, toHandle), opacity: Math.min(env, E.out(clamp01((u - FIGMA.frameStart + 0.1) / 0.15))) };
  const under = e.under.map((w) => ({ text: w.text, opacity: Math.min(env, E.out(clamp01((u - w.at) / FIGMA.underIn))) }));
  return { env, ...g, letters, frame, stretch, cursor, under, sizeBadge: `${Math.round(g.w * stretch * frame)} × ${Math.round(g.h * frame)}` };
};
/** Прямоугольник всей графики figma (слово растянутое + рамка + мелкие слова) — для проверки «не на лице». */
export const figmaBox = (e: FigmaFx): Rect => {
  const g = figmaGeom(e);
  const under = e.under.length ? FIGMA.underGap + 24 + 40 * e.under.length : 0;
  return { x: g.x - FIGMA.handle, y: g.y - FIGMA.handle - 28, w: Math.round(g.w * FIGMA.stretch) + 2 * FIGMA.handle, h: g.h + 2 * FIGMA.handle + 28 + under };
};

// ---------------------------------------------------------------- O7 жидкое стекло
export const LENS = { enter: 0.25, sizeFrom: 0.6, arcLift: 60, edgeMag: 1.0, caPx: 2.5, rim: 3, shadow: '0 28px 48px rgba(0,0,0,0.45)' } as const; // arcLift, caPx — выбор
export type LensState = { env: number; cx: number; cy: number; r: number; mag: number; opacity: number };
/** Линза идёт по дуге from→to (travel по E.smooth без хвоста back), вход из 60 % размера, растворение в хвосте. */
export const lens = (u: number, d: number, e: LensFx, back: number = BACK.default): LensState => {
  const env = backEnv(u, d, back);
  const p = travel(u, d, back);
  const size = lerp(LENS.sizeFrom, 1, E.out(clamp01(u / LENS.enter)));
  return { env, cx: lerp(e.from[0], e.to[0], p), cy: lerp(e.from[1], e.to[1], p) - LENS.arcLift * Math.sin(Math.PI * p), r: e.r * size, mag: e.mag, opacity: env };
};
/** Бокс линзы в момент t (для проверки «не на лице»). */
export const lensBox = (e: LensFx, u: number, d: number): Rect => {
  const s = lens(u, d, e);
  return { x: s.cx - e.r, y: s.cy - e.r, w: 2 * e.r, h: 2 * e.r };
};

/** Бокс графики эффекта в момент t (абсолютные секунды); bignum — за человеком, не проверяется (null). */
export const boxOf = (e: Effect, t: number): Rect | null => {
  const u = t - e.t0, d = e.t1 - e.t0;
  if (u < 0 || u >= d) return null;
  if (e.fx === 'figma') return figmaBox(e);
  if (e.fx === 'lens') return lensBox(e, u, d);
  return null;
};
export type { BignumFx, FigmaFx, LensFx };

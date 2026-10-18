// Ported from Rieranthony/product-film-skill @fe11efc4 · MIT (c) 2026 Rieranthony — plugins/product-film/skills/product-film/templates/kit/camera.ts (camera, project, worldTransform)
// Ported from Leonxlnx/cinetic @ecfa6605 · MIT (c) 2026 Leonxlnx — skills/cinetic/assets/remotion-starter/src/lib/{camera,anim}.ts (Shot, lc, breath, dip, toScreen, shotStyle, lmix)
// Камера = одно преобразование одного контейнера мира. Ключи камеры — на тяжёлой пружине, зум — в лог-пространстве
// (наезд читается одинаково на любом масштабе).
// Изменения при переносе:
//   - размер кадра — параметр (из useVideoConfig()), не константа 1920×1080: у нас 1080×1920 и 1920×1080;
//   - пружина по умолчанию — SPR.camera из ./tokens.ts (те же 120/30/1.2);
//   - camera() cinetic (CSS-стиль кадра по Shot) переименован в shotStyle(), чтобы не путать с camera() по ключам.
// Тексты лицензий — THIRD-PARTY-LICENSES.md.
import type React from 'react';
import { lerp } from './index.ts';
import { track, type SpringConfig } from './spring.ts';
import { SPR } from './tokens.ts';

/** Размер кадра в px — из useVideoConfig(): { width, height }. */
export type FrameSize = { width: number; height: number };

/** Ключ камеры в мировых единицах: [время, с; x, y — точка мира в центре кадра; zoom]. */
export type CameraKey = readonly [time: number, x: number, y: number, zoom: number];
export type Camera = { x: number; y: number; zoom: number };

/** Камера в момент t. Зум пружинит в лог-пространстве. */
export function camera(t: number, keys: readonly CameraKey[], config: SpringConfig = SPR.camera): Camera {
  return {
    x: track(t, keys.map(([time, x]) => [time, x] as const), config),
    y: track(t, keys.map(([time, , y]) => [time, y] as const), config),
    zoom: Math.exp(track(t, keys.map(([time, , , zoom]) => [time, Math.log(zoom)] as const), config)),
  };
}

/** Экранная позиция точки мира. */
export function project(view: Camera, x: number, y: number, frame: FrameSize) {
  return { x: frame.width / 2 + (x - view.x) * view.zoom, y: frame.height / 2 + (y - view.y) * view.zoom };
}

/** CSS transform слоя мира (transform-origin 0 0). will-change на него не ставить — текст мылится. */
export function worldTransform(view: Camera, frame: FrameSize): string {
  return `translate(${frame.width / 2}px, ${frame.height / 2}px) scale(${view.zoom}) translate(${-view.x}px, ${-view.y}px)`;
}

/** Смесь в лог-пространстве для масштаба и зума: равные отношения за кадр — зум не «ускоряется». */
export const lmix = (a: number, b: number, t: number): number => Math.exp(lerp(Math.log(a), Math.log(b), t));

/** Кадр-«якорь»: точка мира (ax, ay) стоит в точке экрана (sx, sy) при масштабе k. */
export type Shot = {
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  k: number;
  yaw?: number; // град, rotateY
  pitch?: number; // град, rotateX
  roll?: number; // град, rotateZ; |roll| ≤ 11
};

/** Смесь двух кадров: якоря — линейно, масштаб — в лог-пространстве. Цепочки без дрейфа: lc(lc(A, B, t1), C, t2). */
export const lc = (A: Shot, B: Shot, t: number): Shot => ({
  ax: lerp(A.ax, B.ax, t),
  ay: lerp(A.ay, B.ay, t),
  sx: lerp(A.sx, B.sx, t),
  sy: lerp(A.sy, B.sy, t),
  k: lmix(A.k, B.k, t),
  yaw: lerp(A.yaw ?? 0, B.yaw ?? 0, t),
  pitch: lerp(A.pitch ?? 0, B.pitch ?? 0, t),
  roll: lerp(A.roll ?? 0, B.roll ?? 0, t),
});

/** Стиль контейнера мира по Shot (мир разложен от left:0, top:0). Крен — вне наклона, текст не перекашивается в курсив. */
export const shotStyle = (s: Shot, perspective = 2400): React.CSSProperties => {
  const rot = s.yaw || s.pitch || s.roll ? ` perspective(${perspective}px) rotateZ(${s.roll ?? 0}deg) rotateX(${s.pitch ?? 0}deg) rotateY(${s.yaw ?? 0}deg)` : '';
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: '0 0',
    transform: `translate(${s.sx}px, ${s.sy}px)${rot} scale(${Math.max(1e-4, s.k)}) translate(${-s.ax}px, ${-s.ay}px)`,
  };
};

/** Экранная позиция точки мира при плоском Shot (без yaw/pitch/roll) — для оверлеев, привязанных к миру. */
export const toScreen = (s: Shot, p: { x: number; y: number }) => ({ x: s.sx + (p.x - s.ax) * s.k, y: s.sy + (p.y - s.ay) * s.k });

/** «Дыхание» в паузе: умножить зум/k на него; t — прогресс паузы 0..1, amount 0.025 = +2.5 %. Снимается следующим движением. */
export const breath = (t: number, amount = 0.025): number => 1 + amount * t;

/** Провал-отъезд во время хлёста (t — прогресс хлёста 0..1): умножить зум/k на него. */
export const dip = (t: number, depth = 0.18): number => 1 - depth * Math.sin(Math.PI * t) ** 2;

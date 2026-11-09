// Раскладка станций петли блока 4 (loop.tsx) в экранных px — чистая функция времени для кадра и для jumps.test.ts.
// Панель вырастает из станции мира за STAGE_MOVE, соседи сжимаются в карточки (слоты сцены панелей stage.ts).
import { clamp, expoOut, lerp, seg, smoother } from '../../motion/index.ts';
import { camAt, type Cam } from './camera.ts';
import { CHIP, LOOP_CHIPS, LOOP_STEPS, nodeById } from './schema.ts';
import type { Pt } from '../../motion/index.ts';
import { LEFT, PANEL, RIGHT, STAGE_MOVE, type Rect } from './stage.ts';
import { APPEAR, LOOP_EV } from './timeline.ts';
import { BORDER } from './tokens.ts';

export const DELAY = 0.3;
export const MOVE = STAGE_MOVE;
export const N = LOOP_STEPS.length; // 6 станций; панели — у первых пяти, шестая («нова версія / відкат») — в мире
export const PANELS = N - 1;
export const at = (i: number) => APPEAR[`chip:${i}`];

/** Окно сцены станций: вход — первая станция раскрывается из мира, выход — последняя панель сжимается в свою станцию. */
export const LOOP_WIN = { in: at(0) + DELAY, out: at(5) - 0.5 } as const;
export function loopMix(t: number): number {
  return smoother(seg(t, LOOP_WIN.in, LOOP_WIN.in + MOVE)) * (1 - smoother(seg(t, LOOP_WIN.out, LOOP_WIN.out + MOVE)));
}

/** Станция «сделана»: панель обводится зелёным, ставится галочка, сжатая карточка заливается зелёным. */
const DONE = [LOOP_EV.fix + 0.75, at(2) - 0.2, at(3) - 0.2, LOOP_EV.tags[2] + 0.75, LOOP_EV.check + 0.55] as const;

type Slot = 'left' | 'center' | 'right' | 'offL' | 'offR';
const OFF_L: Rect = { ...LEFT, x: -360 };
const OFF_R: Rect = { ...RIGHT, x: 1960 };
const SLOT: Record<Slot, Rect> = { left: LEFT, center: PANEL, right: RIGHT, offL: OFF_L, offR: OFF_R };
const slotOf = (i: number, c: number): Slot => (i === c ? 'center' : i === c - 1 ? 'left' : i === c + 1 ? 'right' : i < c ? 'offL' : 'offR');
const lerpR = (a: Rect, b: Rect, u: number): Rect => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) });

export function loopStage(t: number): { c: number; p: number; u: number } {
  let c = 0;
  for (let k = 0; k < PANELS; k++) if (at(k) + DELAY <= t) c = k;
  return { c, p: Math.max(0, c - 1), u: c === 0 ? 1 : smoother(clamp((t - at(c) - DELAY) / MOVE)) };
}

export type LoopCard = { i: number; rect: Rect; open: number; opacity: number; labelPx: number; radius: number; done: number; fill: number };
/** Раскладка станций в экранных px — одна чистая функция для кадра и для проверки скачков (jumps.test.ts). */
export function loopLayout(t: number, cam: Cam = camAt(t)): LoopCard[] {
  const m = loopMix(t);
  if (m <= 0) return [];
  const { c, p, u } = loopStage(t);
  const out: LoopCard[] = [];
  for (let i = 0; i < N; i++) {
    const live = t < at(i) ? 0 : expoOut(seg(t, at(i), at(i) + 0.55));
    const [x, y] = LOOP_CHIPS[i];
    const world: Rect = { x: (x - CHIP.w / 2) * cam.s + cam.ox, y: (y - CHIP.h / 2) * cam.s + cam.oy, w: CHIP.w * cam.s, h: CHIP.h * cam.s };
    const sp = slotOf(i, p);
    const sc = slotOf(i, c);
    const st = lerpR(SLOT[sp], SLOT[sc], u);
    const open = ((sp === 'center' ? 1 - u : 0) + (sc === 'center' ? u : 0)) * m;
    const vis = (s: Slot) => (s === 'offL' || s === 'offR' ? 0 : 1);
    const shown = vis(sp) + (vis(sc) - vis(sp)) * u;
    const done = i < PANELS ? smoother(seg(t, DONE[i], DONE[i] + 0.35)) : 0;
    out.push({
      i,
      rect: lerpR(world, st, m),
      open,
      opacity: live * m * shown ** 3,
      labelPx: lerp(CHIP.font * cam.s, 32 + 4 * open, m),
      radius: lerp(42 * cam.s, BORDER.radius, m),
      done,
      // заливка — только у сжатой карточки (на сжатии панели большой зелёный прямоугольник не появляется)
      fill: done * (1 - smoother(seg(open, 0.02, 0.22))),
    });
  }
  return out;
}


// ---------------------------------------------------------------- значок версии навички читання: путь и время прихода в узлы
/** «навичка читання v0.2 → v0.3» (в проекте сейчас 0.2.0): появляется после проверки, уходит по зелёной трассе. */
export const VERSION = { show: LOOP_EV.check + 1.35, bump: LOOP_EV.check + 1.75, ocr: 0, read2: 0 };
const ocrN = nodeById('ocr');
const read2N = nodeById('read2');
/** Путь значка в мире: станция «нова версія» → вверх в «Розпізнавання» → по шине в «Два читання». */
export const BADGE_PATH: Pt[] = [LOOP_CHIPS[5], [ocrN.x, ocrN.y], [ocrN.x + 40, ocrN.y + ocrN.h / 2 + 34], [read2N.x - 40, ocrN.y + ocrN.h / 2 + 34], [read2N.x, read2N.y]];
const pathLen = (P: Pt[]) => P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
const LENS = pathLen(BADGE_PATH);
const K_OCR = LENS[0] / LENS.reduce((a, b) => a + b, 0);
export const TRAVEL = { from: LOOP_WIN.out + MOVE * 0.9, to: LOOP_WIN.out + MOVE * 0.9 + 1.6 } as const;
// время прихода значка в узлы (кривая smoother по пути: доля K_OCR достигается раньше середины)
const invSmoother = (y: number) => {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (smoother(mid) < y) lo = mid;
    else hi = mid;
  }
  return lo;
};
VERSION.ocr = TRAVEL.from + (TRAVEL.to - TRAVEL.from) * invSmoother(K_OCR);
VERSION.read2 = TRAVEL.to;


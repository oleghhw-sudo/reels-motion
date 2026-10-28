// src/fx/talking/window.ts — окно эффекта говорящей головы (cinematic-fx §3 O, задача 026-А).
// Время — секунды исходника; u = t − t0, d = t1 − t0. Последние back секунд окна (0.2–0.35 с) каждый эффект
// возвращает обычный кадр: backEnv → 0 к концу; на краях окна (u ≤ 0, u ≥ d) backEnv = 0. Кривые — только E из src/motion.
import { E } from '../../motion/tokens.ts';

export const BACK = { min: 0.2, max: 0.35, default: 0.28, attack: 0.08 } as const;

export type Window = { t0: number; t1: number };
export type WindowState = { u: number; d: number; p: number; inside: boolean };

/** Положение момента t в окне: u от t0, d — длина, p = u/d (0…1, клампится), inside — t0 ≤ t < t1. */
export const windowOf = (t: number, w: Window): WindowState => {
  const d = w.t1 - w.t0;
  const u = t - w.t0;
  return { u, d, p: d > 0 ? Math.min(1, Math.max(0, u / d)) : 0, inside: u >= 0 && u < d };
};

/** Огибающая «обычный кадр по краям»: 0 вне окна, подъём E.out за attack, 1 внутри, спад E.smooth за последние back секунд. */
export const backEnv = (u: number, d: number, back: number = BACK.default, attack: number = BACK.attack): number => {
  if (u <= 0 || u >= d || d <= 0) return 0;
  const b = Math.min(Math.max(back, BACK.min), BACK.max, d / 2);
  if (u < attack) return E.out(u / attack);
  if (u > d - b) return E.smooth((d - u) / b);
  return 1;
};

/** Доля активной части окна (без хвоста back): 0…1 по E.smooth — для движения по дуге и т. п. */
export const travel = (u: number, d: number, back: number = BACK.default): number => {
  const b = Math.min(Math.max(back, BACK.min), BACK.max, d / 2);
  const len = Math.max(1e-6, d - b);
  return E.smooth(Math.min(1, Math.max(0, u / len)));
};

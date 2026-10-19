// src/fx/presets.ts — именованные пресеты приёмов (задача 012-А). Числа — ROOK (docs/tasks/data/008-proto-rook-card.py,
// cinematic-fx §2), перенесены из финала ep01 (src/videos/mia-outro/fx.tsx + MiaOutro.tsx, коммит 2f3856c).
// Сцены берут приёмы ТОЛЬКО отсюда, как кривые из E.* и пружины из SPR.* — сырых чисел в сценах нет.
// Всё время — секунды: F24(n) переводит «n кадров при 24 fps» (так записан прототип) в секунды;
// кадры при другом fps получаются у вызывающего через fps (hit.ts, core.ts). Числа — гипотезы, калибруются на эталоне.
import { E, SPR, type Ease } from '../motion/tokens.ts';
import type { SpringConfig } from '../motion/spring.ts';
import { RAMP, tauFromPerFrame, type WhipPreset } from './core.ts';

/** n кадров при 24 fps → секунды. */
export const F24 = (n: number): number => n / 24;

/** Затухающая тряска: amp px · exp(−t/τ), направление по rand(seed:кадр); не дольше maxDur; старт через from после удара. */
export type Shake = { amp: number; tau: number; maxDur: number; from: number };
const shake = (amp: number, perFrame24: number, maxFrames: number, fromFrames: number): Shake => ({
  amp,
  tau: tauFromPerFrame(perFrame24, 24),
  maxDur: F24(maxFrames),
  from: F24(fromFrames),
});

export type HitPreset = {
  name: string;
  /** Белая вспышка в кадре удара: доля (0 — нет) и длительность. */
  flash: number;
  flashDur: number;
  /** Impact-кадры (аниме): длительность (0 — нет); первая половина — сигнальный красный, вторая — цвет героя. */
  impactDur: number;
  impactRed: string;
  impactScale: number;
  impactRays: { n: number; half: number; rot: number };
  /** Тряска impact-кадров, тряска отдачи (#024), вторая тряска на посадке имени. */
  impactShake: Shake | null;
  shake: Shake | null;
  land: Shake | null;
  /** Хроматика в отдаче (#111): px в начале, затухание τ, старт. */
  ca: { px: number; tau: number; from: number } | null;
  /** Раскрытие нового фона кругом из центра фигуры. */
  reveal: { from: number; dur: number; ease: Ease } | null;
  /** Zoom-punch (S): +amount за кадр, удержание hold, возврат dur по ease. */
  punch: { amount: number; hold: number; dur: number; ease: Ease } | null;
};

const IMPACT_RED = '#E1140A';
const RAYS = { n: 40, half: 0.012, rot: 0.05 };

/** Размеры удара (cinematic-fx §2): L — всё (ROOK), M — без impact-кадров, S — только zoom-punch. */
export const HIT = {
  L: {
    name: 'L',
    flash: 0.9,
    flashDur: F24(1),
    impactDur: F24(2),
    impactRed: IMPACT_RED,
    impactScale: 1.06,
    impactRays: RAYS,
    impactShake: shake(30, 0.72, 12, 0),
    shake: shake(22, 0.72, 12, 1),
    land: shake(12, 0.72, 12, 3),
    ca: { px: 14, tau: tauFromPerFrame(0.7, 24), from: F24(1) },
    reveal: { from: F24(1), dur: F24(4), ease: E.out },
    punch: null,
  },
  M: {
    name: 'M',
    flash: 0.6,
    flashDur: F24(1),
    impactDur: 0,
    impactRed: IMPACT_RED,
    impactScale: 1.06,
    impactRays: RAYS,
    impactShake: null,
    shake: shake(12, 0.72, 7, 1), // отдача 8 кадров (k = 1…8)
    land: null,
    ca: { px: 6, tau: tauFromPerFrame(0.7, 24), from: F24(1) },
    reveal: null,
    punch: null,
  },
  S: {
    name: 'S',
    flash: 0,
    flashDur: 0,
    impactDur: 0,
    impactRed: IMPACT_RED,
    impactScale: 1,
    impactRays: RAYS,
    impactShake: null,
    shake: null,
    land: null,
    ca: null,
    reveal: null,
    punch: { amount: 0.07, hold: F24(1), dur: F24(8), ease: E.out },
  },
} satisfies Record<string, HitPreset>;

/** Финальный удар-взрыв ep01: 3 белых кадра, тяжёлая тряска 40 px с 3-го кадра, без impact-кадров и хроматики. */
export const BLAST: HitPreset = { ...HIT.L, name: 'blast', flash: 1, flashDur: F24(3), impactDur: 0, impactShake: null, shake: shake(40, 0.72, 14, 3), land: null, ca: null, reveal: null };

/** Подвод к удару (ROOK): наезд, обесцвечивание, контраст, хроматика по кривой; засветка на последних кадрах; ramp. */
export type LeadPreset = {
  zoom: number;
  ease: Ease;
  desat: number;
  contrast: readonly [base: number, add: number];
  ca: number;
  origin: string;
  /** Засветка: отсчёты по кадрам до удара (последний элемент — кадр перед ударом). */
  flash: { dur: number; a: readonly number[] };
  ramp: { slowDur: number; slow: number };
};
export const LEAD: LeadPreset = {
  zoom: 0.16,
  ease: E.in, // ep01 (2f3856c): E.in; cinematic-fx §2 называет E.contact — гипотеза, калибровать на эталоне
  desat: 0.6,
  contrast: [1.05, 0.25],
  ca: 10,
  origin: '55% 42%',
  flash: { dur: F24(2), a: [0.35, 0.7] },
  ramp: RAMP,
};

/** Отдача карточки (ROOK): фигура выпрыгивает и дрейфует, лучи вращаются, камера наезжает, тексты входят по очереди. */
export const RECOIL = {
  figure: { pop: 0.14, spring: SPR.pop as SpringConfig, delay: 0.04, grow: 0.0012 * 24, drift: 0.6 * 24 }, // grow — доля/с, drift — px/с
  raysSpin: 0.004 * 24, // рад/с
  push: 0.035,
  pushEase: E.out,
  nameAt: F24(3),
  tagAt: F24(3),
  stampAt: F24(5),
  /** Текст на выходном смазе — полупрозрачный (смазан вместе с кадром). */
  textOnSmear: 0.35,
} as const;

/** Слэм display-слова (#008): масштаб from→1 на пружине с перелётом, шлейф из copies копий только первые trail.dur с. */
export type SlamPreset = {
  from: number;
  spring: SpringConfig;
  trail: { copies: number; grow: number; fade: number; alpha: readonly number[]; dur: number };
  /** Полётные кадры (масштаб > above) — полупрозрачно: видится смазанным, readcheck их чтением не считает. */
  fly: { above: number; opacity: number };
};
export const SLAM: SlamPreset = { from: 1.9, spring: SPR.slam, trail: { copies: 2, grow: 0.18, fade: 6, alpha: [130 / 255, 70 / 255], dur: 0.09 }, fly: { above: 1.3, opacity: 0.45 } };

/** Штамп (номер): from→1 на пружине. */
export type StampPreset = { from: number; spring: SpringConfig };
export const STAMP: StampPreset = { from: 2.2, spring: SPR.stamp };

/** Плашка подписи (#005): раскрытие маской слева за dur, текст въезжает на slide px. */
export type TagPreset = { dur: number; slide: number; ease: Ease };
export const TAG: TagPreset = { dur: F24(7), slide: 60, ease: E.out };

/** Смаз-склейка (#043): вход 2 кадра, выход 2 кадра, выход из карточки 3 кадра с затемнением; сдвиг кадра = shift·px. */
export const WHIP: WhipPreset = {
  in: { dur: F24(2), px: [120, 60] },
  out: { dur: F24(2), px: [60, 120] },
  outCard: { dur: F24(3), px: [90, 180, 270], dark: [0.22, 0.44, 0.66] },
  shift: 0.35,
};

/** Финишная обработка: зерно (#118) и виньетка поверх; filter — на содержимое (lookFilter). */
export type LookPreset = { name: string; grain: number; vignette: number; vignetteFrom: number; filter: string | null };
export const LOOK = {
  none: { name: 'none', grain: 0, vignette: 0, vignetteFrom: 0.52, filter: null },
  film: { name: 'film', grain: 0.07, vignette: 0.42, vignetteFrom: 0.52, filter: null },
  /** Ч/б стоп-кадр под раскрытием карточки (ROOK): без цвета, контраст 1.4. */
  monoHit: { name: 'monoHit', grain: 0.07, vignette: 0.42, vignetteFrom: 0.52, filter: 'grayscale(1) contrast(1.4)' },
} satisfies Record<string, LookPreset>;

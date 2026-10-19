// src/fx/core.ts — чистая математика приёмов БЕЗ импортов React/remotion/tokens: её импортируют и сцены, и
// node-скрипты (model.ts аутро → check-zones.mjs, stills.mjs), поэтому здесь ничего, что тянет remotion.
// Время — секунды; кадры появляются только через fps вызывающего (задача 012-А, cinematic-fx §4).

/** Speed ramp ROOK (#038): последние 9 кадров @24 fps (0.375 с) идут ×0.55. */
export const RAMP = { slowDur: 9 / 24, slow: 0.55 } as const;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Постоянная времени τ (с) затухания, заданного множителем за кадр при fps: decay^k = exp(−t/τ), t = k/fps. */
export const tauFromPerFrame = (decayPerFrame: number, fps: number): number => -1 / (fps * Math.log(decayPerFrame));

/** exp(−t/τ) при t ≥ 0, 0 до события. */
export const decayAt = (t: number, tau: number): number => (t < 0 ? 0 : Math.exp(-t / tau));

/** Номер кадра от времени (ближайший). */
export const frameOf = (t: number, fps: number): number => Math.round(t * fps);

/**
 * Профиль, заданный отсчётами по кадрам при 24 fps (например смаз 120 → 60 px), в точке p ∈ [0, 1]:
 * линейная интерполяция между отсчётами; при другом fps кадров больше или меньше, форма та же.
 */
export const sampleProfile = (profile: readonly number[], p: number): number => {
  if (profile.length === 0) return 0;
  if (profile.length === 1) return profile[0];
  const x = clamp01(p) * (profile.length - 1);
  const i = Math.min(profile.length - 2, Math.floor(x));
  return profile[i] + (profile[i + 1] - profile[i]) * (x - i);
};

/**
 * remapSpeed (#038, ROOK): позиция в исходнике (кадры, дробная — для межкадрового смешивания) для кадра i
 * плана из n кадров при длине исходника L кадров. Последние slowFrames кадров плана идут со скоростью slow,
 * остальное — равномерно так, чтобы план кончился ровно на последнем кадре исходника.
 * Если быстрого участка < 3 кадров (короткие планы в 1 долю) — весь план в замедлении, без рывка.
 */
export function remapSpeed(i: number, n: number, L: number, slowFrames: number, slow: number): number {
  const last = L - 1;
  const fastN = n - 1 - slowFrames;
  if (fastN < 3) return Math.max(0, last - slow * (n - 1 - i));
  const v = Math.max(0, (last - slow * slowFrames) / fastN);
  return i <= fastN ? v * i : v * fastN + slow * (i - fastN);
}

// ---------------------------------------------------------------- смаз-склейка (#043)
export type WhipProfile = { dur: number; px: readonly number[]; dark?: readonly number[] };
export type WhipPreset = { in: WhipProfile; out: WhipProfile; outCard: WhipProfile; shift: number };
/** Склейки пункта: направление смаза на входе/выходе (±1, 0 — без смаза); выход из карточки длиннее и с затемнением. */
export type Cuts = { inDir: number; outDir: number; outIsCard: boolean };
export type Smear = { px: number; dir: number; dark: number };

/** Смаз на времени t (с) пункта длиной dur (с): ширина размыва px, направление ±1, затемнение 0..1. */
export function whipSmear(t: number, dur: number, cuts: Cuts, fps: number, P: WhipPreset): Smear {
  const k = frameOf(t, fps);
  const n = Math.round(dur * fps);
  const frames = (pr: WhipProfile) => Math.max(1, Math.round(pr.dur * fps));
  const at = (arr: readonly number[], j: number, nf: number) => sampleProfile(arr, nf > 1 ? j / (nf - 1) : 0);
  let px = 0;
  let dir = 0;
  let dark = 0;
  if (cuts.inDir) {
    const nf = frames(P.in);
    if (k >= 0 && k < nf) {
      px = at(P.in.px, k, nf);
      dir = cuts.inDir;
    }
  }
  if (cuts.outDir) {
    const pr = cuts.outIsCard ? P.outCard : P.out;
    const nf = frames(pr);
    const j = k - (n - nf);
    if (j >= 0 && j < nf) {
      px = at(pr.px, j, nf);
      dir = cuts.outDir;
      if (pr.dark) dark = at(pr.dark, j, nf);
    }
  }
  return { px, dir, dark };
}

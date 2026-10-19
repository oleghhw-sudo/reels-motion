// src/fx/hit.ts — анатомия удара как чистые функции времени (cinematic-fx §2): подвод (leadIn), удар и отдача (hitEnvelope),
// тряска по seed (#024). Всё детерминировано: случайность — только rand(seed) из src/motion/tokens.ts (гейт 1).
import { seg } from '../motion/index.ts';
import { rand } from '../motion/tokens.ts';
import { decayAt, frameOf, sampleProfile } from './core.ts';
import { HIT, LEAD, type HitPreset, type LeadPreset, type Shake } from './presets.ts';

/**
 * Тряска через t секунд после удара: амплитуда amp·exp(−(t−from)/τ), направление — rand(`seed:кадр:x|y`);
 * до старта и после maxDur — 0. Кадр — от fps вызывающего, поэтому при 24 fps совпадает с прототипом покадрово.
 */
export function shakeAt(t: number, fps: number, s: Shake | null, seed: string): [number, number] {
  if (!s) return [0, 0];
  const tt = t - s.from;
  const k = frameOf(tt, fps);
  if (k < 0 || tt > s.maxDur + 1e-6) return [0, 0];
  const a = s.amp * decayAt(Math.max(0, tt), s.tau);
  return [(rand(`${seed}:${k}:x`) * 2 - 1) * a, (rand(`${seed}:${k}:y`) * 2 - 1) * a];
}

export type HitPhase = 'before' | 'flash' | 'impact' | 'recoil';
export type HitEnv = {
  /** Кадр от удара (0 — кадр удара) и время, с. */
  k: number;
  t: number;
  phase: HitPhase;
  /** Белая вспышка 0..1 (только в фазе flash). */
  flash: number;
  /** Impact-кадр: первая половина — сигнальный красный, иначе цвет героя. */
  impactFirst: boolean;
  /** Суммарная тряска кадра, px. */
  shake: [number, number];
  /** Хроматика, px. */
  ca: number;
  /** Раскрытие нового фона 0..1 (1, если у пресета нет раскрытия). */
  reveal: number;
  /** Масштаб zoom-punch (S). */
  zoom: number;
};

const NONE: HitEnv = { k: -1, t: -1, phase: 'before', flash: 0, impactFirst: false, shake: [0, 0], ca: 0, reveal: 0, zoom: 1 };

/** Состояние удара через t секунд после кадра удара (t < 0 — удара ещё не было). Фазы — по центру кадра (k + 0.5)/fps. */
export function hitEnvelope(t: number, fps: number, P: HitPreset = HIT.L, seed = 'hit'): HitEnv {
  const k = frameOf(t, fps);
  if (k < 0) return { ...NONE, k, t };
  const tc = (k + 0.5) / fps;
  const phase: HitPhase = tc < P.flashDur ? 'flash' : tc < P.flashDur + P.impactDur ? 'impact' : 'recoil';
  const impactFirst = phase === 'impact' && tc - P.flashDur < P.impactDur / 2;
  let shake: [number, number] = [0, 0];
  if (phase === 'impact') shake = shakeAt(t, fps, P.impactShake, `${seed}:impact`);
  else if (phase === 'recoil') {
    const a = shakeAt(t, fps, P.shake, `${seed}:a`);
    const b = shakeAt(t, fps, P.land, `${seed}:b`);
    shake = [a[0] + b[0], a[1] + b[1]];
  }
  const ca = phase === 'recoil' && P.ca ? P.ca.px * decayAt(Math.max(0, t - P.ca.from), P.ca.tau) : 0;
  const reveal = P.reveal ? P.reveal.ease(seg(t, P.reveal.from, P.reveal.from + P.reveal.dur)) : 1;
  const zoom = P.punch ? 1 + P.punch.amount * (tc < P.punch.hold ? 1 : 1 - P.punch.ease(seg(t, P.punch.hold, P.punch.hold + P.punch.dur))) : 1;
  return { k, t, phase, flash: phase === 'flash' ? P.flash : 0, impactFirst, shake, ca, reveal, zoom };
}

export type Lead = { zoom: number; saturate: number; contrast: number; ca: number };

/** Подвод по прогрессу p ∈ [0, 1] (0 — начало плана, 1 — последний кадр перед ударом): наезд, цвет, хроматика. */
export function leadIn(p: number, P: LeadPreset = LEAD): Lead {
  const q = P.ease(p < 0 ? 0 : p > 1 ? 1 : p);
  return { zoom: 1 + P.zoom * q, saturate: 1 - P.desat * q, contrast: P.contrast[0] + P.contrast[1] * q, ca: P.ca * q };
}

/** Засветка в белое за tToHit секунд до удара: отсчёты пресета по кадрам, последний — кадр перед ударом; иначе 0. */
export function leadFlash(tToHit: number, fps: number, P: LeadPreset = LEAD): number {
  const framesToHit = frameOf(tToHit, fps);
  const nf = Math.max(1, Math.round(P.flash.dur * fps));
  if (framesToHit < 1 || framesToHit > nf) return 0;
  return sampleProfile(P.flash.a, nf > 1 ? (nf - framesToHit) / (nf - 1) : 1);
}

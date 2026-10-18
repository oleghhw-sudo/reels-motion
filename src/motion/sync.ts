// Ported from Leonxlnx/cinetic @ecfa6605 · MIT (c) 2026 Leonxlnx — skills/cinetic/assets/remotion-starter/src/lib/sync.ts (peak, delayTo, hit, settleOf)
// Ported from Rieranthony/product-film-skill @fe11efc4 · MIT (c) 2026 Rieranthony — plugins/product-film/skills/product-film/templates/kit/time.ts (Grid, at)
// Точки синхронизации считаются из кривых самой картинки, не вписываются руками: куда ставить свист (пик скорости),
// щелчок (касание пружины), звук посадки (0.97 пути). Сетка тактов — из измеренного beats.json (скилл beat-sync).
// Изменения при переносе:
//   - времена — секунды; peak возвращает секунды без округления;
//   - delayTo/hit/settleOf идут по кадровой сетке fps (параметр) и возвращают секунды кадра; delayTo считает по замкнутой
//     пружине step() (./spring.ts), а не по численной spring() Remotion — расхождение с источником ≤ 1 кадра (тест);
//   - gridFromBeats принимает и формат beat-sync ({bpm, firstDownbeat, beatsPerBar}), и product-film ({bpm, firstBeat, pickupBeats, beatsPerBar}).
// Тексты лицензий — THIRD-PARTY-LICENSES.md.
import { step, type SpringConfig } from './spring.ts';
import type { Ease } from './tokens.ts';

const STEPS = 400;

/** Момент пиковой скорости движения от a до b (с) на кривой ease — сюда ставится вершина свиста. */
export const peak = (a: number, b: number, ease: Ease): number => {
  let best = a;
  let bestV = -Infinity;
  for (let i = 0; i < STEPS; i++) {
    const t = i / STEPS;
    const v = Math.abs(ease(Math.min(1, t + 1 / STEPS)) - ease(t));
    if (v > bestV) {
      bestV = v;
      best = a + (t + 0.5 / STEPS) * (b - a);
    }
  }
  return best;
};

/** Секунды (по кадрам fps) от старта пружины до первого достижения доли thr пути (0.5 — «поп», 1 — касание). */
export const delayTo = (cfg: SpringConfig, thr = 1, fps = 60): number => {
  // допуск 5e-4: передемпфированная пружина подходит к 1, не достигая её точно
  for (let f = 0; f < fps * 4; f++) if (step(f / fps, cfg) >= thr - 5e-4) return f / fps;
  throw new Error(`delayTo: пружина не достигла ${thr} за 4 с (${JSON.stringify(cfg)})`);
};

/** Абсолютное время (с), когда пружина, отпущенная в start, впервые достигает thr (1 — касание для ударов). */
export const hit = (start: number, cfg: SpringConfig, thr = 1, fps = 60): number => start + delayTo(cfg, thr, fps);

/** Первый кадр (в секундах) движения от a до b на ease, где пройдено thr пути (0.97 — место звука посадки). */
export const settleOf = (a: number, b: number, ease: Ease, thr = 0.97, fps = 60): number => {
  const fa = a * fps;
  const fb = b * fps;
  for (let f = Math.ceil(fa - 1e-9); f < fb; f++) if (ease((f - fa) / (fb - fa)) >= thr) return f / fps;
  return Math.ceil(fb - 1e-9) / fps;
};

/** Измеренная сетка долей. Такт 1 открывается первой сильной долей; такт 0 — затакт (pickupBeats долей). */
export type Grid = { bpm: number; firstBeat: number; pickupBeats: number; beatsPerBar: number };

export const beatLength = (grid: Grid): number => 60 / grid.bpm;

/** Секунды на такте bar и доле beat (с 1). fraction — доля одной доли: 0.5 — «и». */
export function at(grid: Grid, bar: number, beat = 1, fraction = 0): number {
  const index = grid.pickupBeats + (bar - 1) * grid.beatsPerBar + (beat - 1) + fraction;
  return grid.firstBeat + index * beatLength(grid);
}

const num = (o: Record<string, unknown>, k: string): number => {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`beats.json: поле ${k} должно быть числом (есть: ${JSON.stringify(v)})`);
  return v;
};

/**
 * Сетка из содержимого beats.json (объект уже прочитан вызывающим — путь к данным в библиотеке не зашит, гейт 2).
 * beat-sync: {bpm, firstDownbeat, beatsPerBar} → pickupBeats = 0; product-film: {bpm, firstBeat, pickupBeats, beatsPerBar}.
 */
export function gridFromBeats(json: unknown): Grid {
  if (!json || typeof json !== 'object') throw new Error('beats.json: ожидался объект');
  const o = json as Record<string, unknown>;
  const bpm = num(o, 'bpm');
  const beatsPerBar = num(o, 'beatsPerBar');
  if (bpm <= 0 || beatsPerBar < 1) throw new Error(`beats.json: bpm=${bpm}, beatsPerBar=${beatsPerBar} — вне диапазона`);
  if ('firstDownbeat' in o) return { bpm, firstBeat: num(o, 'firstDownbeat'), pickupBeats: 0, beatsPerBar };
  return { bpm, firstBeat: num(o, 'firstBeat'), pickupBeats: num(o, 'pickupBeats'), beatsPerBar };
}

/** Сокращение для сцен: const B = b(grid); B(3, 2, 0.5) — секунды на «и» второй доли третьего такта. */
export const b = (grid: Grid) => (bar: number, beat = 1, fraction = 0): number => at(grid, bar, beat, fraction);

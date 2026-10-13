// Библиотека движения: чистые функции от времени/кадра. Без импортов, без состояния, без Math.random —
// один вход → один выход (гейт 1: всё в кадре — функция кадра). Тесты: npm run test:motion.
//
// Порт функций из ClaudeAnimationBase (src/core.js, коммит 0ac8bf2): spring/ring, take, jump, pulse/beatN,
// shakeXY, onTwos, arcPt, through (Catmull-Rom), ribbon. Изменения при переносе:
//   - время в секундах t = frame / fps (в оригинале глобальное T при 24 fps), BPM/offset — параметры, не глобалы;
//   - ring принимает время С МОМЕНТА события; для нескольких событий — ringEvents;
//   - shakeXY считается от номера кадра и seed (в оригинале — от floor(t·24));
//   - onTwos отдаёт номер удерживаемого кадра (в оригинале — время).
//
// ---------------------------------------------------------------------------------------------------------
// MIT License
//
// Copyright (c) 2026 John Heibel
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// ---------------------------------------------------------------------------------------------------------

export type Pt = readonly [number, number];

// ---------------------------------------------------------------- базовые
export const clamp = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;
/** Прогресс 0..1 времени t через отрезок [a, b]. */
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
export const frac = (x: number): number => x - Math.floor(x);
/** Секунды из номера кадра. */
export const sec = (frame: number, fps: number): number => frame / fps;
/** smoothstep — «ease» оригинала (вход jump/take). */
export const smooth = (x: number): number => {
  const c = clamp(x);
  return c * c * (3 - 2 * c);
};
/**
 * Детерминированный псевдослучай 0..1 от числа (оригинал: sin-хэш).
 * Math.sin в V8 одинаков в node и Chromium рендера; между движками может отличаться в последних битах.
 */
export const hash = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---------------------------------------------------------------- пружина / пинок
/**
 * Затухающая пружина после события: 0 до события, затем exp(-k·Δt)·sin(w·Δt).
 * tSinceEvent — секунды с момента события (отрицательное = событие ещё не наступило).
 * k — затухание (1/с), w — частота качания (рад/с).
 */
export const ring = (tSinceEvent: number, k = 6, w = 18): number =>
  tSinceEvent < 0 ? 0 : Math.exp(-k * tSinceEvent) * Math.sin(w * tSinceEvent);

/** Сумма пинков от нескольких событий (времена событий в секундах). */
export const ringEvents = (t: number, eventsSec: readonly number[], k = 6, w = 18): number =>
  eventsSec.reduce((s, e) => s + ring(t - e, k, w), 0);

/** «Пинок» масштаба: 1 + amp·ring — для появления цифры/кнопки на событии. */
export const kick = (tSinceEvent: number, amp = 0.08, k = 6, w = 18): number => 1 + amp * ring(tSinceEvent, k, w);

export type Squash = { sq: number; dy: number };

/**
 * «Take» — реакция-удивление с пиком в t0: короткий присед (0.1 с до пика), затем вытягивание вверх, которое
 * пружинит обратно. sq > 0 — сплющивание, sq < 0 — вытягивание (доли масштаба); dy — смещение вверх в единицах amt.
 */
export const take = (t: number, t0: number, amt = 1): Squash => {
  if (t < t0 - 0.1) return { sq: 0, dy: 0 };
  if (t < t0) return { sq: 0.12 * amt * smooth(seg(t, t0 - 0.1, t0)), dy: 0 };
  const a = t - t0;
  return { sq: -0.26 * amt * Math.exp(-6 * a) * Math.cos(16 * a), dy: -1.2 * amt * Math.exp(-7 * a) * Math.max(0, Math.cos(9 * a)) };
};

/**
 * Прыжок: отрыв в t0, приземление в t1, высота h (в своих единицах, напр. px).
 * Присед за 0.12 с до отрыва (антиципация), вытягивание при отрыве, парабола, сплющивание при
 * посадке .22·e^(-8a)·cos(20a) и возврат. dy ≤ 0 (вверх), dy = 0 до отрыва и с момента приземления.
 */
export const jump = (t: number, t0: number, t1: number, h = 1): Squash => {
  if (t < t0 - 0.12) return { dy: 0, sq: 0 };
  if (t < t0) return { dy: 0, sq: 0.18 * smooth(seg(t, t0 - 0.12, t0)) };
  if (t < t1) {
    const k = (t - t0) / (t1 - t0);
    return { dy: -h * 4 * k * (1 - k), sq: -0.16 * Math.abs(1 - 2 * k) };
  }
  const a = t - t1;
  return { dy: 0, sq: 0.22 * Math.exp(-8 * a) * Math.cos(20 * a) };
};

/** Сплющивание → масштаб: sq > 0 шире и ниже, объём сохраняется. */
export const squashScale = (sq: number): { sx: number; sy: number } => ({ sx: 1 + sq, sy: 1 / (1 + sq) });

// ---------------------------------------------------------------- доли
export type BeatGrid = { bpm: number; offsetSec: number };
/** Сетка из длительности доли (как beatSec в scenes.yaml ролика) и первой доли. */
export const gridFromBeat = (beatSec: number, offsetSec = 0): BeatGrid => ({ bpm: 60 / beatSec, offsetSec });
/** Позиция в долях (дробная). */
export const beatPos = (t: number, g: BeatGrid): number => ((t - g.offsetSec) * g.bpm) / 60;
/** Номер текущей доли (целый; до первой доли — отрицательный). */
export const beatN = (t: number, g: BeatGrid): number => Math.floor(beatPos(t, g));
/** Пульс: 1 ровно на доле, затухает exp(-frac·k) до следующей. subdiv=2 — на восьмых. */
export const pulse = (t: number, g: BeatGrid, k = 6, subdiv = 1): number => Math.exp(-frac(beatPos(t, g) * subdiv) * k);

// ---------------------------------------------------------------- тряска / «на двойках»
/**
 * Детерминированная тряска: смещение [x, y] в пределах ±amp от номера кадра и seed.
 * Меняется каждый кадр; тот же (frame, seed) → то же значение. Для медленной тряски — передайте onTwos(frame, fps).
 */
export const shakeXY = (frame: number, seed: number, amp: number): [number, number] => [
  (hash(frame * 1.7 + seed * 101.3) - 0.5) * 2 * amp,
  (hash(frame * 2.3 + 9 + seed * 57.9) - 0.5) * 2 * amp,
];

/**
 * «На двойках»: номер кадра, который держится вместо текущего, при drawingsPerSec рисунках в секунду
 * (оригинал: 12/с — классические «двойки» при 24 fps). На 30 fps 12/с дают чередование удержаний 3-2-3-2;
 * для строгих двоек на 30 fps передайте drawingsPerSec = 15.
 */
export const onTwos = (frame: number, fps: number, drawingsPerSec = 12): number => {
  const drawing = Math.floor((frame / fps) * drawingsPerSec + 1e-6);
  return Math.ceil((drawing * fps) / drawingsPerSec - 1e-6);
};

// ---------------------------------------------------------------- траектории
/** Точка на дуге броска из p0 в p1 с подъёмом h над прямой; k = 0..1 вдоль полёта. */
export const arcPt = (p0: Pt, p1: Pt, h: number, k: number): [number, number] => [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k) - h * 4 * k * (1 - k)];

/** Гладкая кривая через точки (Catmull-Rom), n отсчётов на пролёт. */
export const through = (P: readonly Pt[], n = 6): [number, number][] => {
  if (P.length < 3) return P.map((p) => [p[0], p[1]]);
  const out: [number, number][] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const u2 = u * u;
      const u3 = u2 * u;
      const c = (d: 0 | 1) =>
        0.5 * (2 * p1[d] + (p2[d] - p0[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * u3);
      out.push([c(0), c(1)]);
    }
  }
  const last = P[P.length - 1];
  out.push([last[0], last[1]]);
  return out;
};

/** Сужающаяся лента вокруг пути (ширина w0 в начале, w1 в конце) — замкнутый контур из точек. */
export const ribbon = (P: readonly Pt[], w0: number, w1 = w0, n = 6): [number, number][] => {
  const C = through(P, n);
  const m = C.length;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i < m; i++) {
    const a = C[Math.max(0, i - 1)];
    const b = C[Math.min(m - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    const w = lerp(w0, w1, i / Math.max(1, m - 1)) / 2;
    L.push([C[i][0] - (dy / d) * w, C[i][1] + (dx / d) * w]);
    R.push([C[i][0] + (dy / d) * w, C[i][1] - (dx / d) * w]);
  }
  return L.concat(R.reverse());
};

/** Точки → атрибут d для SVG path. */
export const svgPath = (pts: readonly Pt[], closed = false): string =>
  pts.length ? `M${pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L')}${closed ? 'Z' : ''}` : '';

/** Префикс пути длиной k (0..1) по числу отрезков — для «прорисовки» связки. */
export const pathUpTo = (pts: readonly Pt[], k: number): [number, number][] => {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]]);
  const x = clamp(k) * (pts.length - 1);
  const i = Math.floor(x);
  const out: [number, number][] = pts.slice(0, i + 1).map((p) => [p[0], p[1]]);
  if (i < pts.length - 1) {
    const f = x - i;
    out.push([lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]);
  }
  return out;
};

// ---------------------------------------------------------------- easing по t80
// Идея из onetake (PolyForm NC): выбирать кривую по t80 — доле длительности, за которую пройдено 80% пути.
// Код onetake НЕ использован; формулы стандартные (Penner / Perlin smootherstep), вход x ∈ [0, 1].
export const expoOut = (x: number): number => {
  const c = clamp(x);
  return c >= 1 ? 1 : 1 - Math.pow(2, -10 * c);
};
export const quintOut = (x: number): number => 1 - Math.pow(1 - clamp(x), 5);
export const cubicOut = (x: number): number => 1 - Math.pow(1 - clamp(x), 3);
/** smootherstep Перлина 6x⁵ − 15x⁴ + 10x³. */
export const smoother = (x: number): number => {
  const c = clamp(x);
  return c * c * c * (c * (c * 6 - 15) + 10);
};

/** t80 каждой кривой (округлено до сотых; проверяется в motion.test.ts по самим формулам). */
export const T80 = { expoOut: 0.23, quintOut: 0.28, cubicOut: 0.42, smoother: 0.67 } as const;
export const EASINGS = { expoOut, quintOut, cubicOut, smoother } as const;

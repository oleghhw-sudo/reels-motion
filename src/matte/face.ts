// src/matte/face.ts — чтение face.json (tools/matte/matte.mjs, задача 025) и положение лица в момент t.
// Без remotion: чистые функции, тест — matte.test.ts (npm run test:matte).
export type FaceSource = 'vision' | 'silhouette' | 'hold' | 'none';
export type FaceFrame = { t: number; cx: number; cy: number; w: number; source: FaceSource };
export type FaceTrack = { fps: number; from: number; frames: FaceFrame[] };

const SOURCES: FaceSource[] = ['vision', 'silhouette', 'hold', 'none'];
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Проверяет форму face.json и возвращает дорожку с кадрами, отсортированными по t (секунды от начала отрезка). */
export const loadFace = (json: unknown): FaceTrack => {
  if (!json || typeof json !== 'object') throw new Error('face.json: не объект');
  const j = json as Record<string, unknown>;
  if (!num(j.fps) || j.fps <= 0) throw new Error('face.json: нет fps');
  if (!Array.isArray(j.frames)) throw new Error('face.json: нет frames[]');
  const frames = j.frames.map((f, i) => {
    const r = f as Record<string, unknown>;
    if (!num(r.t) || !num(r.cx) || !num(r.cy) || !num(r.w)) throw new Error(`face.json: кадр ${i}: нужны числа t, cx, cy, w`);
    if (!SOURCES.includes(r.source as FaceSource)) throw new Error(`face.json: кадр ${i}: source «${String(r.source)}» не из ${SOURCES.join('|')}`);
    return { t: r.t, cx: r.cx, cy: r.cy, w: r.w, source: r.source as FaceSource };
  });
  frames.sort((a, b) => a.t - b.t);
  return { fps: j.fps, from: num(j.from) ? j.from : 0, frames };
};

/** Лицо в момент t (секунды от начала отрезка): линейная интерполяция cx/cy/w между соседними кадрами,
 *  за пределами дорожки — крайний кадр; source — ближайшего по времени кадра. Пустая дорожка → none, w 0. */
export const faceAt = (track: FaceTrack, t: number): FaceFrame => {
  const f = track.frames;
  if (f.length === 0) return { t, cx: 540, cy: 960, w: 0, source: 'none' };
  if (t <= f[0].t) return { ...f[0], t };
  if (t >= f[f.length - 1].t) return { ...f[f.length - 1], t };
  let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (f[mid].t <= t) lo = mid; else hi = mid; }
  const a = f[lo], b = f[hi];
  const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { t, cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, w: a.w + (b.w - a.w) * u, source: u < 0.5 ? a.source : b.source };
};

/** Длина дорожки в секундах (последний кадр + один шаг fps). */
export const faceDuration = (track: FaceTrack): number => (track.frames.length ? track.frames[track.frames.length - 1].t + 1 / track.fps : 0);

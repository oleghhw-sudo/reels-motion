// src/matte/face.ts — чтение face.json (tools/matte/matte.mjs, задача 025) и положение лица в момент t.
// Без remotion: чистые функции, тест — matte.test.ts (npm run test:matte).
export type FaceSource = 'vision' | 'silhouette' | 'hold' | 'none';
/** Кадр лица; при source none человека в кадре нет — cx/cy/w null. */
export type FaceFrame = { t: number; cx: number | null; cy: number | null; w: number | null; source: FaceSource };
/** Лицо, которое есть: числа гарантированы. */
export type Face = { t: number; cx: number; cy: number; w: number; source: Exclude<FaceSource, 'none'> };
export type FaceTrack = { fps: number; from: number; frames: FaceFrame[] };

const SOURCES: FaceSource[] = ['vision', 'silhouette', 'hold', 'none'];
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Проверяет форму face.json и возвращает дорожку с кадрами, отсортированными по t (секунды от начала отрезка). */
export const loadFace = (json: unknown): FaceTrack => {
  if (!json || typeof json !== 'object') throw new Error('face.json: не объект');
  const j = json as Record<string, unknown>;
  if (!num(j.fps) || j.fps <= 0) throw new Error('face.json: нет fps');
  if (!Array.isArray(j.frames)) throw new Error('face.json: нет frames[]');
  const frames: FaceFrame[] = j.frames.map((f, i) => {
    const r = f as Record<string, unknown>;
    if (!num(r.t)) throw new Error(`face.json: кадр ${i}: нужно число t`);
    if (!SOURCES.includes(r.source as FaceSource)) throw new Error(`face.json: кадр ${i}: source «${String(r.source)}» не из ${SOURCES.join('|')}`);
    if (r.source === 'none') return { t: r.t, cx: null, cy: null, w: null, source: 'none' };
    if (!num(r.cx) || !num(r.cy) || !num(r.w)) throw new Error(`face.json: кадр ${i}: при source ${String(r.source)} нужны числа cx, cy, w`);
    return { t: r.t, cx: r.cx, cy: r.cy, w: r.w, source: r.source as FaceSource };
  });
  frames.sort((a, b) => a.t - b.t);
  return { fps: j.fps, from: num(j.from) ? j.from : 0, frames };
};

const asFace = (f: FaceFrame, t: number): Face | null => (f.source === 'none' || f.cx === null || f.cy === null || f.w === null ? null : { t, cx: f.cx, cy: f.cy, w: f.w, source: f.source });

/** Лицо в момент t (секунды от начала отрезка): линейная интерполяция cx/cy/w между соседними кадрами,
 *  за пределами дорожки — крайний кадр; source — ближайшего по времени кадра. Ближайший кадр none (человека нет)
 *  или пустая дорожка → null; если none только один из соседей — берётся другой без интерполяции. */
export const faceAt = (track: FaceTrack, t: number): Face | null => {
  const f = track.frames;
  if (f.length === 0) return null;
  if (t <= f[0].t) return asFace(f[0], t);
  if (t >= f[f.length - 1].t) return asFace(f[f.length - 1], t);
  let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (f[mid].t <= t) lo = mid; else hi = mid; }
  const a = f[lo], b = f[hi];
  const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const near = u < 0.5 ? a : b;
  if (near.source === 'none') return null;
  const fa = asFace(a, t), fb = asFace(b, t);
  if (!fa || !fb) return fa ?? fb;
  return { t, cx: fa.cx + (fb.cx - fa.cx) * u, cy: fa.cy + (fb.cy - fa.cy) * u, w: fa.w + (fb.w - fa.w) * u, source: near.source as Face['source'] };
};

/** Длина дорожки в секундах (последний кадр + один шаг fps). */
export const faceDuration = (track: FaceTrack): number => (track.frames.length ? track.frames[track.frames.length - 1].t + 1 / track.fps : 0);

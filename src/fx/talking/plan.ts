// src/fx/talking/plan.ts — план эффектов говорящей головы (videos/<id>/talking-fx.yaml): схема с громким отказом (гейт 3).
// Данные говорят ЧТО (эффект, окно t0/t1 в секундах исходника, текст, подсказки звука), код знает КАК (effects.ts, components.tsx).
// Числа окон и лимитов — cinematic-fx §3 O. Звук здесь — только данные-подсказки (время от t0, тип, уровень dB к голосу), рендер их не читает.
import { z } from 'zod';
import { faceAt, type FaceTrack } from '../../matte/face.ts';
import { BACK } from './window.ts';

/** Длины окон по §3 O (секунды): bignum 1–5, figma 1.4–2.0, lens 0.9–1.4. */
export const FX_WINDOW = {
  bignum: { min: 1, max: 5 },
  figma: { min: 1.4, max: 2 },
  lens: { min: 0.9, max: 1.4 },
} as const;
export const FIGMA_WORD_MAX = 10; // букв в слове (ширина блока ≤ 820 px при 1–2 курсивных)
export const FIGMA_UNDER_MAX = 24; // символов в строке мелких слов под рамкой

const sound = z.object({ at: z.number().min(0), type: z.string().min(1), levelDb: z.number().max(0) });
const base = { t0: z.number().min(0), t1: z.number().min(0), back: z.number().min(BACK.min).max(BACK.max).optional(), sound: z.array(sound).default([]) };
export const bignumSchema = z.object({ fx: z.literal('bignum'), ...base, text: z.string().regex(/^\d{1,2}$/, 'цифра: 1–2 знака'), y: z.number().default(760) });
export const figmaSchema = z.object({
  fx: z.literal('figma'), ...base,
  word: z.string().min(1).max(FIGMA_WORD_MAX, `слово ≤ ${FIGMA_WORD_MAX} букв`),
  italic: z.string().min(1).max(2, 'курсивом 1–2 буквы'),
  badge: z.string().min(1).max(12),
  under: z.array(z.object({ at: z.number().min(0), text: z.string().min(1).max(FIGMA_UNDER_MAX) })).default([]),
  y: z.number().default(1352),
});
export const lensSchema = z.object({
  fx: z.literal('lens'), ...base,
  from: z.tuple([z.number(), z.number()]).default([250, 1290]),
  to: z.tuple([z.number(), z.number()]).default([830, 1290]),
  r: z.number().default(140),
  mag: z.number().default(1.9),
});
export const effectSchema = z.discriminatedUnion('fx', [bignumSchema, figmaSchema, lensSchema]);
export const planSchema = z.object({
  matteId: z.string().min(1),
  video: z.object({ file: z.string().min(1) }),
  effects: z.array(effectSchema),
});
export type Effect = z.infer<typeof effectSchema>;
export type BignumFx = z.infer<typeof bignumSchema>;
export type FigmaFx = z.infer<typeof figmaSchema>;
export type LensFx = z.infer<typeof lensSchema>;
export type Plan = z.infer<typeof planSchema>;

const fmt = (e: Effect) => `${e.fx} ${e.t0}–${e.t1} с`;

/** Разбор + проверки: длина окна в пределах §3 O, окна не пересекаются (по t0), курсивные буквы есть в слове. */
export const parsePlan = (raw: unknown): Plan => {
  const r = planSchema.safeParse(raw);
  if (!r.success) throw new Error(`talking-fx.yaml: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const plan = r.data;
  const errors: string[] = [];
  const sorted = [...plan.effects].sort((a, b) => a.t0 - b.t0);
  for (const e of sorted) {
    const d = e.t1 - e.t0;
    const lim = FX_WINDOW[e.fx];
    if (!(d > 0)) errors.push(`${fmt(e)}: окно пустое`);
    else if (d < lim.min || d > lim.max) errors.push(`${fmt(e)}: окно ${d.toFixed(2)} с вне ${lim.min}–${lim.max} с (§3 O)`);
    if (e.fx === 'figma' && !e.word.includes(e.italic)) errors.push(`${fmt(e)}: курсивных букв «${e.italic}» нет в слове «${e.word}»`);
    if (e.fx === 'figma') for (const u of e.under) if (u.at >= d) errors.push(`${fmt(e)}: мелкое слово «${u.text}» на ${u.at} с — за концом окна`);
    for (const s of e.sound) if (s.at > d) errors.push(`${fmt(e)}: звук «${s.type}» на +${s.at} с — за концом окна`);
  }
  for (let i = 1; i < sorted.length; i++) if (sorted[i].t0 < sorted[i - 1].t1) errors.push(`окна пересекаются: ${fmt(sorted[i - 1])} и ${fmt(sorted[i])}`);
  if (errors.length) throw new Error(`talking-fx.yaml: ${errors.join('; ')}`);
  return { ...plan, effects: sorted };
};

/** Прямоугольник в кадре 1080×1920. */
export type Rect = { x: number; y: number; w: number; h: number };
export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Рамка лица из face.json (cx, cy — центр, w — ширина, высота 1.25·w). */
export const faceRect = (f: { cx: number; cy: number; w: number }): Rect => ({ x: f.cx - f.w / 2, y: f.cy - f.w * 0.625, w: f.w, h: f.w * 1.25 });

/** Проверка плана против дорожки лица: bignum требует лицо на каждом кадре окна (за человеком без человека не бывает);
 *  для figma/lens — графика не на лице: по кадрам окна считается, сколько раз прямоугольник графики пересёк рамку лица.
 *  overlaps > 0 → отказ. Возвращает числа для отчёта. */
export const checkFace = (plan: Plan, face: FaceTrack, fps: number, boxOf: (e: Effect, t: number) => Rect | null): { fx: string; frames: number; noFace: number; overlaps: number; minGap: number }[] => {
  const out = [];
  const errors: string[] = [];
  for (const e of plan.effects) {
    let frames = 0, noFace = 0, overlaps = 0, minGap = Infinity;
    for (let t = e.t0; t < e.t1 - 1e-9; t += 1 / fps) {
      frames++;
      const f = faceAt(face, t);
      if (!f) { noFace++; continue; }
      const box = boxOf(e, t);
      if (!box) continue;
      const fr = faceRect(f);
      if (intersects(box, fr)) overlaps++;
      const gapY = box.y >= fr.y + fr.h ? box.y - (fr.y + fr.h) : fr.y >= box.y + box.h ? fr.y - (box.y + box.h) : 0;
      const gapX = box.x >= fr.x + fr.w ? box.x - (fr.x + fr.w) : fr.x >= box.x + box.w ? fr.x - (box.x + box.w) : 0;
      minGap = Math.min(minGap, Math.max(gapX, gapY));
    }
    if (e.fx === 'bignum' && noFace > 0) errors.push(`${fmt(e)}: лица нет на ${noFace} из ${frames} кадров — цифра «за головой» без головы не ставится`);
    if (e.fx !== 'bignum' && overlaps > 0) errors.push(`${fmt(e)}: графика на лице на ${overlaps} из ${frames} кадров`);
    out.push({ fx: fmt(e), frames, noFace, overlaps, minGap: Number.isFinite(minGap) ? Math.round(minGap) : -1 });
  }
  if (errors.length) throw new Error(`talking-fx.yaml: ${errors.join('; ')}`);
  return out;
};

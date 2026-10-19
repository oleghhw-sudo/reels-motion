// Аутро MIA: данные videos/mia-outro/outro.yaml (невосстановимое, только чтение) → таймлайн в кадрах и проверка запретных зон.
// Чистый модуль без React/remotion: его импортируют и композиция (script.ts), и консольная проверка (check-zones.mjs),
// поэтому сборка и проверка считают одно и то же.
import { z } from 'zod';
import { RAMP, remapSpeed } from '../../fx/core.ts';

// ---------------------------------------------------------------- схема outro.yaml (только поля, которые читает сборка)
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const on = z.union([z.literal('start'), z.string().regex(/^h\d+$/)]);
const src = z.string().regex(/^V\d+$/);
const inFx = z.enum(['whip']);
const live = z.object({ kind: z.literal('live'), src, from: z.number().int().min(0), to: z.number().int().min(0), on: on.optional(), beats: z.number().positive(), in: inFx.optional(), ramp: z.boolean().optional(), note: z.string().optional() });
const card = z.object({
  kind: z.literal('card'),
  hero: z.string(),
  cutout: z.string().regex(/^[A-Za-z0-9_]+_cut\.png$/), // из видео: HERO_V5_f24_cut.png; отдельная картинка: DARK_new2_cut.png
  title: z.string(),
  tagline: z.string(),
  bg: hex,
  tagColor: hex.optional(),
  side: z.enum(['left', 'right']),
  on: on.optional(),
  beats: z.number().positive(),
  note: z.string().optional(),
});
const lull = z.object({ kind: z.literal('lull'), src, from: z.number().int().min(0), on: on.optional(), beats: z.number().positive(), push: z.number().min(0).max(0.2), in: inFx.optional(), note: z.string().optional() });
const final = z.object({ kind: z.literal('final'), src, on: on.optional(), flash: z.boolean(), title: z.string(), line: z.string(), tail: z.string(), note: z.string().optional() });
const item = z.discriminatedUnion('kind', [live, card, lull, final]);
// sfx: внешние звуки (папка + список имён на выбор) и наш CC0-щелчок; путь папки — относительно SFX_EXTERNAL_DIR (env.manifest).
// v3 «звуковой бюджет» (задача 018): whip.on — на каких смаз-склейках свист («src:from» пункта с in: whip), riser.heroes —
// перед какими карточками нарастание, card — щелчок затвора (нет поля — не ставится). Нет on/heroes — как в v2: на всех.
// Ссылки проверяет sfxPlan() при разборе (parseOutro): не та ссылка → громкий отказ до работы с медиа.
const pick = z.object({ dir: z.string(), pick: z.array(z.string()).min(1), note: z.string().optional() });
const sfx = z.object({
  whip: pick.extend({ on: z.array(z.string().regex(/^V\d+:\d+$/, 'ожидалось «V3:228» (src:from пункта с in: whip)')).min(1).optional() }),
  riser: pick.extend({ heroes: z.array(z.string()).min(1).optional() }),
  impact: pick,
  slam: pick,
  card: z.string().optional(),
  final: pick,
  gainVsMusic: z.number().min(0).max(1),
  note: z.string().optional(),
});
const vertical = z.object({ crops: z.record(z.string(), z.enum(['A', 'B', 'C'])), cards: z.string().optional() });
const forbidden = z.object({ src, from: z.number().min(0), to: z.union([z.number(), z.literal('end')]), reason: z.string() });
export const outroSchema = z.object({
  music: z.object({ file: z.string(), from: z.number().min(0), to: z.number(), holdAfter: z.number().min(0).default(0), bpm: z.number().positive(), hits: z.array(z.number().min(0)).min(1), license: z.string() }),
  format: z.object({ landscape: z.object({ w: z.number(), h: z.number() }), portrait: z.object({ w: z.number(), h: z.number() }), fps: z.number().int().positive() }),
  names: z.record(z.string(), z.string()),
  card: z.object({
    cutouts: z.string(),
    concept: z.string(),
    outline: z.object({ white: z.number(), black: z.number(), shadow: z.tuple([z.number(), z.number()]) }),
    bg: z.object({ halftone: z.boolean(), rays: z.number().int().positive() }),
    font: z.object({ name: z.string(), tagline: z.string() }),
  }),
  episodes: z.record(z.string(), z.object({ timeline: z.array(item).min(1), sfx, vertical })),
  forbidden: z.array(forbidden),
});
export type Outro = z.infer<typeof outroSchema>;
export type Item = z.infer<typeof item>;

export function parseOutro(data: unknown): Outro {
  const r = outroSchema.safeParse(data);
  if (!r.success) throw new Error(`outro.yaml не по схеме:\n  ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`);
  const errors = Object.keys(r.data.episodes).flatMap((ep) => sfxPlan(r.data, ep).errors);
  if (errors.length) throw new Error(`outro.yaml: ссылки звука не сходятся с timeline (${errors.length}):\n  ✗ ${errors.join('\n  ✗ ')}`);
  return r.data;
}

// ---------------------------------------------------------------- звуковой бюджет (задача 018): где ставятся свист и нарастание
/** Ключ смаз-склейки для sfx.whip.on: «src:from» пункта timeline с in: whip. */
const whipKey = (it: Item): string | null => ('in' in it && it.in === 'whip' && 'src' in it && 'from' in it ? `${it.src}:${it.from}` : null);

/**
 * Какие пункты серии получают звук: whip — индексы timeline (= Placed.index) смаз-склеек со свистом, riser — герои карточек
 * с нарастанием. Нет sfx.whip.on / sfx.riser.heroes — все склейки in: whip / все карточки (как в v2).
 * errors: ссылка whip.on совпала не ровно с одним пунктом in: whip; повтор ссылки; герой riser.heroes не встречается среди карточек серии.
 */
export function sfxPlan(outro: Outro, episode: string): { whip: number[]; riser: string[]; errors: string[] } {
  const ep = outro.episodes[episode];
  const where = `${episode}.sfx`;
  const whips = ep.timeline.map((it, index) => ({ index, key: whipKey(it) })).filter((x): x is { index: number; key: string } => x.key !== null);
  const heroes = ep.timeline.flatMap((it) => (it.kind === 'card' ? [it.hero] : []));
  const errors: string[] = [];
  let whip = whips.map((x) => x.index);
  const on = ep.sfx.whip.on;
  if (on) {
    whip = [];
    on.forEach((ref, i) => {
      const m = whips.filter((x) => x.key === ref);
      if (on.indexOf(ref) !== i) errors.push(`${where}.whip.on[${i}] «${ref}»: повтор ссылки`);
      else if (m.length !== 1) errors.push(`${where}.whip.on[${i}] «${ref}»: ${m.length ? `совпало с ${m.length} пунктами` : 'нет пункта с in: whip'} — ссылка должна указывать ровно на один пункт timeline с in: whip (есть: ${whips.map((x) => x.key).join(', ')})`);
      else whip.push(m[0].index);
    });
  }
  let riser = [...heroes];
  const hs = ep.sfx.riser.heroes;
  if (hs) {
    riser = [];
    hs.forEach((h, i) => {
      if (hs.indexOf(h) !== i) errors.push(`${where}.riser.heroes[${i}] «${h}»: повтор`);
      else if (!heroes.includes(h)) errors.push(`${where}.riser.heroes[${i}] «${h}»: такого героя нет среди карточек серии (есть: ${heroes.join(', ')}; ключи names, не имена в кадре)`);
      else riser.push(h);
    });
  }
  return { whip: whip.sort((a, b) => a - b), riser, errors };
}

// ---------------------------------------------------------------- таймлайн
export type Placed = Item & {
  index: number;
  startSec: number;
  endSec: number;
  startFrame: number;
  endFrame: number; // исключительно
  /** Номер удара (1..), если пункт стоит на ударе. */
  hit: number | null;
  /** Кадры исходника, которые реально попадают в кадр (для проверки зон). Карточка — кадр вырезки. */
  srcFrames: { src: string; from: number; to: number } | null;
};
/** durationSec / durationInFrames — с holdAfter (тишина после обрыва трека); musicEndFrame — кадр конца музыки. */
export type Timeline = { fps: number; beat: number; durationSec: number; durationInFrames: number; musicSec: number; musicEndFrame: number; items: Placed[]; hits: number[] };

/** Допуск между «конец предыдущего по долям» и ударом `on` — 1 кадр. */
const frameTol = (fps: number) => 1 / fps + 1e-9;

export function buildTimeline(outro: Outro, episode: string): Timeline {
  const ep = outro.episodes[episode];
  if (!ep) throw new Error(`outro.yaml: серии «${episode}» нет. Есть: ${Object.keys(outro.episodes).join(', ')}`);
  const fps = outro.format.fps;
  const beat = 60 / outro.music.bpm;
  const hits = outro.music.hits;
  const musicSec = outro.music.to - outro.music.from;
  const durationSec = musicSec + outro.music.holdAfter;
  const placed: Placed[] = [];
  let prevEnd = 0;
  const lastFrameOf = new Map<string, number>(); // src → последний показанный кадр (для final без from)
  ep.timeline.forEach((it, index) => {
    let start: number;
    let hit: number | null = null;
    if (it.on === 'start') start = 0;
    else if (it.on) {
      hit = Number(it.on.slice(1));
      if (!(hit >= 1 && hit <= hits.length)) throw new Error(`outro.yaml ${episode}.timeline[${index}]: on: ${it.on} — ударов всего ${hits.length}`);
      start = hits[hit - 1];
      if (index > 0 && Math.abs(start - prevEnd) > frameTol(fps))
        throw new Error(`outro.yaml ${episode}.timeline[${index}] (${it.kind}): на ${it.on} = ${start.toFixed(3)} с, а предыдущий пункт по долям кончается в ${prevEnd.toFixed(3)} с — разрыв ${((start - prevEnd) * 1000).toFixed(0)} мс > 1 кадра`);
    } else start = prevEnd;
    const end = it.kind === 'final' ? musicSec : start + it.beats * beat;
    const startFrame = Math.round(start * fps);
    placed.push({ ...it, index, startSec: start, endSec: end, startFrame, endFrame: 0, hit, srcFrames: null } as Placed);
    prevEnd = end;
  });
  // конец пункта = начало следующего (без щелей); последний — до конца музыки
  const total = Math.round(durationSec * fps);
  const musicEndFrame = Math.round(musicSec * fps);
  placed.forEach((p, i) => {
    p.endFrame = i + 1 < placed.length ? placed[i + 1].startFrame : total;
    if (p.endFrame <= p.startFrame) throw new Error(`outro.yaml ${episode}.timeline[${i}]: пустой пункт (${p.startFrame}…${p.endFrame})`);
    const n = p.endFrame - p.startFrame;
    if (p.kind === 'live') {
      if (p.to < p.from) throw new Error(`outro.yaml ${episode}.timeline[${i}]: to < from`);
      p.srcFrames = { src: p.src, from: p.from, to: p.to }; // дольше исходника — держится кадр to
      lastFrameOf.set(p.src, p.to);
    } else if (p.kind === 'lull') {
      p.srcFrames = { src: p.src, from: p.from, to: p.from + n - 1 };
      lastFrameOf.set(p.src, p.from + n - 1);
    } else if (p.kind === 'final') {
      // продолжает тот же исходник после затишья; в holdAfter (после обрыва музыки) держится последний кадр
      const from = (lastFrameOf.get(p.src) ?? -1) + 1;
      p.srcFrames = { src: p.src, from, to: from + Math.max(1, musicEndFrame - p.startFrame) - 1 };
    } else {
      // вырезка из видео — её кадр проверяется по зонам; отдельная картинка (не из видео) — кадров исходника нет
      const m = p.cutout.match(/_(V\d+)_f(\d+)_cut\.png$/);
      p.srcFrames = m ? { src: m[1], from: Number(m[2]), to: Number(m[2]) } : null;
    }
  });
  return { fps, beat, durationSec, durationInFrames: total, musicSec, musicEndFrame, items: placed, hits };
}

// ---------------------------------------------------------------- запретные зоны
export type Zone = { src: string; from: number; to: number; reason: string; origin: string };

export function zonesFrom(outro: Outro, shotsExcluded: readonly Zone[], injected: readonly Zone[] = []): Zone[] {
  return [
    ...outro.forbidden.map((f) => ({ src: f.src, from: f.from, to: f.to === 'end' ? Infinity : f.to, reason: f.reason, origin: 'outro.yaml forbidden' })),
    ...shotsExcluded,
    ...injected,
  ];
}

/** Вырезка (фон удалён) допускается в зоне, где разрешён только кроп без лишнего персонажа. */
const cutoutAllowed = (z: Zone) => /только кроп/.test(z.reason);

export type ZoneReport = { errors: string[]; allowed: string[] };

/** Каждый показанный кадр исходника f (время f / fps) не должен попадать в [from, to) запретной зоны. */
export function checkZones(tl: Timeline, zones: readonly Zone[]): ZoneReport {
  const errors: string[] = [];
  const allowed: string[] = [];
  for (const p of tl.items) {
    if (!p.srcFrames) continue;
    const { src, from, to } = p.srcFrames;
    for (const z of zones.filter((x) => x.src === src)) {
      const bad: number[] = [];
      for (let f = from; f <= to; f++) {
        const t = f / tl.fps;
        if (t >= z.from - 1e-9 && t < z.to - 1e-9) bad.push(f);
      }
      if (!bad.length) continue;
      const what = `timeline[${p.index}] ${p.kind} ${src} f${from}–${to} (${(from / tl.fps).toFixed(3)}–${(to / tl.fps).toFixed(3)} с)`;
      const zone = `зона ${src} ${z.from}–${z.to === Infinity ? 'end' : z.to} с «${z.reason}» [${z.origin}]`;
      if (p.kind === 'card' && cutoutAllowed(z)) allowed.push(`${what}: вырезка без фона в ${zone} — допущено`);
      else errors.push(`${what} задевает ${zone}: кадры ${bad[0]}–${bad[bad.length - 1]} (${bad.length} шт.)`);
    }
  }
  return { errors, allowed };
}

export function assertZones(tl: Timeline, zones: readonly Zone[]): ZoneReport {
  const r = checkZones(tl, zones);
  if (r.errors.length) throw new Error(`ЗАПРЕТНЫЕ ЗОНЫ: ${r.errors.length} нарушени(е/я) — сборка остановлена:\n  ✗ ${r.errors.join('\n  ✗ ')}`);
  return r;
}

/** Планы shots.json с excluded: true → зоны. id «V10-03a» → исходник V10; allowed_crop → «только кроп». */
export type ShotRow = { id: string; start: number; end: number; excluded?: boolean; reason?: string; allowed_crop?: unknown };
export function zonesFromShots(shots: readonly ShotRow[]): Zone[] {
  return shots
    .filter((s) => s.excluded === true)
    .map((s) => ({
      src: s.id.split('-')[0],
      from: s.start,
      to: s.end,
      reason: `${s.reason ?? 'excluded'}${s.allowed_crop ? ' — только кроп (allowed_crop)' : ''}`,
      origin: `shots.json ${s.id}`,
    }));
}

/** «V10:6.5-7» → зона для позитивного контроля проверки. */
export function parseInjected(spec: string): Zone {
  const m = spec.match(/^(V\d+):([\d.]+)-([\d.]+|end)$/);
  if (!m) throw new Error(`--inject: ожидался формат V10:6.5-7.0, получено «${spec}»`);
  return { src: m[1], from: Number(m[2]), to: m[3] === 'end' ? Infinity : Number(m[3]), reason: 'ПОДЛОЖЕНО (позитивный контроль)', origin: '--inject' };
}

// ---------------------------------------------------------------- speed ramp живого плана (#038): числа и формула — src/fx/core.ts (RAMP, remapSpeed)
/**
 * Позиция в кадрах исходника (0 = from, дробная → межкадровое смешивание) для i-го кадра плана длиной n кадров,
 * если в исходнике L кадров. Без ramp — 1:1 с удержанием последнего. С ramp — remapSpeed: последние RAMP.slowDur с
 * (9 кадров при 24 fps) идут на ×0.55, остальное — равномерно так, чтобы план кончился ровно на последнем кадре
 * исходника (кадр, из которого сделан стоп-кадр/вырезка). Короткий план (быстрый участок < 3 кадров) целиком в
 * замедлении и начинается позже from — это подмножество проверенного интервала, зоны не задеваются.
 */
export function livePos(i: number, n: number, L: number, ramp: boolean, fps: number): number {
  if (!ramp) return Math.min(i, L - 1);
  return remapSpeed(i, n, L, Math.round(RAMP.slowDur * fps), RAMP.slow);
}

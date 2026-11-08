// Камера схемы: вписывает набор элементов (узел + 2–3 соседа) в рабочую зону кадра между зоной заголовка
// и зоной субтитров. Мир 1920×1080 → экран: screen = world · s + (ox, oy). Чистая функция времени.
import { clamp, lerp, smoother } from '../../motion/index.ts';
import { CHIP, LOOP_CHIPS, LOOP_ROLLBACK, NODES, nodeById } from './schema.ts';
import { CAMERA, CAM_MOVE_SEC, type CamKey } from './timeline.ts';

/** Зоны экрана 1920×1080 (правила композиции brief.md): поля 6 %, заголовок сверху, субтитры в нижних 16 %. */
export const ZONE = {
  marginX: 116,
  title: { y0: 56, y1: 150 },
  work: { x0: 116, x1: 1804, y0: 172, y1: 890 },
  subs: { y0: 908, y1: 1040 },
} as const;
export const S_MIN = 0.9;
export const S_MAX = 1.7;

export type Cam = { s: number; ox: number; oy: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

function boxOf(id: string): Box {
  if (id.startsWith('chip:')) {
    const [x, y] = LOOP_CHIPS[Number(id.slice(5))];
    return { x0: x - CHIP.w / 2, y0: y - CHIP.h / 2, x1: x + CHIP.w / 2, y1: y + CHIP.h / 2 };
  }
  const n = nodeById(id);
  return { x0: n.x - n.w / 2, y0: n.y - n.h / 2, x1: n.x + n.w / 2, y1: n.y + n.h / 2 };
}
const ALL_IDS = [...NODES.map((n) => n.id), ...LOOP_CHIPS.map((_, i) => `chip:${i}`)];

function target(k: CamKey): { cx: number; cy: number; s: number } {
  const ids = k.ids === 'all' ? ALL_IDS : k.ids;
  const b = ids.map(boxOf).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }));
  if (k.ids === 'all') b.x0 = Math.min(b.x0, LOOP_ROLLBACK[1][0] - 10);
  const pad = 36;
  const w = b.x1 - b.x0 + pad * 2;
  const h = b.y1 - b.y0 + pad * 2;
  const W = ZONE.work.x1 - ZONE.work.x0;
  const H = ZONE.work.y1 - ZONE.work.y0;
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s: clamp(Math.min(W / w, H / h), S_MIN, S_MAX) };
}
const TARGETS = CAMERA.map(target);

export function camAt(t: number): Cam {
  let i = 0;
  for (let k = 0; k < CAMERA.length; k++) if (CAMERA[k].at <= t) i = k;
  const cur = TARGETS[i];
  const prev = i > 0 ? TARGETS[i - 1] : cur;
  const u = smoother(clamp((t - CAMERA[i].at) / CAM_MOVE_SEC));
  const s = Math.exp(lerp(Math.log(prev.s), Math.log(cur.s), u));
  const cx = lerp(prev.cx, cur.cx, u);
  const cy = lerp(prev.cy, cur.cy, u);
  // медленный дрейф (живой прибор): ±0.6 % масштаба, период ~11 с
  const drift = 1 + 0.006 * Math.sin((t / 11) * Math.PI * 2);
  const sd = s * drift;
  const wx = (ZONE.work.x0 + ZONE.work.x1) / 2;
  const wy = (ZONE.work.y0 + ZONE.work.y1) / 2;
  return { s: sd, ox: wx - cx * sd, oy: wy - cy * sd };
}

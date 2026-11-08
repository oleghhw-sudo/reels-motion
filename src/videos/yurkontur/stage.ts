// Живые панели (правки Олега 08.11): активный узел раскрывается в панель на 55 % ширины кадра, соседи — компактные карточки
// по краям (слева сверху — откуда пришло, справа снизу — куда уходит). Раскладка в экранных px 1920×1080; время — секунды.
// Сцена «панели» работает в блоке 1 (Скани) и в блоке 3а (Розпізнавання → Два читання → Перевірки кодом → Черга перевірки);
// в остальных блоках схема живёт в мировых координатах с камерой (camera.ts). Переход — интерполяция прямоугольников.
import { clamp, seg, smoother, type Pt } from '../../motion/index.ts';
import { APPEAR, FLASH, block, wordAt } from './timeline.ts';

export type Rect = { x: number; y: number; w: number; h: number };
export const PANEL: Rect = { x: 432, y: 236, w: 1056, h: 620 }; // 55 % ширины
export const LEFT: Rect = { x: 116, y: 236, w: 296, h: 132 };
export const RIGHT: Rect = { x: 1508, y: 724, w: 296, h: 132 };
const OFF_L: Rect = { ...LEFT, x: -360 };
const OFF_R: Rect = { ...RIGHT, x: 1960 };
export type Slot = 'left' | 'center' | 'right' | 'offL' | 'offR';
const SLOT: Record<Slot, Rect> = { left: LEFT, center: PANEL, right: RIGHT, offL: OFF_L, offR: OFF_R };

/** Каналы панели: вход (левая карточка → панель) и выход (панель → правая карточка), ортогональные, ≈ 346 px. */
const midY = PANEL.y + PANEL.h / 2;
export const CH_IN: Pt[] = [[LEFT.x + LEFT.w / 2, LEFT.y + LEFT.h], [LEFT.x + LEFT.w / 2, midY], [PANEL.x, midY]];
export const CH_OUT: Pt[] = [[PANEL.x + PANEL.w, midY], [RIGHT.x + RIGHT.w / 2, midY], [RIGHT.x + RIGHT.w / 2, RIGHT.y]];

/** Порядок цепочки (для «ушёл влево / ещё справа»). */
const ORDER = ['scans', 'ocr', 'read2', 'code', 'queue', 'human1'];

export type Stage = { from: number; center: string; left: string | null; right: string | null };
export const STAGE_LIST: Stage[] = [
  { from: APPEAR.scans - 0.2, center: 'scans', left: null, right: null },
  { from: APPEAR.ocr - 0.4, center: 'ocr', left: 'scans', right: 'read2' },
  { from: APPEAR.read2 - 0.4, center: 'read2', left: 'ocr', right: 'code' },
  { from: APPEAR.code - 0.4, center: 'code', left: 'read2', right: 'queue' },
  { from: APPEAR.queue - 0.4, center: 'queue', left: 'code', right: 'human1' },
];
export const STAGE_MOVE = 0.8;

/** Окна, где работает сцена панелей (вход/выход по 0.8 с). */
const WINDOWS: [number, number][] = [
  [APPEAR.scans - 0.2, block('b1').to - 0.8],
  [APPEAR.ocr - 0.9, block('b3b').from - 0.3],
];
export function stageMix(t: number): number {
  for (const [a, b] of WINDOWS) if (t >= a - 0.01 && t <= b + STAGE_MOVE) return smoother(seg(t, a, a + STAGE_MOVE)) * (1 - smoother(seg(t, b, b + STAGE_MOVE)));
  return 0;
}
export function stageAt(t: number): { cur: Stage; prev: Stage | null; u: number } {
  let i = 0;
  for (let k = 0; k < STAGE_LIST.length; k++) if (STAGE_LIST[k].from <= t) i = k;
  const cur = STAGE_LIST[i];
  // переход между соседними сценами только внутри одного окна (блок 1 → 3а — через мировой режим)
  const prev = i > 0 && STAGE_LIST[i].center !== 'ocr' ? STAGE_LIST[i - 1] : null;
  return { cur, prev, u: smoother(clamp((t - cur.from) / STAGE_MOVE)) };
}
function slotIn(s: Stage, id: string): Slot | null {
  if (s.center === id) return 'center';
  if (s.left === id) return 'left';
  if (s.right === id) return 'right';
  const i = ORDER.indexOf(id);
  const c = ORDER.indexOf(s.center);
  if (i < 0) return null;
  return i < c ? 'offL' : 'offR';
}
const lerpR = (a: Rect, b: Rect, u: number): Rect => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, w: a.w + (b.w - a.w) * u, h: a.h + (b.h - a.h) * u });
/** Прямоугольник узла в сцене панелей и его «раскрытость» (0 — карточка, 1 — панель); null — узел не в цепочке. */
export function stageRectOf(id: string, t: number): { rect: Rect; open: number; slot: Slot } | null {
  const { cur, prev, u } = stageAt(t);
  const sc = slotIn(cur, id);
  if (!sc) return null;
  const sp = prev ? slotIn(prev, id) ?? sc : sc;
  const rect = lerpR(SLOT[sp], SLOT[sc], u);
  const open = (sp === 'center' ? 1 - u : 0) + (sc === 'center' ? u : 0);
  return { rect, open, slot: sc };
}

// ---------------------------------------------------------------- события панелей (на слова диктора; бит-лист brief.md)
const R2 = APPEAR.read2;
const CD = APPEAR.code;
const QU = APPEAR.queue;
export const EV = {
  /** блок 2: экраны стенда в окне по словам — план → договір → скан (накладки: охровые рамки) */
  b2: {
    open: FLASH.ghostBy + 0.6,
    tabs: wordAt('b2', 'чинних умов'),
    plan: wordAt('b2', 'поруч планування'),
    contract: wordAt('b2', 'і договір'),
    rate: wordAt('b2', 'і договір') + 0.8,
    scan: wordAt('b2', 'посилання на місце в скані'),
    close: block('b2').to - 0.6,
  },
  scans: { list: 2.2, scroll: [3.0, 11.0] as const, pages: [12.0, 13.2, 14.4, 15.6] as const },
  ocr: [
    { at: wordAt('b3a', 'пропускає'), crop: 's5_crop_4.png', w: 554, h: 122, cause: 'сума, яку OCR пропустив' },
    { at: wordAt('b3a', 'печатку поверх суми'), crop: 's5_crop_1.png', w: 404, h: 242, cause: 'печатка на тексті' },
    { at: wordAt('b3a', 'бліду сторінку'), crop: 's5_crop_2.png', w: 1760, h: 120, cause: 'бліде' },
    { at: wordAt('b3a', 'рукописну правку'), crop: 's5_crop_3.png', w: 246, h: 126, cause: 'рукописна дата' },
  ],
  /** «Два читання»: пары A/B — совпавшие сливаются, расхождение (реальный пример стенда: різні пункти 6.1 і 6.14) уходит в чергу */
  read2: { streams: R2 + 0.3, pairs: [R2 + 1.2, R2 + 2.3], diverge: R2 + 3.3, toQueue: R2 + 4.1 },
  code: { rows: [CD + 0.3, CD + 0.75, CD + 1.2, CD + 1.65], failRow: 2, out: CD + 2.0 },
  queue: { cursor: [QU + 0.05, QU + 0.5] as const, click: QU + 0.55, green: QU + 0.7, human: APPEAR.human1 + 0.35 },
} as const;

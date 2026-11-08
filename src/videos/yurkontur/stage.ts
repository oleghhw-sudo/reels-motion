// Живые панели (правки Олега 08.11): активный узел раскрывается в панель на 55 % ширины кадра, соседи — компактные карточки
// по краям (слева сверху — откуда пришло, справа снизу — куда уходит). Раскладка в экранных px 1920×1080; время — секунды.
// Смена активного узла: следующий узел появляется карточкой справа (на свои слова), через 0.3 с раскрывается из неё в панель,
// панель сжимается в левую карточку — позиция, размер и обводка интерполируются за STAGE_MOVE с easing (без скачков).
// Окна сцены: блок 1 (Скани) и блок 3а (Скани → Розпізнавання → Два читання → Перевірки кодом → Черга перевірки).
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
// human1 в конце: после «Черга» он уходит вправо за кадр (а не через весь кадр влево)
const ORDER = ['scans', 'ocr', 'read2', 'code', 'queue', 'chain', 'card', 'deadlines', 'deviations', 'human2', 'human1'];

/** Длительность смены раскладки, с (правило: 0.6–0.8 с с easing). */
export const STAGE_MOVE = 0.8;
/** Узел раскрывается из своей карточки через EXPAND_DELAY после появления на свои слова. */
const EXPAND_DELAY = 0.3;

export type Stage = { win: 1 | 3; from: number; center: string; left: string | null; right: string | null };
/** Блок 3а начинается панелью «Скани» одновременно с уходом окна стенда блока 2 (без пустого кадра). */
const B3A_START = block('b2').to - 0.6;
export const STAGE_LIST: Stage[] = [
  { win: 1, from: APPEAR.scans - 0.2, center: 'scans', left: null, right: null },
  { win: 3, from: B3A_START, center: 'scans', left: null, right: 'ocr' },
  { win: 3, from: APPEAR.ocr + EXPAND_DELAY, center: 'ocr', left: 'scans', right: 'read2' },
  { win: 3, from: APPEAR.read2 + EXPAND_DELAY, center: 'read2', left: 'ocr', right: 'code' },
  { win: 3, from: APPEAR.code + EXPAND_DELAY, center: 'code', left: 'read2', right: 'queue' },
  { win: 3, from: APPEAR.queue + EXPAND_DELAY, center: 'queue', left: 'code', right: 'human1' },
  // блоки 3б–3в
  { win: 3, from: APPEAR.chain + EXPAND_DELAY, center: 'chain', left: 'queue', right: 'card' },
  { win: 3, from: APPEAR.card + EXPAND_DELAY, center: 'card', left: 'chain', right: 'human2' },
  { win: 3, from: APPEAR.deadlines + EXPAND_DELAY, center: 'deadlines', left: 'card', right: 'deviations' },
  { win: 3, from: APPEAR.deviations + EXPAND_DELAY, center: 'deviations', left: 'card', right: 'human2' },
];

/** Окна сцены панелей [вход, выход]; переходы мир ↔ панели — по STAGE_MOVE. */
const WINDOWS: [number, number][] = [
  [APPEAR.scans - 0.2, block('b1').to - 0.8],
  // окно до конца блока 3в (+0.2 с): вердикты и «критична умова» успевают прочитаться
  [B3A_START, block('b3c').to + 0.2],
];
export function stageMix(t: number, move = STAGE_MOVE): number {
  for (const [a, b] of WINDOWS) if (t >= a - 0.01 && t <= b + move) return smoother(seg(t, a, a + move)) * (1 - smoother(seg(t, b, b + move)));
  return 0;
}
/** Начало текущего окна (для непрерывных трасс каналов). */
export function windowStart(t: number): number {
  for (const [a, b] of WINDOWS) if (t >= a - 0.01 && t <= b + STAGE_MOVE) return a;
  return 0;
}
export function stageAt(t: number, move = STAGE_MOVE): { cur: Stage; prev: Stage | null; u: number } {
  let i = 0;
  for (let k = 0; k < STAGE_LIST.length; k++) if (STAGE_LIST[k].from <= t) i = k;
  const cur = STAGE_LIST[i];
  const prev = i > 0 && STAGE_LIST[i - 1].win === cur.win ? STAGE_LIST[i - 1] : null;
  return { cur, prev, u: smoother(clamp((t - cur.from) / move)) };
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
/** Прямоугольник узла в сцене панелей, раскрытость (0 — карточка, 1 — панель) и видимость слота; null — не в цепочке. */
export function stageRectOf(id: string, t: number, move = STAGE_MOVE): { rect: Rect; open: number; shown: number } | null {
  const { cur, prev, u } = stageAt(t, move);
  const sc = slotIn(cur, id);
  if (!sc) return null;
  const sp = prev ? slotIn(prev, id) ?? sc : sc;
  const rect = lerpR(SLOT[sp], SLOT[sc], u);
  const open = (sp === 'center' ? 1 - u : 0) + (sc === 'center' ? u : 0);
  const vis = (s: Slot) => (s === 'offL' || s === 'offR' ? 0 : 1);
  const shown = vis(sp) + (vis(sc) - vis(sp)) * u;
  return { rect, open, shown };
}

// ---------------------------------------------------------------- события панелей (на слова диктора; бит-лист brief.md)
const open = (id: string) => APPEAR[id] + EXPAND_DELAY + STAGE_MOVE * 0.75; // панель раскрыта настолько, что видно содержимое
export const EV = {
  /** блок 2: окно стенда — план (проезд) → вкладка «Договір» (рамка на «Ставка чинна») → скан с рамкой стенда */
  b2: {
    open: FLASH.ghostBy + 0.6,
    planPan: [FLASH.ghostBy + 0.8, wordAt('b2', 'поруч планування')] as const,
    room: wordAt('b2', 'поруч планування'),
    contract: wordAt('b2', 'і договір'),
    rate: wordAt('b2', 'і договір') + 0.8,
    scan: wordAt('b2', 'посилання на місце в скані'),
    close: B3A_START,
  },
  /** Скани: 25 названий файлов проезжают и уходят в стопку сканов — в блоке 1 и в начале блока 3а */
  scans: {
    b1: { list: 2.2, scroll: [3.0, 11.0] as const, pages: [12.0, 13.2, 14.4, 15.6] as const },
    b3a: { list: B3A_START + 0.6, scroll: [B3A_START + 0.9, B3A_START + 2.5] as const, pages: [B3A_START + 2.6, B3A_START + 2.85, B3A_START + 3.1, B3A_START + 3.35] as const },
  },
  ocr: [
    { at: wordAt('b3a', 'пропускає'), crop: 's5_crop_4.png', w: 554, h: 122, k: 1.15, cause: 'сума, яку OCR пропустив' },
    { at: wordAt('b3a', 'печатку поверх суми'), crop: 's5_crop_1.png', w: 404, h: 242, k: 1.0, cause: 'печатка на тексті' },
    { at: wordAt('b3a', 'бліду сторінку'), crop: 's5_crop_2.png', w: 1760, h: 120, k: 0.56, cause: 'бліде' },
    { at: wordAt('b3a', 'рукописну правку'), crop: 's5_crop_3.png', w: 246, h: 126, k: 1.8, cause: 'рукописна дата' },
  ],
  /** «Два читання»: пары A/B — совпавшие сливаются, расхождение (реальный пример стенда: різні пункти 6.1 і 6.14) уходит в чергу */
  read2: { streams: open('read2'), pairs: [open('read2') + 0.8, open('read2') + 1.9] as const, diverge: open('read2') + 2.9, toQueue: open('read2') + 3.7 },
  code: { rows: [open('code'), open('code') + 0.4, open('code') + 0.8, open('code') + 1.2] as const, failRow: 2, out: Math.max(open('code') + 1.5, APPEAR.queue - 0.7) }, // «сума прописом = цифрами» держится до появления «Черги» (решение Олега)
  /** Черга: камера на значения → проезд к «Підтвердити» → клик → назад к значениям → зеленеет → Людина №1 заливается */
  queue: { toButton: open('queue') + 0.1, cursor: [open('queue') + 0.3, open('queue') + 0.75] as const, click: open('queue') + 0.8, back: open('queue') + 0.95, green: open('queue') + 1.4, human: open('queue') + 1.75 },
  /** Розбір ланцюга: шкала «Чинна редакція на дату» — три редакции doc1 (24 700 → 43 155 → 48 355), рамка на значении */
  chain: { states: [open('chain'), wordAt('b3b', 'додаткові угоди') + 0.6, wordAt('b3b', 'Новий документ змінює')] as const, rate: wordAt('b3b', 'лише ті умови') },
  /** Картка: 6 полей по одному (timeline APPEAR field:*), нитки к документам ланцюга; площа тричі → конфлікт → Людина №2 */
  card: { docs: open('card') - 0.3, area: APPEAR.human2 - 0.4, conflict: APPEAR.human2, resolve: wordAt('b3b', 'Вирішує юрист') },
  /** Строки: вікна → строка «Останній день заяви» → строка «Автопролонгація» (без строк «Зміна власника») */
  deadlines: { windows: open('deadlines'), group: open('deadlines') + 1.8, last: wordAt('b3c', 'останній день заяви'), auto: wordAt('b3c', 'автопролонгацію') },
  /** Відхилення: экран стенда → пункт раскладывается на 4 твердження → вердикты → критична умова первой */
  // search — система ищет каждое твердження по всему договору (ответ архитектора, п. 6): полоса по строкам
  // current — «і чинний»: рамка «18 відхилення» на старых договорах; fresh — «і новий на його бланку»: вкладка «Новий договір на бланку
  // орендодавця»; compare — «порівнює з типовим»: проезд к п. 4.15 (пункт · що в проєкті · позиція)
  deviations: { stand: open('deviations'), current: wordAt('b3c', 'і чинний'), fresh: wordAt('b3c', 'і новий на його бланку'), compare: wordAt('b3c', 'порівнює з типовим'), split: wordAt('b3c', 'Кожен пункт розкладено'), search: wordAt('b3c', 'Кожен пункт розкладено') + 2.6, verdicts: wordAt('b3c', 'пропонує вердикт') - 0.2, lawyer: wordAt('b3c', 'Ставить його юрист'), critical: wordAt('b3c', 'Ставить його юрист') - 0.3 },
} as const;

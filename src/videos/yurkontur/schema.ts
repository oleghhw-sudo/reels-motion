// Геометрия схемы архитектуры (ответ архитектора юрконтура, задача 031 «Схема архитектуры») в px мира 1920×1080.
// Чистые данные: узлы, ортогональные трассы рёбер, поля картки, петля навчання. Тайминги — в timeline.ts.
// Правила композиции (правки Олега 08.11, brief.md «Правила композиции»): поля ≥ 6 %, рёбра и нитки — ортогональные
// трассы со скруглёнными углами, узлы не перекрываются трассами, петля выше зоны субтитров (нижние 16 % = y > 910).
import type { Pt } from '../../motion/index.ts';

export type NodeKind = 'flow' | 'human' | 'branch';
export type Node = {
  id: string;
  /** Название узла (читаемое при близкой камере, Inter ≥ 32 px на экране) */
  label: string;
  /** Пояснение в узле (только при близкой камере, ≥ 24 px на экране) — настоящие названия из ответа архитектора */
  detail: string;
  kind: NodeKind;
  x: number; // центр
  y: number;
  w: number;
  h: number;
};

export const FLOW_Y = 420;
const NODE_W = 210;
const NODE_H = 156;
const GAP = 36;
const FLOW_DEF: [string, string, string][] = [
  ['scans', 'Скани', 'pdf · jpg · 25 файлів'],
  ['ocr', 'Розпізнавання', 'печатка · бліде · рукопис → людині'],
  ['read2', 'Два читання', 'агент A · агент B · словник скорочень'],
  ['code', 'Перевірки кодом', 'ЄДРПОУ · дати · суми · цитата'],
  ['queue', 'Черга перевірки', 'підтвердити · виправити · відхилити'],
  ['chain', 'Розбір ланцюга', 'договір → допугоди → акти → розірвання'],
  ['card', 'Картка чинних умов', ''],
];
const TOTAL_W = FLOW_DEF.length * NODE_W + (FLOW_DEF.length - 1) * GAP; // 1686 → поля 117 px = 6.1 %
const START_X = (1920 - TOTAL_W) / 2 + NODE_W / 2;

export const FLOW: Node[] = FLOW_DEF.map(([id, label, detail], i) => ({
  id,
  label,
  detail,
  kind: 'flow',
  x: START_X + i * (NODE_W + GAP),
  y: FLOW_Y,
  w: NODE_W,
  h: id === 'card' ? 260 : NODE_H,
}));

const card = FLOW[FLOW.length - 1];
const queue = FLOW[4];
const ocr = FLOW[1];

/** Колонка под карткой: Відхилення → Людина №2 на одной вертикали x = card.x − 15 (канал конфликта идёт по ней же). */
const COL_X = card.x - 15;

export const BRANCHES: Node[] = [
  { id: 'deadlines', label: 'Строки', detail: 'рахують правила, не модель', kind: 'branch', x: card.x - 290, y: 676, w: NODE_W, h: 120 },
  { id: 'deviations', label: 'Відхилення від еталона', detail: 'пункт → твердження → вердикт', kind: 'branch', x: COL_X, y: 680, w: 226, h: 132 },
];

export const HUMANS: Node[] = [
  { id: 'human1', label: 'Людина №1', detail: 'юрист · відділ оренди', kind: 'human', x: queue.x, y: 244, w: NODE_W, h: 100 },
  { id: 'human2', label: 'Людина №2', detail: 'вердикти · конфлікти документів', kind: 'human', x: COL_X, y: 862, w: 226, h: 100 },
];

export const NODES: Node[] = [...FLOW, ...BRANCHES, ...HUMANS];
export const nodeById = (id: string): Node => {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`Схема: нет узла ${id}`);
  return n;
};
const top = (n: Node) => n.y - n.h / 2;
const bottom = (n: Node) => n.y + n.h / 2;

export type Edge = { id: string; from: string; to: string; pts: Pt[]; human: boolean };

/** Шина потока под рядом узлов: связь i → i+1 выходит из низа узла (x + 40), идёт по шине и входит снизу в следующий (x − 40).
 * Прямой зазор между узлами — 36 px мира, его закрывают подложки узлов; по шине трасса видна на всей длине. */
export const BUS_Y = FLOW_Y + NODE_H / 2 + 34;
const DROP = 40;
function flowEdgePts(a: Node, b: Node): Pt[] {
  if (b.id === 'card') return [[a.x + DROP, bottom(a)], [a.x + DROP, BUS_Y], [b.x - b.w / 2, BUS_Y]]; // картка выше шины по низу — вход слева
  return [[a.x + DROP, bottom(a)], [a.x + DROP, BUS_Y], [b.x - DROP, BUS_Y], [b.x - DROP, bottom(b)]];
}

/** Рёбра — ортогональные трассы (вершины ломаной; углы скругляются при рисовании). Включается ребро, когда появился узел `to`. */
export const EDGES: Edge[] = [
  ...FLOW.slice(1).map((n, i): Edge => ({ id: `${FLOW[i].id}-${n.id}`, from: FLOW[i].id, to: n.id, human: false, pts: flowEdgePts(FLOW[i], n) })),
  { id: 'queue-human1', from: 'queue', to: 'human1', human: true, pts: [[queue.x, top(queue)], [queue.x, bottom(HUMANS[0])]] },
  // конфликт документов → людина №2: вертикаль под карткой; позже на ней же материализуется «Відхилення»
  { id: 'card-human2', from: 'card', to: 'human2', human: true, pts: [[COL_X, bottom(card)], [COL_X, top(HUMANS[1])]] },
  { id: 'card-deadlines', from: 'card', to: 'deadlines', human: false, pts: [[card.x - 70, bottom(card)], [card.x - 70, 584], [BRANCHES[0].x, 584], [BRANCHES[0].x, top(BRANCHES[0])]] },
  { id: 'card-deviations', from: 'card', to: 'deviations', human: false, pts: [[COL_X, bottom(card)], [COL_X, top(BRANCHES[1])]] },
];

/** Поля картки (фактура/читаемый список внутри узла card) — настоящие названия полей из ответа архитектора. */
export const CARD_FIELDS = ['Ставка', 'Діє до', 'Останній день заяви', 'Площа', 'Комунальні', 'Орендодавець'] as const;

/** Петля навчання («так працюватиме»): 6 кроків-станцій на трассе от людини №2 влево под потоком и вверх в розпізнавання. */
export const LOOP_STEPS = ['рішення людини', 'контрольний приклад', 'щотижневий розбір', 'пропозиція', 'перевірка на еталоні', 'нова версія / відкат'] as const;
const H2 = HUMANS[1];
export const LOOP_Y = H2.y;
export const LOOP_PTS: Pt[] = [
  [H2.x - H2.w / 2, LOOP_Y],
  [ocr.x, LOOP_Y],
  [ocr.x, bottom(ocr)],
];
/** Станции петли (центры чипов): 4 на горизонтали, 2 на вертикали к розпізнаванню. Шрифт чипа 30 px мира. */
export const CHIP = { w: 214, h: 86, font: 30 } as const;
export const LOOP_CHIPS: Pt[] = [
  [1404, LOOP_Y],
  [1176, LOOP_Y],
  [948, LOOP_Y],
  [720, LOOP_Y],
  [ocr.x, 740],
  [ocr.x, 610],
];
/** Развилка у последней станции: «нова версія» — вверх в розпізнавання, «відкат» — отвод влево. */
export const LOOP_ROLLBACK: Pt[] = [
  [ocr.x - CHIP.w / 2, 610],
  [ocr.x - CHIP.w / 2 - 70, 610],
];

/** Основной путь частиц: центры узлов потока слева направо. */
export const FLOW_PATH: Pt[] = FLOW.map((n) => [n.x, n.y]);

/** Маршрут одного договора в блоке 5: по шине потока → картка → вниз через «Відхилення» к людині №2 (конфлікт) → назад у картку.
 * Участки внутри узлов скрыты подложками (хвост рисуется под узлами). */
export const CONTRACT_ROUTE: Pt[] = (() => {
  const P: Pt[] = [[FLOW[0].x, FLOW[0].y]];
  for (let i = 1; i < FLOW.length; i++) P.push(...flowEdgePts(FLOW[i - 1], FLOW[i]));
  P.push([card.x, card.y], [COL_X, card.y], [COL_X, HUMANS[1].y], [COL_X + 12, HUMANS[1].y], [COL_X + 12, card.y + 30]);
  return P;
})();
const polyLen = (P: Pt[]) => P.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
/** Доля длины маршрута, где договор доходит до людини №2. */
export const CONTRACT_HUMAN_K = polyLen(CONTRACT_ROUTE.slice(0, CONTRACT_ROUTE.length - 2)) / polyLen(CONTRACT_ROUTE);

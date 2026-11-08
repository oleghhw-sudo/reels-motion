// Геометрия схемы архитектуры (ответ архитектора юрконтура, задача 031 «Схема архитектуры») в px кадра 1920×1080.
// Чистые данные: узлы основного потока, ветки, люди, петля навчання. Тайминги здесь не живут.
import type { Pt } from '../../motion/index.ts';

export type NodeKind = 'flow' | 'human' | 'branch';
export type Node = {
  id: string;
  /** Подпись узла (фактура, моно) */
  label: string;
  /** Вторая строка фактуры — что внутри узла (только настоящие названия из ответа архитектора) */
  detail: string;
  kind: NodeKind;
  x: number; // центр
  y: number;
  w: number;
  h: number;
};

const FLOW_Y = 430;
const NODE_W = 190;
const NODE_H = 78;
const GAP = 52;
const FLOW_IDS: [string, string, string][] = [
  ['scans', 'Скани', 'pdf · jpg · 25 файлів'],
  ['ocr', 'Розпізнавання', 'печатка · бліде · рукопис → людині'],
  ['read2', 'Два читання', 'агент A · агент B · словник'],
  ['code', 'Перевірки кодом', 'ЄДРПОУ · дати · суми · цитата'],
  ['queue', 'Черга перевірки', 'підтвердити · виправити · відхилити'],
  ['chain', 'Розбір ланцюга', 'договір → допугоди → акти → розірвання'],
  ['card', 'Картка чинних умов', 'поле · джерело · місце в скані · дата'],
];
const START_X = (1920 - (FLOW_IDS.length * NODE_W + (FLOW_IDS.length - 1) * GAP)) / 2 + NODE_W / 2;

export const FLOW: Node[] = FLOW_IDS.map(([id, label, detail], i) => ({ id, label, detail, kind: 'flow', x: START_X + i * (NODE_W + GAP), y: FLOW_Y, w: NODE_W, h: NODE_H }));

const card = FLOW[FLOW.length - 1];
const queue = FLOW[4];

export const BRANCHES: Node[] = [
  { id: 'deadlines', label: 'Строки', detail: 'рахують правила, не модель', kind: 'branch', x: card.x - 150, y: 640, w: NODE_W, h: NODE_H },
  { id: 'deviations', label: 'Відхилення від еталона', detail: 'пункт → твердження → вердикт', kind: 'branch', x: card.x + 110, y: 640, w: NODE_W + 30, h: NODE_H },
];

export const HUMANS: Node[] = [
  { id: 'human1', label: 'ЛЮДИНА №1', detail: 'юрист · відділ оренди', kind: 'human', x: queue.x, y: 250, w: NODE_W, h: 64 },
  { id: 'human2', label: 'ЛЮДИНА №2', detail: 'вердикти · конфлікти', kind: 'human', x: card.x + 110, y: 820, w: NODE_W, h: 64 },
];

export const NODES: Node[] = [...FLOW, ...BRANCHES, ...HUMANS];
export const nodeById = (id: string): Node => {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`Схема: нет узла ${id}`);
  return n;
};

/** Рёбра основного потока + ветки (отрезки центр→центр, обрезаются по узлам при рисовании). */
export const EDGES: [string, string][] = [
  ...FLOW.slice(1).map((n, i) => [FLOW[i].id, n.id] as [string, string]),
  ['queue', 'human1'],
  ['card', 'deadlines'],
  ['card', 'deviations'],
  ['deviations', 'human2'],
];

/** Поля картки (фактура внутри узла card) — настоящие названия полей из ответа архитектора. */
export const CARD_FIELDS = ['Ставка', 'Діє до', 'Останній день заяви', 'Площа', 'Комунальні', 'Орендодавець'] as const;

/** Петля навчання («так працюватиме»): 6 кроків дугою під потоком, от людини №2 назад к розпізнаванню. */
export const LOOP_STEPS = ['рішення людини', 'контрольний приклад', 'щотижневий розбір', 'пропозиція', 'перевірка на еталоні', 'нова версія / відкат'] as const;

/** Опорные точки дуги петли (Catmull-Rom через through()). */
export const LOOP_PATH: Pt[] = (() => {
  const h2 = nodeById('human2');
  const ocr = nodeById('ocr');
  const y = 960;
  return [
    [h2.x, h2.y + h2.h / 2],
    [h2.x - 120, y - 40],
    [1300, y],
    [960, y + 10],
    [620, y],
    [ocr.x + 20, y - 60],
    [ocr.x, ocr.y + ocr.h / 2],
  ];
})();

/** Основной путь частиц: центры узлов потока слева направо. */
export const FLOW_PATH: Pt[] = FLOW.map((n) => [n.x, n.y]);

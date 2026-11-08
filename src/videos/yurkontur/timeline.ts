// Таймлайн видео «Юридичний контур АНЦ» (задача 031) в секундах. Сцены читают время ТОЛЬКО отсюда.
// До озвучки время слов — гипотеза: начало блока + 0.6 с + номер слова / 2.2 слова/с (темп из задачи).
// После озвучки wordAt() заменяется на words.json выравнивания (voice/align.mjs), события остаются привязаны к словам.
// Тексты диктора и заголовки — script.ts.
import { clamp } from '../../motion/index.ts';
import { CARD_FIELDS, LOOP_STEPS } from './schema.ts';
import { BLOCK_SCRIPT, type BlockId, type BlockScript } from './script.ts';

export const WORDS_PER_SEC = 2.2;
const LEAD = 0.6;

export type { BlockId } from './script.ts';
export type Block = BlockScript & { from: number; to: number };

/** Границы блоков — гипотеза до озвучки; после выравнивания (032 п. 1) — из videos/yurkontur/voice/words.json. */
const BOUNDS: Record<BlockId, [number, number]> = { b1: [0, 20], b2: [20, 32], b3a: [32, 53], b3b: [53, 73], b3c: [73, 90], b4: [90, 117], b5: [117, 137], b6: [137, 150] };
export const BLOCKS: Block[] = BLOCK_SCRIPT.map((b) => ({ ...b, from: BOUNDS[b.id][0], to: BOUNDS[b.id][1] }));
export const DURATION = 150;
export const block = (id: BlockId): Block => BLOCKS.find((b) => b.id === id)!;
export const blockAt = (t: number): Block => BLOCKS.find((b) => t >= b.from && t < b.to) ?? BLOCKS[BLOCKS.length - 1];

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'’]/gu, '');
const wordsOf = (s: string) => s.split(/\s+/).filter((w) => norm(w).length > 0);

/** Время начала фразы phrase в тексте блока (гипотеза темпа). Нет фразы — громкая ошибка. */
export function wordAt(id: BlockId, phrase: string): number {
  const b = block(id);
  const W = wordsOf(b.voice).map(norm);
  const P = wordsOf(phrase).map(norm);
  for (let i = 0; i + P.length <= W.length; i++) if (P.every((p, k) => W[i + k] === p)) return b.from + LEAD + i / WORDS_PER_SEC;
  throw new Error(`timeline: в блоке ${id} нет фразы «${phrase}»`);
}

/** Время появления каждого элемента схемы (узлы, поля картки, станции петли). Нет в таблице — не появляется. */
export const APPEAR: Record<string, number> = {
  // блок 1: только «Скани»
  scans: block('b1').from + 1.0,
  // блок 3а: канал включается при появлении следующего узла
  // «Спершу система читає скан» — панель «Скани» (stage.ts); Розпізнавання — на «Те, що звичайне розпізнавання»
  ocr: wordAt('b3a', 'Те, що звичайне'),
  read2: wordAt('b3a', 'Далі договір читають'),
  code: wordAt('b3a', 'Код перевіряє'),
  queue: wordAt('b3a', 'Критичні значення'),
  human1: wordAt('b3a', 'підтверджує юрист або відділ оренди'),
  // блок 3б
  chain: wordAt('b3b', 'розбирає ланцюг'),
  // Картка — на «Так ставка може прийти…»: панель «Розбір ланцюга» держит шкалу редакций до этих слов
  card: wordAt('b3b', 'Так ставка може прийти'),
  'field:Ставка': wordAt('b3b', 'ставка може прийти'),
  // фраза 032 п. 0.1: «…з додаткової угоди, а площа й строк — з договору» — поля по порядку слов; нитки — по стенду
  'field:Площа': wordAt('b3b', 'площа й строк'),
  'field:Діє до': wordAt('b3b', 'строк — з договору'),
  'field:Останній день заяви': wordAt('b3b', 'строк — з договору') + 0.7,
  'field:Комунальні': wordAt('b3b', 'строк — з договору') + 1.4,
  'field:Орендодавець': wordAt('b3b', 'строк — з договору') + 2.1,
  human2: wordAt('b3b', 'суперечать один одному'),
  // блок 3в: из картки вырастают
  deadlines: wordAt('b3c', 'Строки рахують'),
  deviations: wordAt('b3c', 'порівнює з типовим'),
  // блок 4: станции петли по очереди, в конце развилка
  'chip:0': wordAt('b4', 'Кожне рішення людини'),
  'chip:1': wordAt('b4', 'Виправлене значення'),
  'chip:2': wordAt('b4', 'Щотижня помилки'),
  'chip:3': wordAt('b4', "з'являтиметься пропозиція"),
  'chip:4': wordAt('b4', 'Нову навичку прийматимуть'),
  'chip:5': wordAt('b4', 'Інакше — відкат'),
};
export const FIELD_KEYS = CARD_FIELDS.map((f) => `field:${f}`);
export const CHIP_KEYS = LOOP_STEPS.map((_, i) => `chip:${i}`);

/** Петля: прорисовка трассы от людини №2 до розпізнавання за время от первой до последней станции. */
export const LOOP_DRAW = { from: APPEAR['chip:0'] - 0.6, to: APPEAR['chip:5'] + 0.4 } as const;

/** Блок 2: вспышка силуэта всей схемы (M) и угасание до призраков. */
export const FLASH = { at: block('b2').from + 0.3, peak: block('b2').from + 0.6, ghostBy: block('b2').from + 2.4 } as const;

/** Блок 5: плотность до максимума, один договор по маршруту. */
export const CONTRACT = { from: block('b5').from + 1.5, to: block('b5').to - 3 } as const;

/** Блок 6: приглушение и пересборка по 4 этапам (узлы каждого этапа). */
export const STAGES: { at: number; ids: string[] }[] = [
  { at: wordAt('b6', 'еталон і калібровка'), ids: ['ocr', 'read2', 'code'] },
  { at: wordAt('b6', 'пілот на найгірших сканах'), ids: ['scans', 'queue', 'human1'] },
  { at: wordAt('b6', 'оцифрування всього корпусу'), ids: ['chain', 'card', 'deadlines', 'deviations', 'human2'] },
  { at: wordAt('b6', 'модуль в ALI'), ids: ['chips'] },
];

/** Плотность поля по блокам (растёт к блоку 5), сглаженная на стыках. */
const DENSITY: Record<BlockId, number> = { b1: 0.25, b2: 0.4, b3a: 0.5, b3b: 0.55, b3c: 0.6, b4: 0.7, b5: 1, b6: 0.55 };
export function densityAt(t: number): number {
  const b = blockAt(t);
  const i = BLOCKS.indexOf(b);
  const prev = i > 0 ? DENSITY[BLOCKS[i - 1].id] : DENSITY[b.id];
  const k = clamp((t - b.from) / 1.5);
  return prev + (DENSITY[b.id] - prev) * k;
}

/** Камера: в кадре новый узел + 2–3 соседа; целиком схема — только в блоках 2 и 5. ids — что вписать. */
export type CamKey = { at: number; ids: string[] | 'all' };
export const CAMERA: CamKey[] = [
  { at: 0, ids: ['scans'] },
  // блок 2: силуэт всей схемы целиком в кадре — камера выходит на общий план до вспышки
  { at: block('b1').to - 1.4, ids: 'all' },
  { at: APPEAR.ocr - 0.5, ids: ['scans', 'ocr', 'read2'] },
  { at: APPEAR.read2 - 0.5, ids: ['ocr', 'read2', 'code'] },
  { at: APPEAR.code - 0.5, ids: ['read2', 'code', 'queue'] },
  { at: APPEAR.queue - 0.5, ids: ['code', 'queue', 'human1'] },
  { at: APPEAR.chain - 0.5, ids: ['queue', 'chain', 'card'] },
  // людина №2 — на словах про конфлікт: кадр на неё и место будущего «Відхилення»; картка — краем сверху
  { at: APPEAR.human2 - 0.5, ids: ['deviations', 'human2'] },
  { at: APPEAR.deadlines - 0.5, ids: ['card', 'deadlines'] },
  { at: APPEAR.deviations - 0.5, ids: ['deadlines', 'deviations', 'human2'] },
  // петля: текущая станция + соседи + узел над ней (контекст фактурой); чипы читаемы уже при s ≥ 1.07
  { at: APPEAR['chip:0'] - 0.5, ids: ['deviations', 'human2', 'chip:0', 'deadlines'] },
  { at: APPEAR['chip:1'] - 0.5, ids: ['chip:0', 'chip:1', 'chip:2', 'queue'] },
  { at: APPEAR['chip:2'] - 0.5, ids: ['chip:1', 'chip:2', 'chip:3', 'code'] },
  { at: APPEAR['chip:3'] - 0.5, ids: ['chip:2', 'chip:3', 'chip:4', 'read2'] },
  { at: APPEAR['chip:4'] - 0.5, ids: ['chip:3', 'chip:4', 'chip:5', 'ocr'] },
  { at: APPEAR['chip:5'] - 0.5, ids: ['chip:4', 'chip:5', 'ocr', 'read2'] },
  { at: block('b5').from, ids: 'all' },
  { at: block('b6').from, ids: 'all' },
];
export const CAM_MOVE_SEC = 1.4;

/** Субтитр в момент t: предложение (длинное — до запятой/тире), в котором сейчас звучит слово. Текст — дословно, с тире. */
export function subtitleAt(t: number): string | null {
  const b = blockAt(t);
  const tokens = b.voice.split(/\s+/).filter(Boolean);
  // номер звучащего слова → индекс токена (тире «—» не слово, но остаётся в тексте)
  const wordTok: number[] = [];
  tokens.forEach((tk, k) => {
    if (norm(tk).length > 0) wordTok.push(k);
  });
  const i = Math.floor((t - b.from - LEAD) * WORDS_PER_SEC);
  if (i < 0 || i >= wordTok.length + 2) return null;
  const cur = wordTok[Math.min(i, wordTok.length - 1)];
  const frags: { from: number; to: number }[] = [];
  let start = 0;
  for (let k = 0; k < tokens.length; k++) {
    const end = /[.!?:]$/.test(tokens[k]) || k === tokens.length - 1;
    const long = tokens.slice(start, k + 1).join(' ').length > 110 && /[,—]$/.test(tokens[k]);
    if (end || long) {
      frags.push({ from: start, to: k });
      start = k + 1;
    }
  }
  const f = frags.find((x) => cur >= x.from && cur <= x.to) ?? frags[frags.length - 1];
  return tokens.slice(f.from, f.to + 1).join(' ');
}

// Таймлайн видео «Юридичний контур АНЦ» (задача 031) в секундах. Сцены читают время ТОЛЬКО отсюда.
// До озвучки время слов — гипотеза: начало блока + 0.6 с + номер слова / 2.2 слова/с (темп из задачи).
// После озвучки wordAt() заменяется на words.json выравнивания (voice/align.mjs), события остаются привязаны к словам.
// Тексты диктора — дословно из задачи 031 (черновик архитектора); где число не сверено — запасная фраза задачи.
import { clamp } from '../../motion/index.ts';
import { CARD_FIELDS, LOOP_STEPS } from './schema.ts';

export const WORDS_PER_SEC = 2.2;
const LEAD = 0.6;

export type BlockId = 'b1' | 'b2' | 'b3a' | 'b3b' | 'b3c' | 'b4' | 'b5' | 'b6';
export type Block = { id: BlockId; from: number; to: number; title: string | null; voice: string };

export const BLOCKS: Block[] = [
  {
    id: 'b1',
    from: 0,
    to: 20,
    title: null,
    // запасная фраза: «понад 1 700» нет в сверенных строках NUMBERS_CHECK по таблице задачи
    voice:
      'Договори оренди аптек ведуться в обліковій системі: кожен розкладено на тринадцять вкладок: строки, ставка, юридичні умови, перелік файлів. Що змінила кожна додаткова угода, видно лише з назви файлу. Цілої картини з цього не скласти: ні нагадувань про строки, ні аналітики по мережі.',
  },
  { id: 'b2', from: 20, to: 32, title: 'Картка аптеки = план + договір', voice: 'Юридичний контур — модуль до ALI і єдина база чинних умов. У картці аптеки поруч планування і договір, а кожна умова має посилання на місце в скані.' },
  {
    id: 'b3a',
    from: 32,
    to: 53,
    // 81 % / 29 % — NUMBERS_CHECK стр. 32–33 (сверено архитектором, таблица «Числа» задачи)
    title: '81 % — читання збіглися · 29 % — юристу',
    voice:
      'Спершу система читає скан. Те, що звичайне розпізнавання пропускає, вона збирає й показує людині: печатку поверх суми, бліду сторінку, рукописну правку. Далі договір читають два незалежні агенти, і другий не бачить відповіді першого. Код перевіряє ЄДРПОУ, дати й суми. Критичні значення підтверджує юрист або відділ оренди.',
  },
  {
    id: 'b3b',
    from: 53,
    to: 73,
    title: 'Умова живе в полі, а не в документі',
    voice:
      'Потім система розбирає ланцюг: договір, додаткові угоди, акти, розірвання. Новий документ змінює лише ті умови, які в ньому названо. Так ставка може прийти з однієї угоди, строк — з іншої, площа — з договору. Якщо два документи суперечать один одному, система не обирає. Вирішує юрист.',
  },
  {
    id: 'b3c',
    from: 73,
    to: 90,
    title: 'рівнозначно · допустимо · неприйнятно · не знайдено',
    voice:
      'Строки рахують правила, а не модель, і система нагадує про останній день заяви та автопролонгацію. Договір орендодавця система порівнює з типовим. Кожен пункт розкладено на смислові твердження, і для кожного вона пропонує вердикт. Ставить його юрист, критичні умови — першими.',
  },
  {
    id: 'b4',
    from: 90,
    to: 117,
    title: 'Петля навчання · так працюватиме',
    voice:
      "Кожне рішення людини працюватиме на систему. Виправлене значення стане контрольним прикладом. Щотижня помилки розбиратимуться за типами, і з'являтиметься пропозиція: доповнити словник, бібліотеку формулювань чи навичку читання. Нову навичку прийматимуть лише тоді, коли на еталоні немає жодної нової помилки в критичних полях. Інакше — відкат. Юридичних висновків система не вчиться ніколи.",
  },
  { id: 'b5', from: 117, to: 137, title: null, voice: 'Ось увесь контур разом: чинні умови кожної аптеки з доказом на скані й уся мережа в одному реєстрі. З кожним рішенням юриста система помилятиметься рідше, а вирішує завжди людина.' },
  {
    id: 'b6',
    from: 137,
    to: 150,
    title: null,
    // запасная фраза: «4–5 місяців» не сверено (таблица «Числа» задачи)
    voice: 'Чотири етапи до робочого модуля: еталон і калібровка, пілот на найгірших сканах, оцифрування всього корпусу, модуль в ALI.',
  },
];
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
  ocr: wordAt('b3a', 'читає скан'),
  read2: wordAt('b3a', 'Далі договір читають'),
  code: wordAt('b3a', 'Код перевіряє'),
  queue: wordAt('b3a', 'Критичні значення'),
  human1: wordAt('b3a', 'підтверджує юрист або відділ оренди'),
  // блок 3б
  chain: wordAt('b3b', 'розбирає ланцюг'),
  card: wordAt('b3b', 'Новий документ змінює'),
  'field:Ставка': wordAt('b3b', 'ставка може прийти'),
  'field:Діє до': wordAt('b3b', 'строк — з іншої'),
  'field:Останній день заяви': wordAt('b3b', 'строк — з іншої') + 0.7,
  'field:Площа': wordAt('b3b', 'площа — з договору'),
  'field:Комунальні': wordAt('b3b', 'площа — з договору') + 0.7,
  'field:Орендодавець': wordAt('b3b', 'площа — з договору') + 1.4,
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
  { at: FLASH.at - 0.2, ids: 'all' },
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

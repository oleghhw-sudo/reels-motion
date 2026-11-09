// Таймлайн видео «Юридичний контур АНЦ» (задача 031) в секундах. Сцены читают время ТОЛЬКО отсюда.
// Время слов и границы блоков — из выравнивания полной озвучки videos/yurkontur/voice/words.json (задача 032 п. 1,
// voice-full.mjs → WhisperX). События привязаны к словам диктора (wordAt), а не к секундам.
// Тексты диктора и заголовки — script.ts.
import { clamp } from '../../motion/index.ts';
import { CARD_FIELDS, LOOP_STEPS } from './schema.ts';
import { BLOCK_SCRIPT, type BlockId, type BlockScript } from './script.ts';

import VOICE from '../../../videos/yurkontur/voice/words.json' with { type: 'json' };
import { tokenize } from '../../../voice/metrics.mjs';

type VWord = { text: string; start: number; end: number; match: boolean };
type VBlock = { id: string; from: number; to: number; voiceAt: number; voiceEnd: number; words: VWord[] };
const VB = VOICE.blocks as VBlock[];
const vblock = (id: string): VBlock => {
  const v = VB.find((b) => b.id === id);
  if (!v) throw new Error(`timeline: в words.json нет блока ${id} — перезапустить voice-full.mjs`);
  return v;
};
export type { BlockId } from './script.ts';
export type Block = BlockScript & { from: number; to: number };

/** Границы блоков — из озвучки. Текст сценария обязан совпадать со словами words.json: иначе громкая ошибка. */
export const BLOCKS: Block[] = BLOCK_SCRIPT.map((b) => {
  const v = vblock(b.id);
  const n = tokenize(b.voice).length;
  if (n !== v.words.length) throw new Error(`timeline: блок ${b.id} — в сценарии ${n} слов, в words.json ${v.words.length}; озвучка устарела (voice-full.mjs --only ${b.id})`);
  return { ...b, from: v.from, to: v.to };
});
export const DURATION: number = VOICE.durationSec;
export const block = (id: BlockId): Block => BLOCKS.find((b) => b.id === id)!;
export const blockAt = (t: number): Block => BLOCKS.find((b) => t >= b.from && t < b.to) ?? BLOCKS[BLOCKS.length - 1];

/** Время начала фразы phrase в озвучке блока (по выравниванию). Нет фразы — громкая ошибка. */
export function wordAt(id: BlockId, phrase: string): number {
  const W = vblock(id).words.map((w) => w.text);
  const P = tokenize(phrase);
  for (let i = 0; i + P.length <= W.length; i++) if (P.every((p, k) => W[i + k] === p)) return vblock(id).words[i].start;
  throw new Error(`timeline: в блоке ${id} нет фразы «${phrase}»`);
}
/** Конец голоса блока. */
export const voiceEnd = (id: BlockId): number => vblock(id).voiceEnd;

/** Время появления каждого элемента схемы (узлы, поля картки, станции петли). Нет в таблице — не появляется. */
export const APPEAR: Record<string, number> = {
  // блок 1: «Скани» — единственный живой узел «мёртвой» схемы (остальные призраки, ничего не течёт); в него падают 25 файлов
  scans: wordAt('b1', 'Цілої картини') + 1.6,
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
  // правка Олега 09.11: «Будь-який договір орендодавця, і чинний, і новий на його бланку…» — панель раскрывается на начале фразы
  deviations: wordAt('b3c', 'Будь-який договір орендодавця'),
  // блок 4: станции петли по очереди (правки Олега 09.11 — станции раскрываются в панели, loop.tsx); петля включается на
  // «І головне» (M, LOOP_ON). Станция открывается на свои слова; моменты выбраны так, чтобы содержимое панели успевало
  // прочитаться до следующей (readcheck): примечание «рішення» держится до «стане контрольним», подписи типов — до «пропозиція»
  'chip:0': wordAt('b4', 'рішенні юриста'),
  'chip:1': wordAt('b4', 'стане контрольним'),
  'chip:2': wordAt('b4', 'помилки розбиратимуться'),
  'chip:3': wordAt('b4', 'пропозиція'),
  'chip:4': wordAt('b4', 'Нову навичку прийматимуть'),
  // «нова версія / відкат»: перевірку пройдено — новая версия уходит в узлы по петле (мировая схема)
  'chip:5': wordAt('b4', 'в критичних полях') + 0.5,
};
export const FIELD_KEYS = CARD_FIELDS.map((f) => `field:${f}`);
export const CHIP_KEYS = LOOP_STEPS.map((_, i) => `chip:${i}`);

/** Блок 4: «І головне» — включение петли (акцент M). */
export const LOOP_ON = wordAt('b4', 'І головне');
/** Блок 4 (032, правки Олега 09.11): события станций-панелей петли — на слова диктора (будущее время, «так працюватиме»). */
export const LOOP_EV = {
  /** «на кожному рішенні юриста» — импульс на «Людина №2» (мир, до раскрытия первой станции) */
  jurist: wordAt('b4', 'рішенні юриста'),
  /** «Модель пропонує» — рамка охрой на «Два незалежних читання» карточки задачи */
  model: wordAt('b4', 'Модель пропонує'),
  /** «людина … виправляє» — курсор жмёт «Виправити», печатается примечание */
  fix: wordAt('b4', 'виправляє'),
  /** «за типами» — ошибки ложатся в колонки типов */
  types: wordAt('b4', 'за типами'),
  /** «доповнити словник, бібліотеку формулювань чи навичку читання» — три чипа; выбирается «навичка читання» */
  tags: [wordAt('b4', 'словник'), wordAt('b4', 'бібліотеку формулювань'), wordAt('b4', 'навичку читання')] as const,
  /** «на еталоні … жодної нової помилки в критичних полях» — сетка эталона загорается, подпись */
  check: wordAt('b4', 'на еталоні немає'),
  noErr: wordAt('b4', 'немає жодної'),
  critical: wordAt('b4', 'в критичних полях'),
  /** «Інакше — відкат» — ветка отката подсвечивается и гаснет */
  rollback: wordAt('b4', 'відкат'),
  /** «Юридичних висновків система не вчиться ніколи» — отдельный кадр-граница */
  bound: wordAt('b4', 'Юридичних висновків'),
  /** «не вчиться ніколи» — правая колонка обводится тушью, появляется «тільки у людини» */
  never: wordAt('b4', 'не вчиться ніколи'),
} as const;

/** Петля: на «І головне» прорисовывается целиком за 1 с и дальше живёт (по ней всё время бегут зелёные трассы). */
export const LOOP_DRAW = { from: LOOP_ON, to: LOOP_ON + 1.0 } as const;

/** Блок 1: старая база (legacy_1…4) плоско → экраны расходятся карточками → «мёртвая» схема (призраки, ничего не течёт). */
export const DEAD = { at: wordAt('b1', 'Цілої картини') + 1.2 } as const;

/** Блок 2: вспышка силуэта всей схемы (M) и угасание до призраков. */
export const FLASH = { at: block('b2').from + 0.3, peak: block('b2').from + 0.6, ghostBy: block('b2').from + 2.4 } as const;

/** Блок 5 (032): плотность до максимума; один договор — 25 файлов блока 1 встают в цепочку и уходят в «Скани», бусина
 *  идёт скан → … → картка («з доказом на скані» — нитка картка → скан), реестр стенда на «уся мережа в одному реєстрі»,
 *  на «помилятиметься рідше» договор уходит к «Людина №2», на «вирішує завжди людина» — конфлікт → решение → назад у картку. */
export const CONTRACT = {
  files: wordAt('b5', 'увесь контур'),
  from: wordAt('b5', 'чинні умови') - 0.2,
  card: wordAt('b5', 'на скані'),
  proof: wordAt('b5', 'на скані') + 0.1,
  registry: wordAt('b5', 'уся мережа'),
  registryOut: wordAt('b5', 'З кожним рішенням') + 0.1,
  learn: wordAt('b5', 'рішенням юриста'),
  leave: wordAt('b5', 'помилятиметься рідше'),
  human: wordAt('b5', 'вирішує завжди людина'),
  decide: wordAt('b5', 'вирішує завжди людина') + 0.55,
  to: wordAt('b5', 'вирішує завжди людина') + 1.3,
} as const;

/** Блок 6 (032): дорожная карта — 4 этапа по словам; затем последняя нитка собирает локап. */
export const LOCKUP = { thread: voiceEnd('b6') + 0.05, text: voiceEnd('b6') + 0.55 } as const;

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
  // блок 1 — «мёртвая» схема и вспышка блока 2: вся схема целиком в кадре (без обрезки силуэта)
  { at: 0, ids: 'all' },
  { at: APPEAR.ocr - 0.5, ids: ['scans', 'ocr', 'read2'] },
  { at: APPEAR.read2 - 0.5, ids: ['ocr', 'read2', 'code'] },
  { at: APPEAR.code - 0.5, ids: ['read2', 'code', 'queue'] },
  { at: APPEAR.queue - 0.5, ids: ['code', 'queue', 'human1'] },
  { at: APPEAR.chain - 0.5, ids: ['queue', 'chain', 'card'] },
  // людина №2 — на словах про конфлікт: кадр на неё и место будущего «Відхилення»; картка — краем сверху
  { at: APPEAR.human2 - 0.5, ids: ['deviations', 'human2'] },
  { at: APPEAR.deadlines - 0.5, ids: ['card', 'deadlines'] },
  { at: APPEAR.deviations - 0.5, ids: ['deadlines', 'deviations', 'human2'] },
  // «І головне» (M): камера отходит на всю петлю — от людини №2 до розпізнавання
  { at: LOOP_ON - 0.3, ids: ['human2', 'chip:0', 'chip:3', 'chip:4', 'chip:5', 'ocr'] },
  // к первой станции: она раскрывается в панель из своего места в мире (loop.tsx)
  { at: APPEAR['chip:0'] - 1.0, ids: ['human2', 'chip:0', 'chip:1', 'chip:2'] },
  // пока идут панели, камера уходит к развилке: последняя панель сжимается в «перевірку на еталоні», значок версии
  // по петле уходит в «Розпізнавання» и «Два читання»
  { at: APPEAR['chip:5'] - 2.6, ids: ['chip:4', 'chip:5', 'ocr', 'read2'] },
  { at: block('b5').from, ids: 'all' },
  { at: block('b6').from, ids: 'all' },
];
export const CAM_MOVE_SEC = 1.4;

/** Субтитр в момент t: предложение (длинное — до запятой/тире), в котором сейчас звучит слово. Текст — дословно, с тире.
 *  Между фразами держится предыдущая, после последнего слова блока — ещё 0.4 с. */
export function subtitleAt(t: number): string | null {
  const b = blockAt(t);
  const v = vblock(b.id);
  if (t < v.words[0].start - 0.1 || t > v.voiceEnd + 0.4) return null;
  let i = 0;
  for (let k = 0; k < v.words.length; k++) if (v.words[k].start - 0.1 <= t) i = k;
  const tokens = b.voice.split(/\s+/).filter(Boolean);
  // номер слова озвучки → индекс токена сценария (тире «—» не слово; «Чотири-п'ять» — два слова в одном токене)
  const wordTok: number[] = [];
  tokens.forEach((tk, k) => tokenize(tk).forEach(() => wordTok.push(k)));
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

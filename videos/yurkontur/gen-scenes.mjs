#!/usr/bin/env node
// Генератор предложения сцен (задача 031, шаги 2–4): videos/yurkontur/scenes.proposed.yaml + бит-лист и карта акцентов
// (markdown → videos/yurkontur/beats.md, вставляется в brief.md). Источник один — код ролика (timeline.ts, stage.ts):
// документы не расходятся с аниматиком. scenes.yaml (невосстановимое, гейт 5) не трогается — утверждает человек.
// Запуск: node --experimental-strip-types --no-warnings videos/yurkontur/gen-scenes.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { ttsHint, ttsText } from '../../voice/pronounce.mjs';
import { APPEAR, BLOCKS, CONTRACT, FLASH, LOOP_DRAW, STAGES, WORDS_PER_SEC, block, wordAt } from '../../src/videos/yurkontur/timeline.ts';
import { EV, STAGE_LIST } from '../../src/videos/yurkontur/stage.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const r1 = (x) => Math.round(x * 10) / 10;
const sentences = (s) => s.split(/(?<=[.!?])\s+/).filter(Boolean);

/** Фрагменты голоса: предложение, время начала/конца (гипотеза темпа), текст для TTS и подсказка произношения. */
function fragments(id) {
  const b = block(id);
  const ss = sentences(b.voice);
  const starts = ss.map((s) => wordAt(id, s.split(/\s+/).slice(0, 3).join(' ')));
  return ss.map((s, i) => {
    const words = s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const end = i + 1 < ss.length ? starts[i + 1] : starts[i] + words / WORDS_PER_SEC;
    const tts = ttsText(s);
    const hint = ttsHint(s);
    return { text: s, from: r1(starts[i]), to: r1(end), ...(tts !== s ? { tts } : {}), ...(hint ? { ttsHint: hint } : {}) };
  });
}

// ---------------------------------------------------------------- события по блокам (t, событие, слова, акцент, узел)
const E = [];
const ev = (b, t, what, opts = {}) => E.push({ block: b, t: r1(t), what, ...opts });
// блок 1 — только «Скани» (панель «Скани»: 25 файлов → стопка); полная сборка — следующая задача
ev('b1', APPEAR.scans, 'Скани появляется и раскрывается в панель', { node: 'scans', accent: 'S' });
ev('b1', EV.scans.b1.list, '25 названий файлов legacy_2 проявляются', { node: 'scans' });
ev('b1', EV.scans.b1.scroll[0], 'список проезжает (≈ 20 px)', { node: 'scans' });
EV.scans.b1.pages.forEach((p, i) => ev('b1', p, `страница ${i + 1} ложится в стопку сканов`, { node: 'scans', accent: i === 0 ? 'S' : undefined }));
ev('b1', block('b1').to - 1.4, 'камера выходит на общий план (силуэт схемы готовится)', {});
// блок 2
ev('b2', FLASH.at, 'вспышка силуэта всей схемы, целиком в кадре', { accent: 'M', words: 'начало блока' });
ev('b2', FLASH.ghostBy, 'схема гаснет до призраков', {});
ev('b2', FLASH.ghostBy + 0.3, 'заголовок «Картка аптеки = план + договір»', {});
ev('b2', EV.b2.open, 'окно стенда: план приміщення крупно, проезд сверху вниз', { words: 'модуль до ALI' });
ev('b2', (EV.b2.planPan[0] + EV.b2.planPan[1]) / 2, 'проезд по плану: КП → МК → Торгова зала', { words: 'єдина база чинних умов' });
ev('b2', EV.b2.room, 'рамка охрой: «Торгова зала»', { words: 'поруч планування', accent: 'S' });
ev('b2', EV.b2.contract, 'вкладка «Договір» крупно', { words: 'і договір' });
ev('b2', EV.b2.rate, 'рамка охрой: «Ставка чинна»', { accent: 'S' });
ev('b2', EV.b2.scan, 'скан крупно: п. 3.1 «24700,00 грн», рамка стенда', { words: 'посилання на місце в скані', accent: 'S' });
ev('b2', EV.b2.close, 'окно стенда уходит одновременно с раскрытием «Скани»', {});
// блок 3а
ev('b3a', EV.scans.b3a.list, 'панель «Скани»: 25 файлов → стопка сканов', { words: 'Спершу система читає скан', node: 'scans' });
ev('b3a', STAGE_LIST.find((s) => s.center === 'ocr').from + 0.6, 'чип «05.12.2013» по входу', { node: 'ocr' });
ev('b3a', APPEAR.ocr, 'Розпізнавання — карточкой справа, раскрывается из неё', { words: 'Те, що звичайне', node: 'ocr', accent: 'S' });
EV.ocr.forEach((c) => ev('b3a', c.at, `вырезка «${c.cause}» → обводка → лоток «людині»`, { node: 'ocr' }));
ev('b3a', APPEAR.read2, 'Два читання — карточкой справа, раскрывается', { words: 'Далі договір читають', node: 'read2', accent: 'S' });
EV.read2.pairs.forEach((p, i) => ev('b3a', p, `пара A/B ${i + 1} совпала — слились`, { node: 'read2' }));
ev('b3a', EV.read2.diverge, '«п. 6.1 / п. 6.14» — расхождение → черга', { node: 'read2', accent: 'S' });
ev('b3a', APPEAR.code, 'Перевірки кодом — раскрывается', { words: 'Код перевіряє', node: 'code', accent: 'S' });
ev('b3a', EV.code.rows[EV.code.failRow], '«сума прописом = цифрами» — красная → черга', { node: 'code' });
ev('b3a', APPEAR.queue, 'Черга перевірки — раскрывается', { words: 'Критичні значення', node: 'queue', accent: 'S' });
ev('b3a', APPEAR.human1, 'Людина №1 — карточкой справа', { words: 'підтверджує юрист або відділ оренди', node: 'human1' });
ev('b3a', EV.queue.click, 'курсор жмёт «Підтвердити»', { node: 'queue', accent: 'S' });
ev('b3a', EV.queue.green, 'значение зеленеет', { node: 'queue' });
ev('b3a', EV.queue.human, 'Людина №1 заливается зелёным', { node: 'human1', accent: 'S' });
// блок 3б
ev('b3b', APPEAR.chain, 'Розбір ланцюга — карточкой справа, раскрывается', { words: 'розбирає ланцюг', node: 'chain', accent: 'S' });
EV.chain.states.forEach((t, i) => ev('b3b', t, `шкала «Чинна редакція на дату» → ${['05.12.2013 · 24 700', '01.03.2015 · 43 155', '01.09.2015 · 48 355'][i]}`, { node: 'chain', words: ['договір, додаткові угоди', 'додаткові угоди', 'Новий документ змінює'][i] }));
ev('b3b', EV.chain.rate, 'рамка охрой: «Ставка чинна 48 355»', { words: 'лише ті умови', node: 'chain' });
ev('b3b', STAGE_LIST.find((s) => s.center === 'card').from - 1.6, 'чип «48 355,00 грн» по выходу → в картку', { node: 'chain' });
ev('b3b', APPEAR.card, 'Картка чинних умов — раскрывается; документы ланцюга', { words: 'Так ставка може прийти', node: 'card', accent: 'S' });
['Ставка', 'Діє до', 'Останній день заяви', 'Площа', 'Комунальні', 'Орендодавець'].forEach((f) => ev('b3b', APPEAR[`field:${f}`], `поле «${f}» + нитка к документу`, { node: 'card' }));
ev('b3b', EV.card.area, 'площа тричі (договір · план БТІ · ліцензія)', { node: 'card' });
ev('b3b', EV.card.conflict, 'конфлікт: «БТІ відрізняється» → Людина №2 (красный чип)', { words: 'суперечать один одному', node: 'human2', accent: 'S' });
ev('b3b', EV.card.resolve, 'Людина №2 решает: граница зелёная', { words: 'Вирішує юрист', node: 'human2' });
// блок 3в
ev('b3c', APPEAR.deadlines, 'Строки — карточкой справа, раскрывается', { words: 'Строки рахують', node: 'deadlines', accent: 'S' });
ev('b3c', EV.deadlines.windows, 'рамка: вікна ≤ 30 / ≤ 90 / ≤ 180 днів', { node: 'deadlines' });
ev('b3c', EV.deadlines.group, 'рамка: группа «≤ 30 днів»', { node: 'deadlines' });
ev('b3c', EV.deadlines.last, 'рамка: строка «Останній день заяви» → проезд к датам', { words: 'останній день заяви', node: 'deadlines' });
ev('b3c', EV.deadlines.auto, 'рамка: строка «Автопролонгація відбулася»', { words: 'автопролонгацію', node: 'deadlines' });
ev('b3c', APPEAR.deviations, 'Відхилення від еталона — раскрывается', { words: 'порівнює з типовим', node: 'deviations', accent: 'S' });
ev('b3c', EV.deviations.split, 'пункт → 4 смислові твердження (умовний приклад)', { words: 'Кожен пункт розкладено', node: 'deviations' });
[0, 1, 2, 3].forEach((i) => ev('b3c', EV.deviations.split + 0.3 + i * 0.35, `твердження ${i + 1}`, { node: 'deviations' }));
ev('b3c', EV.deviations.search, 'поиск каждого твердження по договору (полоса по строкам)', { node: 'deviations' });
ev('b3c', EV.deviations.verdicts, 'вердикты по очереди', { words: 'пропонує вердикт', node: 'deviations' });
ev('b3c', EV.deviations.critical, '«критична умова» — первой; вердикт к Людині №2', { words: 'Ставить його юрист', node: 'human2', accent: 'S' });
// блоки 4–6 — мировая схема (панели и запись — следующая задача)
LOOP_DRAW && ev('b4', block('b4').from, 'камера отходит; под потоком загорается петля', { accent: 'M', words: 'начало блока' });
['рішення людини', 'контрольний приклад', 'щотижневий розбір', 'пропозиція', 'перевірка на еталоні', 'нова версія / відкат'].forEach((s, i) => ev('b4', APPEAR[`chip:${i}`], `станция петли «${s}»`, { node: `chip:${i}`, accent: i === 5 ? 'S' : undefined }));
ev('b4', wordAt('b4', 'Юридичних висновків'), 'граница: «вчиться / не вчиться ніколи: юридичні висновки»', { words: 'Юридичних висновків', accent: 'S' });
ev('b5', block('b5').from, 'выход на всю схему, плотность до максимума', { accent: 'M', words: 'начало блока' });
ev('b5', CONTRACT.from, 'камера ведёт один договор по маршруту', {});
ev('b5', wordAt('b5', 'уся мережа в одному'), 'реєстр «Договори» (запись стенда, шаг 6)', { words: 'уся мережа в одному реєстрі' });
ev('b5', wordAt('b5', 'вирішує завжди людина'), 'договор у Людини №2 → назад в картку', { words: 'вирішує завжди людина', accent: 'S' });
ev('b6', block('b6').from, 'схема приглушается', {});
STAGES.forEach((s, i) => ev('b6', s.at, `этап ${i + 1}: ${['еталон і калібровка', 'пілот на найгірших сканах', 'оцифрування всього корпусу', 'модуль в ALI'][i]}`, { accent: 'S' }));
ev('b6', block('b6').to - 2, 'локап «Юридичний контур АНЦ · модуль до ANC Layout Intelligence»', { accent: 'S' });

const STATUS = { b1: 'сборка — следующая задача (панель «Скани» есть)', b2: 'готово (утверждено)', b3a: 'готово (утверждено)', b3b: 'готово (задача 031, на решение)', b3c: 'готово (задача 031, на решение)', b4: 'мировая схема; сборка — следующая задача', b5: 'мировая схема; сборка и запись стенда — следующая задача', b6: 'мировая схема; сборка — следующая задача' };
const TITLE_NOTE = { b3a: 'спостереження на пілоті (NUMBERS_CHECK стр. 34–35)', b3b: '24 700 → 43 155 → 48 355 грн · три угоди «№ 1» (NUMBERS_CHECK стр. 9)' };
const doc = {
  $comment: 'ПРЕДЛОЖЕНИЕ билдера (задача 031, шаги 2–4), сгенерировано videos/yurkontur/gen-scenes.mjs из кода ролика. Не scenes.yaml: утверждает Олег (гейт 5). Время — гипотеза до озвучки (2.2 слова/с), события привязаны к словам.',
  spec: '1920x1080@60, ~150s, pace: medium, type: presentation, mode: hud, voice: gemini/gemini-3.8-flash-tts/Gero, lang: uk',
  pronounce: 'voice/pronounce.uk.json (ALI → «Алі», су́ми + подсказка); на экране и в субтитрах — исходное написание',
  blocks: BLOCKS.map((b) => ({
    id: b.id,
    from: b.from,
    to: b.to,
    status: STATUS[b.id],
    title: b.title,
    ...(TITLE_NOTE[b.id] ? { titleNote: TITLE_NOTE[b.id] } : {}),
    stages: STAGE_LIST.filter((s) => s.from >= b.from && s.from < b.to).map((s) => ({ from: r1(s.from), panel: s.center, left: s.left, right: s.right })),
    voice: fragments(b.id),
    events: E.filter((e) => e.block === b.id).sort((a, z) => a.t - z.t).map(({ block: _b, ...e }) => e),
  })),
};
writeFileSync(join(ROOT, 'videos/yurkontur/scenes.proposed.yaml'), YAML.stringify(doc, { lineWidth: 0 }));

// ---------------------------------------------------------------- бит-лист и карта акцентов (markdown)
const NAME = { b1: '1', b2: '2', b3a: '3а', b3b: '3б', b3c: '3в', b4: '4', b5: '5', b6: '6' };
const rows = [...E].sort((a, z) => a.t - z.t);
let md = '| Время, с | Шаг, с | Блок | Событие | Слова диктора | Акцент |\n|---|---|---|---|---|---|\n';
let prev = null;
for (const e of rows) {
  md += `| ${e.t.toFixed(1)} | ${prev === null ? '—' : (e.t - prev).toFixed(1)} | ${NAME[e.block]} | ${e.what} | ${e.words ? `«${e.words}»` : ''} | ${e.accent ?? ''} |\n`;
  prev = e.t;
}
let acc = '| Блок | M | S | L |\n|---|---|---|---|\n';
for (const b of BLOCKS) {
  const es = rows.filter((e) => e.block === b.id);
  const fmt = (k) => es.filter((e) => e.accent === k).map((e) => `${e.t.toFixed(1)} ${e.what}`).join('; ') || '—';
  acc += `| ${NAME[b.id]} | ${fmt('M')} | ${fmt('S')} | — |\n`;
}
const gaps = rows.slice(1).map((e, i) => ({ d: e.t - rows[i].t, at: rows[i].t, b: e.block }));
const longest = gaps.filter((g) => ['b2', 'b3a', 'b3b', 'b3c'].includes(g.b)).sort((a, z) => z.d - a.d)[0];
writeFileSync(join(ROOT, 'videos/yurkontur/beats.md'), `<!-- сгенерировано videos/yurkontur/gen-scenes.mjs — не править руками -->\n## Бит-лист (весь ролик)\nВремя — гипотеза до озвучки (2.2 слова/с); события привязаны к словам. Блоки 2–3в собраны (самый длинный промежуток между событиями — ${longest.d.toFixed(1)} с на ${longest.at.toFixed(1)} с); блоки 1, 4–6 — план для следующей задачи.\n\n${md}\n## Карта акцентов\nБюджет: 0 L, ≤ 3 M (вспышка схемы в блоке 2, включение петли в блоке 4, выход на весь механизм в блоке 5). S — смены панели, рамки, конфлікт, подтверждения.\n\n${acc}`);
console.log(`OK: scenes.proposed.yaml (${doc.blocks.length} блоков, ${E.length} событий), beats.md; макс. промежуток 2–3в ${longest.d.toFixed(2)} с`);

// Тесты разбора аутро MIA v4 (задача 030): схема outro.v4-picks.yaml рядом с v3, проверки in: lockCarry / lightMatch,
// ссылки и громкость sfx.events, часы карточки «досье», label. Запуск: npm run test:mia [-- --negative]
// --negative — позитивный контроль (гейт 4): добавляет заведомо неверное ожидание и ОБЯЗАН упасть.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildTimeline, dbIn, dossierClock, isDossier, isSfxV4, labelText, parseAt, parseOutro } from './model.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (f: string) => parse(readFileSync(join(ROOT, 'videos', 'mia-outro', f), 'utf8'));
let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const throwsWith = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test(String((e as Error).message)); } };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const v3raw = read('outro.yaml');
const v4raw = read('outro.v4-picks.yaml');
const v3 = parseOutro(v3raw);
const v4 = parseOutro(v4raw);
expect('v3 разбирается как поп-арт и звук v3', !isDossier(v3.card) && !isSfxV4(v3.episodes.ep01.sfx));
expect('v4 разбирается как досье и звук v4 (events)', isDossier(v4.card) && isSfxV4(v4.episodes.ep01.sfx));
const t3 = buildTimeline(v3, 'ep01');
const t4 = buildTimeline(v4, 'ep01');
expect('таймлайны v3 и v4 совпадают по кадрам (v4 меняет только приёмы)', t3.items.map((p) => `${p.startFrame}-${p.endFrame}`).join() === t4.items.map((p) => `${p.startFrame}-${p.endFrame}`).join());
expect('v4: 2 склейки in: cut (V10:97, V12:1)', t4.items.filter((p) => 'in' in p && p.in === 'cut').map((p) => `${'src' in p ? p.src : ''}:${'from' in p ? p.from : ''}`).join() === 'V10:97,V12:1');

// in: lockCarry / lightMatch — только в своих местах
const badCarry = clone(v4raw);
badCarry.episodes.ep01.timeline[8].in = 'lockCarry'; // JAX после V9 — live, допустимо; ставим на финал → ошибка
badCarry.episodes.ep01.timeline[13].in = 'lockCarry';
expect('lockCarry на финале → громкий отказ', throwsWith(() => parseOutro(badCarry), /in: lockCarry/));
const badLight = clone(v4raw);
badLight.episodes.ep01.timeline[12].in = 'lightMatch';
expect('lightMatch на затишье → громкий отказ', throwsWith(() => parseOutro(badLight), /in: lightMatch/));
const carryOnPop = clone(v3raw);
carryOnPop.episodes.ep01.timeline[6].in = 'lockCarry';
expect('lockCarry при поп-арт карточке v3 → громкий отказ', throwsWith(() => parseOutro(carryOnPop), /in: lockCarry/));
const noAccent = clone(v4raw);
delete noAccent.card.accent.BLOND;
expect('нет card.accent героя → громкий отказ', throwsWith(() => parseOutro(noAccent), /accent: нет цвета героя BLOND/));

// sfx.events: ссылки и громкость
expect('parseAt: V3:228', JSON.stringify(parseAt('V3:228')) === '{"kind":"item","src":"V3","from":228}');
expect('parseAt: h9 − 0.4 с', JSON.stringify(parseAt('h9 − 0.4 с')) === '{"kind":"hit","hit":9,"minusSec":0.4}');
expect('parseAt: card:OFFICER, card.freeze, card.lock', parseAt('card:OFFICER')?.kind === 'card' && parseAt('card.freeze')?.kind === 'cardFreeze' && parseAt('card.lock')?.kind === 'cardLock');
expect('parseAt: мусор → null', parseAt('после удара') === null);
expect('dbIn: «−8 дБ к музыке» → −8, «−14 дБ, тихий» → −14, без числа → null', dbIn('−8 дБ к музыке, HPF 100 Гц') === -8 && dbIn('−14 дБ, тихий UI-тик') === -14 && dbIn('короткий срез') === null);
const badAt = clone(v4raw);
badAt.episodes.ep01.sfx.events[0].at = 'V3:229';
expect('at на несуществующий пункт → громкий отказ', throwsWith(() => parseOutro(badAt), /не указывает ровно на один пункт/));
const noDb = clone(v4raw);
noDb.episodes.ep01.sfx.events[3].why.mix = 'тихий UI-тик';
expect('нет «−N дБ» в why.mix → громкий отказ', throwsWith(() => parseOutro(noDb), /нет громкости/));
const noWhy = clone(v4raw);
delete noWhy.episodes.ep01.sfx.events[1].why.gap;
expect('нет why.gap («нет одного из трёх — звука нет») → громкий отказ', throwsWith(() => parseOutro(noWhy), /не по схеме/));

// часы карточки «досье» и label
if (isDossier(v4.card)) {
  const c = dossierClock(v4.card, false, 31);
  expect('часы: фриз 2, скан 2–12, рамка 7–11, label 11–22 (31 симв. по 1/3 кадра)', c.mixEnd === 2 && c.scanStart === 2 && c.scanEnd === 12 && c.lockStart === 7 && c.lockEnd === 11 && c.labelStart === 11 && c.labelEnd === 22, JSON.stringify(c));
  const cc = dossierClock(v4.card, true, 30);
  expect('часы lockCarry: рамка 0–4, label с 4', cc.lockStart === 0 && cc.lockEnd === 4 && cc.labelStart === 4);
  expect('label JAX — 35 символов, допечатан внутри карточки (33 кадра)', dossierClock(v4.card, false, labelText(v4.card.label.format, 3, 'JAX', 'Friend or enemy?').length).labelEnd < 33);
}
expect('labelText: SUBJECT 01 · MIA · THE INVENTOR', labelText('SUBJECT {nn} · {NAME} · {TAGLINE}', 1, 'Mia', 'The Inventor') === 'SUBJECT 01 · MIA · THE INVENTOR');

if (process.argv.includes('--negative')) expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: заведомо неверно — v4 разбирается как поп-арт', !isDossier(v4.card));
console.log(failed ? `\nПРОВАЛ: ${failed}` : '\nOK');
process.exit(failed ? 1 : 0);

// Тест защиты latinOnly (решение Олега 2026-10-18): node --experimental-strip-types src/theme/fonts.test.ts [--negative]
// --negative — позитивный контроль: «ЇЖАК» шрифтом Anton обязан быть отвергнут, а тест ожидает обратного → красный.
import { FONTS, fontFor, latinOnlyViolation } from './fonts.ts';

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const throws = (f: () => unknown) => { try { f(); return ''; } catch (e) { return (e as Error).message; } };

expect('Anton помечен latinOnly', Boolean(FONTS.Anton.latinOnly));
expect('Anton + латиница (MIA, ROOK, JAX, HALE, SHE BUILT…): без ошибки', ['MIA', 'ROOK', 'JAX', 'HALE', "She built the future. They came to take it."].every((t) => latinOnlyViolation('Anton', t) === null));
const e1 = throws(() => fontFor('Anton', 'ЇЖАК'));
expect('fontFor(Anton, «ЇЖАК») — громкая ошибка', /latinOnly/.test(e1), e1);
expect('Anton + ’ (U+2019) — ошибка', latinOnlyViolation('Anton', 'MIA’S') !== null);
expect('Anton + кириллица в середине латиницы — ошибка', latinOnlyViolation('Anton', 'MIА') !== null, 'вторая «А» — кириллица U+0410');
expect('Oswald (не latinOnly) + кириллица — без ошибки', fontFor('Oswald', 'ЇЖАК') === "'RM Oswald'");

if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: «ЇЖАК» шрифтом Anton принят (заведомо неверно)', latinOnlyViolation('Anton', 'ЇЖАК') === null, String(latinOnlyViolation('Anton', 'ЇЖАК')));
}
if (failed) { console.error(`\nПРОВАЛ: ${failed}`); process.exit(1); }
console.log('\nOK: fonts latinOnly');

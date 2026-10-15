// Тест CountUp (#007): npm run test:countup  (node --experimental-strip-types src/elements/countup.test.ts)
// `--negative` — позитивный контроль (гейт 4): добавляет тест с заведомо неверным ожиданием и ОБЯЗАН упасть.
import { SPEC, alpha, barFill, chipBob, chipScale, countValue, formatUk, landScale } from './countup.ts';

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const FPS = 30;

// --- значение на границах окна счёта
expect('на 0.45 с = from (0)', countValue(0.45, 2480) === 0, String(countValue(0.45, 2480)));
expect('на 0.45 с = from (from=100)', countValue(0.45, 2480, 100) === 100, String(countValue(0.45, 2480, 100)));
expect('на 2.9 с = target (2480)', countValue(2.9, 2480) === 2480, String(countValue(2.9, 2480)));
expect('на 2.9 с = target (97)', countValue(2.9, 97) === 97, String(countValue(2.9, 97)));
expect('до 0.45 с и после 2.9 с — константы', countValue(0, 2480) === 0 && countValue(4.5, 2480) === 2480);
expect('формула: 1.0 с = round(2480·(1 − (1 − p)^4))', countValue(1.0, 2480) === Math.round(2480 * (1 - Math.pow(1 - 0.55 / 2.45, 4))), String(countValue(1.0, 2480)));

// --- монотонность по каждому кадру 0..5 с
let mono = true;
let prev = -Infinity;
for (let f = 0; f <= 5 * FPS; f++) {
  const v = countValue(f / FPS, 2480);
  if (v < prev) mono = false;
  prev = v;
}
expect('монотонно не убывает по кадрам 0..150', mono);

// --- формат: неразрывный пробел U+00A0
expect('формат 2480 → "2\\u00A0480"', formatUk(2480) === '2 480', JSON.stringify(formatUk(2480)));
expect('формат 1234567 → "1 234 567" (U+00A0)', formatUk(1234567) === '1 234 567');
expect('формат 97 и 0 без разделителя', formatUk(97) === '97' && formatUk(0) === '0');
expect('в формате нет обычного пробела U+0020', !formatUk(2480).includes(' '));

// --- приземление и чип
expect('масштаб = 1 до 2.9 с и на 2.9 с', landScale(2.0) === 1 && landScale(2.9) === 1);
expect('масштаб: 1 + 0.07·e^(−7t)·cos(15t)', landScale(3.0) === 1 + 0.07 * Math.exp(-0.7) * Math.cos(1.5), String(landScale(3.0)));
expect('чип = 0 до 0.35 с', chipScale(0.3) === 0);
expect('чип: пружина перелетает 1', chipScale(0.35 + 0.2) > 1, String(chipScale(0.55)));
expect('дрожь чипа = 0 после 2.9 с', chipBob(3.2) === 0);
expect('дрожь чипа ≤ 6 px', Array.from({ length: 151 }, (_, f) => Math.abs(chipBob(f / FPS))).every((v) => v <= SPEC.shakePx));
expect('полоса: value/target', barFill(1240, 2480) === 0.5 && barFill(2480, 2480) === 1);

// --- fade-in / уход
expect('fade-in: 0 до 0.1 с, 1 с 0.4 с', alpha(0.1) === 0 && alpha(0.4) === 1);
expect('без exitAtSec ухода нет', alpha(10) === 1 && chipScale(10) > 0.99);
expect('exitAtSec=4: число 0 к 4.4 с, чип 0 к 4.3 с', alpha(4.4, 4) === 0 && chipScale(4.3, 4) === 0);

// --- детерминизм: два прогона по всем кадрам совпадают побитно
const run = () => Array.from({ length: 151 }, (_, f) => {
  const t = f / FPS;
  return [countValue(t, 2480), landScale(t), chipScale(t), chipBob(t), alpha(t), formatUk(countValue(t, 2480))];
});
expect('детерминизм: два прогона совпадают', same(run(), run()));

// --- позитивный контроль: заведомо неверное ожидание обязано упасть
if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: формат 2480 == "2 480" с обычным пробелом (заведомо неверно)', formatUk(2480) === '2 480');
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: на 0.45 с уже target (заведомо неверно)', countValue(0.45, 2480) === 2480);
}

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log('\nOK: countup');

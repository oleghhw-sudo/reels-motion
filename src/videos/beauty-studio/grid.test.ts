// Тест сетки: node --experimental-strip-types src/videos/beauty-studio/grid.test.ts
// Позитивный контроль (гейт 4): заведомо плохие входы обязаны падать — иначе тест сам сломан.
import { gridProblems, offGrid, type MusicGrid } from './grid.ts';

const G: MusicGrid = {
  beatSec: 0.488,
  barSec: 1.952,
  downbeatsSec: [0.065, 2.017, 3.969, 5.921, 7.873, 9.825, 11.777, 13.729, 15.681, 17.633, 19.585, 21.537, 23.489, 25.441, 27.393, 29.345, 31.297],
};
let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};

// зелёное: границы ролика (сильные доли и половины тактов)
const good = [3.969, 7.873, 12.753, 17.633, 20.561, 23.489, 27.393];
expect('границы ролика на сетке', offGrid(good, G).length === 0, JSON.stringify(offGrid(good, G)));
expect('сетка согласована', gridProblems(G).length === 0, gridProblems(G).join('; '));

// красное: сдвиг на 1 кадр (33 мс) и на четверть доли обязаны ловиться
const shifted = offGrid([3.969 + 1 / 30, 12.753 + 0.122], G);
expect('сдвиг на кадр и на 1/4 доли ловится (позитивный контроль)', shifted.length === 2, JSON.stringify(shifted));
const badGrid = { ...G, downbeatsSec: [...G.downbeatsSec.slice(0, 5), 9.9, ...G.downbeatsSec.slice(6)] };
expect('битая сетка ловится (позитивный контроль)', gridProblems(badGrid).length > 0, gridProblems(badGrid).join('; '));

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log('\nOK: сетка');

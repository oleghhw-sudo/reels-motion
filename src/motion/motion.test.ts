// Тест библиотеки движения: npm run test:motion  (node --experimental-strip-types src/motion/motion.test.ts)
// `--negative` — позитивный контроль (гейт 4): добавляет тест с заведомо неверным ожиданием и ОБЯЗАН упасть.
import {
  EASINGS,
  T80,
  arcPt,
  beatN,
  gridFromBeat,
  jump,
  kick,
  onTwos,
  pulse,
  ribbon,
  ring,
  ringEvents,
  shakeXY,
  take,
  through,
} from './index.ts';

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// --- детерминизм: один вход → один выход (сравнение по JSON, все функции)
const runAll = () => ({
  ring: [0, 0.05, 0.3, 1].map((t) => ring(t)),
  kick: kick(0.1),
  take: take(1.05, 1),
  jump: jump(0.5, 0.2, 0.8, 100),
  pulse: pulse(1.23, gridFromBeat(0.488, 0.065)),
  shake: shakeXY(17, 3, 12),
  twos: onTwos(37, 30),
  arc: arcPt([0, 0], [100, 0], 40, 0.3),
  through: through([[0, 0], [50, 80], [100, 0], [150, 40]]),
  ribbon: ribbon([[0, 0], [50, 80], [100, 0]], 20, 4),
  ease: Object.values(EASINGS).map((e) => e(0.37)),
});
expect('детерминизм: два прогона совпадают побитно', same(runAll(), runAll()));

// --- границы ring
expect('ring = 0 до события', ring(-0.5) === 0);
expect('ring = 0 в момент события (sin 0)', ring(0) === 0);
expect('ring → 0 при больших t (|ring(3 с)| < 1e-6)', Math.abs(ring(3)) < 1e-6, String(ring(3)));
expect('ring ненулевой сразу после события', Math.abs(ring(0.05)) > 0.3, String(ring(0.05)));
expect('ringEvents = сумма ring', near(ringEvents(1.1, [0.5, 1]), ring(0.6) + ring(0.1)));

// --- jump: 0 на старте и конце полёта
const J = (t: number) => jump(t, 1, 1.6, 200);
expect('jump: dy = 0 задолго до отрыва и sq = 0', J(0).dy === 0 && J(0).sq === 0);
expect('jump: dy = 0 в момент отрыва', J(1).dy === 0, String(J(1).dy));
expect('jump: dy = 0 при приземлении', J(1.6).dy === 0, String(J(1.6).dy));
expect('jump: вершина = −h посередине', near(J(1.3).dy, -200, 1e-9), String(J(1.3).dy));
expect('jump: присед перед отрывом (sq > 0)', J(0.95).sq > 0, String(J(0.95).sq));
expect('jump: сплющивание затухает (|sq(+2 с)| < 1e-6)', Math.abs(J(3.6).sq) < 1e-6, String(J(3.6).sq));
expect('take: 0 до антиципации, затухает к 3 с', same(take(0, 1), { sq: 0, dy: 0 }) && Math.abs(take(4, 1).sq) < 1e-6);

// --- доли
const G = gridFromBeat(0.488, 0.065);
expect('pulse = 1 ровно на доле', near(pulse(0.065 + 3 * 0.488, G), 1, 1e-9));
expect('pulse затухает к концу доли', pulse(0.065 + 0.48, G) < 0.01);
expect('beatN: номер доли', beatN(0.065 + 5 * 0.488 + 0.01, G) === 5 && beatN(0, G) === -1);
expect('pulse subdiv=2: 1 на восьмой', near(pulse(0.065 + 0.244, G, 6, 2), 1, 1e-9));

// --- shakeXY: меняется между кадрами, совпадает при повторе, в пределах amp
const s1 = shakeXY(10, 7, 12);
expect('shakeXY совпадает при повторе', same(s1, shakeXY(10, 7, 12)));
expect('shakeXY меняется между кадрами', !same(s1, shakeXY(11, 7, 12)));
expect('shakeXY зависит от seed', !same(s1, shakeXY(10, 8, 12)));
let inRange = true;
for (let f = 0; f < 300; f++) for (const v of shakeXY(f, 1, 12)) if (Math.abs(v) > 12) inRange = false;
expect('shakeXY в пределах ±amp на 300 кадрах', inRange);

// --- onTwos
const held = Array.from({ length: 12 }, (_, f) => onTwos(f, 30));
expect('onTwos 30 fps, 12/с: удержания 3-2-3-2', same(held, [0, 0, 0, 3, 3, 5, 5, 5, 8, 8, 10, 10]), JSON.stringify(held));
expect('onTwos строгие двойки (15/с на 30 fps)', same([0, 1, 2, 3, 4].map((f) => onTwos(f, 30, 15)), [0, 0, 2, 2, 4]));
expect('onTwos идемпотентна и ≤ кадра', held.every((h, f) => h <= f && onTwos(h, 30) === h));

// --- траектории
expect('arcPt: концы на месте, вершина на h', same(arcPt([0, 0], [100, 0], 40, 0), [0, 0]) && same(arcPt([0, 0], [100, 0], 40, 1), [100, 0]) && near(arcPt([0, 0], [100, 0], 40, 0.5)[1], -40));
const C = through([[0, 0], [50, 80], [100, 0], [150, 40]], 6);
expect('through: проходит через контрольные точки', same(C[0], [0, 0]) && near(C[6][0], 50) && near(C[6][1], 80) && same(C[C.length - 1], [150, 40]));
expect('ribbon: замкнутый контур 2×(отсчёты)', ribbon([[0, 0], [50, 80], [100, 0]], 20, 4).length === 2 * through([[0, 0], [50, 80], [100, 0]]).length);

// --- easing: границы и t80 по формулам
for (const [name, e] of Object.entries(EASINGS)) {
  expect(`${name}: e(0)=0, e(1)=1`, near(e(0), 0) && near(e(1), 1));
  // t80 численно (бисекция: кривые монотонны)
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (e(m) < 0.8) lo = m;
    else hi = m;
  }
  const t80 = T80[name as keyof typeof T80];
  expect(`${name}: T80 = ${t80} совпадает с формулой (±0.01)`, Math.abs(lo - t80) <= 0.01, `по формуле ${lo.toFixed(4)}`);
}

// --- позитивный контроль: заведомо неверное ожидание обязано упасть
if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: ring(0.05) == 0 (заведомо неверно)', ring(0.05) === 0, String(ring(0.05)));
}

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log('\nOK: motion');

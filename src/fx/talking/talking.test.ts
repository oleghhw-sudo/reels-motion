// Тесты каркаса эффектов говорящей головы (задача 026-А). Запуск: npm run test:talking [-- --negative]
// --negative — позитивный контроль (гейт 4): заведомо неверные ожидания, прогон ОБЯЗАН упасть.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { BACK, backEnv, travel, windowOf } from './window.ts';
import { checkFace, parsePlan, type Plan } from './plan.ts';
import { bignum, boxOf, figma, figmaBox, lens } from './effects.ts';
import { loadFace } from '../../matte/face.ts';

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failed++; };
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const throwsWith = (fn: () => unknown, re: RegExp): boolean => { try { fn(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ---------------------------------------------------------------- окно
const w = { t0: 2, t1: 3.5 };
expect('windowOf: u, d, p, inside', (() => { const s = windowOf(2.5, w); return near(s.u, 0.5) && near(s.d, 1.5) && near(s.p, 1 / 3) && s.inside; })());
expect('windowOf: до/после окна — не inside, p клампится', !windowOf(1.9, w).inside && !windowOf(3.5, w).inside && windowOf(9, w).p === 1 && windowOf(-1, w).p === 0);
expect('backEnv: 0 на краях (u = 0, u = d) и вне окна', backEnv(0, 1.5) === 0 && backEnv(1.5, 1.5) === 0 && backEnv(-0.1, 1.5) === 0 && backEnv(2, 1.5) === 0);
expect('backEnv: 1 в середине, спад за последние back секунд', backEnv(0.7, 1.5) === 1 && backEnv(1.5 - BACK.default / 2, 1.5) < 1 && backEnv(1.5 - BACK.default / 2, 1.5) > 0);
expect('backEnv: хвост в пределах 0.2–0.35 с', backEnv(1.5 - 0.36, 1.5) === 1 && backEnv(1.5 - 0.19, 1.5) < 1);
expect('backEnv: монотонно растёт на подъёме и падает в хвосте', backEnv(0.02, 1.5) < backEnv(0.05, 1.5) && backEnv(1.3, 1.5) > backEnv(1.4, 1.5) && backEnv(1.4, 1.5) > backEnv(1.49, 1.5));
expect('travel: 0 в начале, 1 к началу хвоста', travel(0, 1.5) === 0 && travel(1.5 - BACK.default, 1.5) === 1 && travel(0.6, 1.5) > 0 && travel(0.6, 1.5) < 1);

// ---------------------------------------------------------------- эффекты (чистые функции)
const b0 = bignum(0, 2), bMid = bignum(1, 2), bEnd = bignum(2, 2);
expect('bignum: на краях невидим, в середине масштаб 1 и всплытие −12 px', b0.opacity === 0 && bEnd.opacity === 0 && near(bMid.scale, 1, 1e-3) && near(bMid.dy, -12, 1e-6) && bMid.opacity === 1);
expect('bignum: вход из 112 % и размытия', bignum(0.02, 2).scale > 1.05 && bignum(0.02, 2).blur > 10);
const fxF = parsePlan({ matteId: 'x', video: { file: 'v.mp4' }, effects: [{ fx: 'figma', t0: 1, t1: 2.6, word: 'виділення', italic: 'л', badge: 'Олег', under: [{ at: 1.0, text: 'як у Фігмі' }] }] }).effects[0];
if (fxF.fx !== 'figma') throw new Error('тип');
const fS = figma(1.2, 1.6, fxF);
expect('figma: 9 букв, буква «л» курсивом один раз, появление по 0.022 с (первая видна, последняя ещё нет на u=0.1)', fS.letters.length === 9 && fS.letters.filter((l) => l.italic).length === 1 && figma(0.1, 1.6, fxF).letters[0].opacity > 0.5 && figma(0.1, 1.6, fxF).letters[8].opacity === 0);
expect('figma: ширина бокса ×1.28 ≤ 820 и внутри safe zones, растяжение ×1.28 после 0.55 окна', fS.w * 1.28 <= 820 && fS.x >= 64 && fS.x + fS.w * 1.28 <= 940 && near(figma(1.59, 1.6, fxF).stretch, 1.28, 0.02) && figma(0.8, 1.6, fxF).stretch === 1);
expect('figma: рамка 0 до 0.22 с, 1 после 0.52 с', figma(0.2, 1.6, fxF).frame === 0 && figma(0.6, 1.6, fxF).frame > 0.99);
expect('figmaBox: верх ниже 1200 при y 1352 (не на лице talk-3)', figmaBox(fxF).y > 1200 && figmaBox(fxF).x >= 64);
const fxL = parsePlan({ matteId: 'x', video: { file: 'v.mp4' }, effects: [{ fx: 'lens', t0: 0, t1: 1.2 }] }).effects[0];
if (fxL.fx !== 'lens') throw new Error('тип');
expect('lens: от (250,1290) к (830,1290), r 140 → вход из 60 %, дуга вверх в середине', near(lens(0, 1.2, fxL).cx, 250) && near(lens(0, 1.2, fxL).r, 140 * 0.6, 1e-6) && lens(0.46, 1.2, fxL).cy < 1290 && near(lens(1.2 - BACK.default, 1.2, fxL).cx, 830, 1e-6));
expect('lens: растворение в хвосте', lens(1.19, 1.2, fxL).opacity < 0.2 && lens(0.6, 1.2, fxL).opacity === 1);

// ---------------------------------------------------------------- план: схема и отказы (гейт 3/4)
const base = { matteId: 'x', video: { file: 'v.mp4' } };
expect('parsePlan: пересечение окон — отказ', throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'lens', t0: 0, t1: 1.2 }, { fx: 'bignum', t0: 1.0, t1: 3.0, text: '1' }] }), /пересекаются/));
expect('parsePlan: окно короче минимума — отказ', throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'figma', t0: 0, t1: 1.0, word: 'слово', italic: 'с', badge: 'О' }] }), /вне 1.4–2 с/));
expect('parsePlan: окно длиннее максимума — отказ', throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'lens', t0: 0, t1: 2.0 }] }), /вне 0.9–1.4 с/));
expect('parsePlan: слово длиннее лимита — отказ', throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'figma', t0: 0, t1: 1.6, word: 'надзвичайнодовге', italic: 'н', badge: 'О' }] }), /слово ≤ 10 букв/));
expect('parsePlan: курсивной буквы нет в слове — отказ', throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'figma', t0: 0, t1: 1.6, word: 'слово', italic: 'я', badge: 'О' }] }), /курсивных букв/));
expect('parsePlan: цифра не 1–2 знака — отказ', throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'bignum', t0: 0, t1: 2, text: '123' }] }), /цифра/));
expect('parsePlan: порядок сортируется по t0', parsePlan({ ...base, effects: [{ fx: 'lens', t0: 5, t1: 6 }, { fx: 'bignum', t0: 0, t1: 2, text: '1' }] }).effects[0].fx === 'bignum');
const pilot: Plan = parsePlan(parse(readFileSync(new URL('../../../videos/talking-fx-pilot/talking-fx.yaml', import.meta.url), 'utf8')));
expect('пилотный план: 3 эффекта (bignum, figma, lens), звук — данные с уровнями ≤ 0 dB', pilot.effects.map((e) => e.fx).join() === 'bignum,figma,lens' && pilot.effects.every((e) => e.sound.length >= 2 && e.sound.every((s) => s.levelDb <= 0)));

// ---------------------------------------------------------------- лицо: отказы
const faceOk = loadFace({ fps: 30, frames: Array.from({ length: 300 }, (_, i) => ({ t: i / 30, cx: 540, cy: 760, w: 260, source: 'vision' })) });
const faceLow = loadFace({ fps: 30, frames: Array.from({ length: 300 }, (_, i) => ({ t: i / 30, cx: 540, cy: 1300, w: 600, source: 'vision' })) });
const faceGone = loadFace({ fps: 30, frames: Array.from({ length: 300 }, (_, i) => ({ t: i / 30, cx: null, cy: null, w: null, source: 'none' })) });
const planF = parsePlan({ ...base, effects: [{ fx: 'figma', t0: 1, t1: 2.6, word: 'виділення', italic: 'л', badge: 'Олег' }] });
const planB = parsePlan({ ...base, effects: [{ fx: 'bignum', t0: 1, t1: 3, text: '3' }] });
const planL = parsePlan({ ...base, effects: [{ fx: 'lens', t0: 1, t1: 2.2 }] });
expect('checkFace: figma при лице вверху — 0 пересечений, зазор > 0', checkFace(planF, faceOk, 30, boxOf)[0].overlaps === 0 && checkFace(planF, faceOk, 30, boxOf)[0].minGap > 0);
expect('checkFace: figma на лице (лицо низко) — отказ (позитивный контроль)', throwsWith(() => checkFace(planF, faceLow, 30, boxOf), /на лице/));
expect('checkFace: lens на лице (лицо низко) — отказ', throwsWith(() => checkFace(planL, faceLow, 30, boxOf), /на лице/));
expect('checkFace: bignum без лица — отказ (позитивный контроль)', throwsWith(() => checkFace(planB, faceGone, 30, boxOf), /без головы/));
expect('checkFace: bignum с лицом — ок, 60 кадров', checkFace(planB, faceOk, 30, boxOf)[0].frames === 60 && checkFace(planB, faceOk, 30, boxOf)[0].noFace === 0);

if (process.argv.includes('--negative')) {
  console.log('ПОЗИТИВНЫЙ КОНТРОЛЬ: заведомо неверные ожидания (backEnv(0) === 1; пересечение окон проходит) — обязаны упасть');
  expect('negative: backEnv(0, 1.5) === 1', backEnv(0, 1.5) === 1);
  expect('negative: пересечение окон принимается', !throwsWith(() => parsePlan({ ...base, effects: [{ fx: 'lens', t0: 0, t1: 1.2 }, { fx: 'bignum', t0: 1.0, t1: 3.0, text: '1' }] }), /пересекаются/));
}
console.log(failed ? `ПРОВАЛ: ${failed}` : 'OK');
process.exit(failed ? 1 : 0);

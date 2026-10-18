# 003 — Порт M.track / M.ctrack / M.vis (Barty-Bart, MIT) в src/motion

Статус: ПОГЛОЩЕНА задачей 011 (2026-10-18) — не выполнять отдельно · Ориентир: 30 мин · Полный рендер: НЕ нужен · Зависит: нет (можно параллельно с 002)
Источник: https://github.com/Barty-Bart/motion-graphics коммит 3d83d98, файл `skills/motion-broll/engine/motion.js` (MIT). Разбор: docs/EFFECTS_PANTRY.md раздел F.

## Цель
Ядро для анимаций «по событиям» (в т. ч. по словам диктора, задача 004): значение, которое много раз меняет цель, = сумма замкнутых пружин, по одной на каждую смену.

## Что сделать
1. Получить исходник по закреплённому коммиту:
   `git clone https://github.com/Barty-Bart/motion-graphics /tmp/bb && git -C /tmp/bb checkout 3d83d98` — читать только `skills/motion-broll/engine/motion.js`. Ничего из репо не запускать.
2. `src/motion/track.ts` — перенос на TypeScript, чистые функции от `t` (секунды):
   - `springStep(tau, w, z)` — замкнутая переходная функция 0→1 (недо-, пере- и критическое демпфирование, `w = Infinity` → 1);
   - `track(v0, keys: [t, value, spring?][], def = MORPH, period = 0) → (t) => number`;
   - `ctrack(hex0, keys, def = [20, 1], period = 0) → (t) => string` (цвет по каналам);
   - `step(v0, keys) → (t) => value`;
   - `vis(t, tin, tout, opts)` — смена содержимого (din .07, lin .26, lout .12, blur 12 — значения как в источнике);
   - пресеты `MORPH [15,.84]`, `FAST [27,.86]`, `SLOW [12.5,.9]`, `SOFT [10,.95]`, `CAM [7.5,1]`, `INSTANT [Infinity,1]` — пометить комментарием «гипотеза, калибровать на эталоне».
   - Шапка файла: `// Ported from Barty-Bart/motion-graphics @3d83d98 · MIT License (c) <автор из их LICENSE>` + полный текст лицензии MIT в `src/motion/THIRD-PARTY-LICENSES.md`.
   - Не дублировать то, что уже есть в `src/motion/index.ts` (clamp, lerp, кривые) — импортировать.
3. Экспорт из `src/motion/index.ts`.
4. Тесты `src/motion/track.test.ts` (в `npm run test:motion`):
   - `track` с одной сменой → в момент события = v0, при t→∞ → цель; с периодом и замкнутым циклом: f(0) ≈ f(period);
   - сравнение с эталонными значениями, посчитанными ОРИГИНАЛЬНЫМ JS (запустить исходный motion.js в node через vm на 5–10 точках и вписать числа в тест как константы; точность 1e-9);
   - `springStep` для трёх режимов демпфирования монотонно/с перелётом как ожидается;
   - позитивный контроль: `--negative` обязан упасть.
5. Плитка в `src/labs/MotionLab.tsx`: точка, которая 4 раза меняет цель по `track` (MORPH), и цвет по `ctrack`.

## Проверки (в отчёт — команды и вывод)
`npm run test:motion` (+ `-- --negative` красный), `npx tsc --noEmit`, 2 стилла MotionLab.

## Вне рамок
Резолвер слов (004), камера, звук.

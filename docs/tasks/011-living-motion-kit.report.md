# Отчёт: 011-living-motion-kit — часть 011-А (ядро `src/motion/`)
Статус: готово (только 011-А; 011-Б не начата — ждёт ревью архитектора)
Время: ~85 мин

## Сделано
Источники склонированы во временную папку сессии (не в репо) на закреплённых коммитах: cinetic `ecfa6605de1adb9345ce937724810dc32267d068`, product-film-skill `fe11efc429d5903e37274d0b294e1b95745b2881`, Barty-Bart `3d83d987d658601d8a1269eb691622bdcd427335`. Из них ничего не запускалось, кроме подсчёта эталонных чисел.

1. **`spring.ts`.**
   - `step` — замкнутая форма (недо-, критическое и передемпфирование, `clamp`); `track` — сумма шагов по ключам; `critical`. Взято из product-film.
   - `ctrack` — трекинг по каналам OKLab, один раз округлено в sRGB (из cinetic `color.ts`).
   - `vis` — смена содержимого из Barty-Bart, умолчания источника: din 0.07, lin 0.26, lout 0.12, blur 12.
2. **`color.ts`.** `toLab`, `fromLab`, `mixColor` из cinetic, без изменений математики.
3. **`tokens.ts`.**
   - `E` — все 16 кривых `anim.ts`, включая rest/contact/whip/dolly/type/expo, на `Easing.bezier` Remotion, как в источнике.
   - `SPR` — snap, pop, land, micro, firm, soft, heavy, calm, word, detent, а также glide 150/20/1 и camera 120/30/1.2.
   - `PACE {calm, crisp}` в секундах; `f60`, `easeOf`, `holdFor`, `revealFor`.
   - Функции: `hitPulse`, `durFor`, `arrive`, `depart`, `arriveK`, `squash`, `stagger`, `inertia`, `blurIn`, `blurOut`, `rand` (FNV).
4. **`sync.ts`.**
   - `peak`, `delayTo`, `hit`, `settleOf` (из cinetic).
   - `Grid`, `at` (из product-film) и сетка `b(grid)(bar, beat, fraction)`.
   - `gridFromBeats(json)` принимает формат beat-sync `{bpm, firstDownbeat, beatsPerBar}` и формат product-film; при плохих полях — громкая ошибка. Путь к файлу не зашит (гейт 2).
5. **`camera.ts`.**
   - `camera` — ключи на пружине, зум в лог-пространстве; `project` и `worldTransform` получают размер кадра параметром — из `useVideoConfig()`, не константой.
   - Из cinetic: `Shot`, `lc`, `lmix`, `breath`, `dip`, `toScreen` и `shotStyle` (это `camera()` cinetic под другим именем).
6. **`move.ts`.** `move` (magic move на `SPR.glide`), `swapIn`, `Rect`, `center`.
7. **Шапки и лицензии.** У каждого файла шапка `// Ported from <repo> @<commit> · MIT (c) <автор>`. Полные тексты LICENSE — дословно в `src/motion/THIRD-PARTY-LICENSES.md`.
8. **Тесты.**
   - `src/motion/kit.test.ts` — 69 проверок. Общий запуск `src/motion/test.ts`: каждый `*.test.ts` идёт отдельным процессом, аргументы (`--negative`) передаются всем файлам.
   - `npm run test:motion` теперь запускает этот общий раннер, а значит и прежний `motion.test.ts` (35 проверок).
9. **`src/labs/MotionLabKit.tsx`** — новая композиция `MotionLabKit`, 1080×1920, 60 fps, 270 кадров, 5 плиток:
   - точка с 4 сменами цели (`track`, SPR.snap) и цвет (`ctrack`, SPR.firm);
   - пилюля таба на двух пружинах краёв: ведущий край на micro, отстающий на firm;
   - magic move «квадрат → полоса → квадрат» на `SPR.glide` с `swapIn` содержимого;
   - камера: наезд ×2.4 и возврат на `SPR.camera`, `breath` +2.5 % в паузах;
   - `hitPulse` на долях 120 BPM по сетке `at`, сильная доля +30 %.

## Файлы (новые / изменённые)
- **Новые:**
  - `src/motion/`: `spring.ts`, `color.ts`, `tokens.ts`, `sync.ts`, `camera.ts`, `move.ts`, `kit.test.ts`, `test.ts`, `THIRD-PARTY-LICENSES.md`;
  - `src/labs/MotionLabKit.tsx`;
  - `docs/tasks/data/011-ref.ts` — скрипт эталона, проектом не запускается;
  - `docs/tasks/011-living-motion-kit.report.md`.
- **Изменённые:**
  - `package.json` — `test:motion` → `node --experimental-strip-types --no-warnings src/motion/test.ts`;
  - `src/Root.tsx` — регистрация `MotionLabKit`.

## Проверки (команда → результат)
**Эталон.** Скрипт `docs/tasks/data/011-ref.ts` импортирует исходные файлы источников:
- cinetic: `lib/anim`, `sync`, `color`, `camera`, при `FPS = 60` из их `timeline.ts`;
- product-film: `kit/spring`, `move`, `camera`, `time`;
- Barty-Bart: `motion.js` в `node:vm`.

Как запускалось:
```
npx -y tsx --version   → tsx v4.23.15 / node v24.14.0   (через npx-кэш, в package.json не добавлен)
npx -y tsx ref.ts > ref.json   → exit 0, 9 730 байт JSON
```
Константы вписаны в `kit.test.ts` (`REF`) без ручной перепечатки — тест собран из `ref.json`. Сверка 1e-9.

Как сравниваются числа cinetic, заданные в кадрах 60 fps: наши функции получают секунды (`f / 60`), результат сравнивается в кадрах. Самопроверка эталона по документации cinetic: `durFor(150)` = 44 / 33 кадра, `durFor(1200, камера)` = 145 / 118 — совпадает.

1. `npm run test:motion` → exit 0, **104 проверки** (kit 69 + motion 35). Выдержка из вывода:
   ```
   ✓ step snap / calm / heavy / firm / under: 10 точек = эталон (±1e-9)
   ✓ track (4 смены цели, SPR.firm): 10 точек = эталон (±1e-9)
   ✓ track: в момент события = v0
   ✓ track: t → ∞ → цель — 11
   ✓ SPR.calm: перелёт 0 — max step − 1 = -2.22e-16      (firm, soft, heavy, camera — тоже ≤ 1e-12)
   ✓ SPR.snap: перелёт ≈ 6 % (±1 %) — 6.00 %
   ✓ ctrack = mixColor(c0, c1, step) cinetic на 10 точках (calm, heavy)
   ✓ mixColor (OKLab) = эталон cinetic на 5 парах
   ✓ vis (умолчания источника) / vis (свои din/lin/lout/blur) = эталон Barty-Bart
   ✓ step = S(τ, w, z) Barty-Bart (недо-, критич., передемпф.)
   ✓ E.out … E.linear: по 10 точек = эталон, макс. расхождение 0.00e+0 (все 16 кривых)
   ✓ hitPulse, squash, arrive/depart, arriveK, stagger, inertia, blurIn/Out, rand = эталон
   ✓ durFor calm/crisp: кадры 60 fps = эталон на 7 точках — [[30,21],[34,24],[44,33],[88,70],[145,118],[54,36],[180,144]]
   ✓ peak: кадр пика = эталон на 5 кривых;  ✓ settleOf: кадр 0.97 пути = эталон на 4 кривых
   ✓ delayTo (ζ ≤ 1: snap@1, snap@0.5, calm@1, calm@0.9, micro@1, pop@0.5): кадр = эталон
   ✓ delayTo (ζ > 1: firm@1): первый кадр, где step ≥ thr − 5e-4 — наши 53 кадров, spring() Remotion 51
   ✓ at (сетка тактов product-film) = эталон;  ✓ gridFromBeats (формат beat-sync);  ✓ gridFromBeats: нечисловое поле — громкая ошибка
   ✓ lc, breath/dip, toScreen, camera (30 точек), project, worldTransform = эталон
   ✓ project: центр мира в центре кадра 1080×1920
   ✓ move (magic move, SPR.glide), swapIn, center = эталон
   ✓ детерминизм: два прогона совпадают побитно
   OK: kit (spring, color, tokens, sync, camera, move)
   OK: motion
   OK: 2 файлов
   ```
2. **Позитивный контроль:** `npm run test:motion -- --negative` → **exit 1**:
   ```
   ✗ ПОЗИТИВНЫЙ КОНТРОЛЬ: step(0.2, SPR.snap) = эталон calm (заведомо неверно) — 1.05538448082075 vs 0.47506905321389603
   ПРОВАЛ: 1
   ✗ ПОЗИТИВНЫЙ КОНТРОЛЬ: ring(0.05) == 0 (заведомо неверно) — 0.580302847402341
   ПРОВАЛ: 1
   ПРОВАЛ: 2 из 2 файлов
   ```
3. `npx tsc --noEmit` → exit 0, без вывода.
4. **Гейт 1**, `grep -rnE 'requestAnimationFrame|setTimeout|Math.random|@keyframes|transition:' src/motion src/labs/MotionLabKit.tsx`:
   - Единственное совпадение — комментарий строки 1 прежнего `src/motion/index.ts` («…без Math.random —»), файл не мой. В новом коде — пусто.
   - Тот же grep без строк-комментариев → exit 1, пусто.
   - **Позитивный контроль** — тот же grep по клону cinetic находит: `lib/FontGate.tsx:24: requestAnimationFrame(() => continueRender(handle));` и `lib/anim.ts:155` (комментарий про Math.random).
5. **Стиллы `MotionLabKit`.** Команда `npm run still -- MotionLabKit <кадр>`; события во всех плитках в 0.5 / 1.5 / 2.5 / 3.5 с.
   - `out/stills/MotionLabKit-97.png` (1.62 с) — середина движения всех плиток: точка в пути, цвет между синим и зелёным; пилюля растянута между табами; квадрат на полпути к полосе; камера на зуме 1.29 из 2.4.
   - `out/stills/MotionLabKit-144.png` (2.40 с) — конец движения: точка и пилюля на цели; полоса с проявленным содержимым (`swapIn`); камера на зуме 2.37 (2.4 × дыхание); `hitPulse` погас.
   - `out/stills/MotionLabKit-92.png` (1.53 с) — пик `hitPulse` на доле 1.5 с: середина движения плитки «hitPulse».

## Отклонения от задачи и почему
- **`delayTo` сверяется не с одним допуском.** Для ζ ≤ 1 (6 случаев) — точное совпадение кадра с cinetic. Для передемпфированной firm (ζ = 1.014) наш ответ 53 кадра, у cinetic 51.
  - Причина — сам эталон: `spring()` Remotion совпадает с замкнутой формой до 1e-16 при ζ ≤ 1, а при ζ > 1 отходит от точного решения на ~2e-4 (кадр 51: 0.999526 у Remotion против 0.999305 по формуле). Это сдвигает касание порога 0.9995 на 2 кадра.
  - Наш `delayTo` считает по той же `step()`, которую рисует `track`, — звук встанет на нарисованное касание. Для ζ > 1 тест проверяет, что кадр — первый на собственной кривой, а расхождение с Remotion выводит числом.
- **Изменились единицы и сигнатуры** (время в секундах, правило задачи):
  - `durFor`, `peak`, `delayTo`, `settleOf`, `stagger` возвращают секунды без округления до кадра;
  - `arriveK(px, dur, fps, ease)` получил параметр `fps` — порог «1 px за кадр» зависит от частоты;
  - `inertia(t, start, v0, decay)`: `v0` в px/с, `decay` — за кадр 60 fps, `settle` в секундах;
  - `delayTo`, `hit`, `settleOf` идут по кадровой сетке параметра `fps` (по умолчанию 60).
- **Без периода-цикла.** У Barty-Bart `track` умеет замкнутый цикл (`period`); по задаче `track` взят из product-film, где цикла нет. От Barty-Bart — только `ctrack` и `vis`.
- **`ctrack(t, keys, cfg)`** получает конфиг пружины `SpringConfig`, а не пару `[w, z]` Barty-Bart, и мешает цвета в OKLab, как сказано в задаче.
- **`index.ts` не реэкспортирует новые модули:** `spring.ts` импортирует `index.ts`, и реэкспорт дал бы циклический импорт. Модули импортируются по пути (`../motion/spring.ts` и т. д.).
- **`camera()` cinetic переименован в `shotStyle()`,** чтобы не путать с `camera()` по ключам product-film.
- **Плитки — в отдельной композиции `MotionLabKit`, а не в `MotionLab`.** Сетка `MotionLab` занята 12 плитками на 30 fps. Новая композиция — 60 fps по решению Олега 2026-10-18 для презентационных роликов; прежние стиллы `MotionLab` не меняются.
- **Стиллы.** Три на композицию вместо двух на плитку: все плитки двигаются по общему расписанию, так что f97 (середина) и f144 (конец) покрывают каждую; f92 — пик `hitPulse`.
- **`docs/tasks/data/011-ref.ts`** положен для воспроизводимости эталона; в `tsconfig` он не входит, проектом не запускается.

## Предложения (вне рамок задачи, не сделано)
- Калибровка SPR и PACE на эталоне: все числа — гипотезы cinetic при 60 fps. Паузы `holdFor` надо сверить с readcheck (cps 12, minHold 1.0 с) на украинских фразах — они длиннее английских, для которых настроен cinetic.
- Линт сцен «сырые bezier/числа пружин вне `tokens.ts`» (аналог `scripts/lint-film.mjs` cinetic) — чтобы правило «только E.* / SPR.*» проверялось кодом, а не ревью.
- После ревью — 011-Б (`src/elements/`).

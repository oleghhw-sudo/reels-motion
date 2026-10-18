# 011 — Набор «живой анимации»: порт из cinetic и product-film-skill

Статус: open · Ориентир: 2 сессии по ~90 мин (011-А ядро, 011-Б элементы) · Полный рендер: НЕ нужен
Согласовано Олегом 2026-10-18. **Поглощает задачу 003** (пружины `track` — одна реализация, не две; из Barty-Bart берутся только `ctrack` и `vis`).
Правила, которым служит код: `.claude/skills/living-motion/SKILL.md`. Разбор источников: docs/EFFECTS_PANTRY.md раздел G.

## Источники (только чтение, ничего из них не запускать кроме подсчёта эталонных чисел)
- `git clone https://github.com/Leonxlnx/cinetic` → checkout `ecfa6605de1adb9345ce937724810dc32267d068` (MIT): `skills/cinetic/assets/remotion-starter/src/lib/{anim,camera,pace,sync,color}.ts`, `src/fx/*.tsx`.
- `git clone https://github.com/Rieranthony/product-film-skill` → checkout `fe11efc429d5903e37274d0b294e1b95745b2881` (MIT): `plugins/product-film/skills/product-film/templates/kit/{spring,time,move,camera,cursor,cursor-path,punchlines,debug}.ts(x)`.
- Barty-Bart/motion-graphics @3d83d98 (MIT): только `ctrack`, `vis` (задача 003).
- Каждый файл: шапка `// Ported from <repo> @<commit> · MIT (c) <автор из LICENSE>`; тексты лицензий — `src/motion/THIRD-PARTY-LICENSES.md`.

## Общие правила порта
- Время — секунды (`t = frame / fps`). Числа cinetic даны в кадрах при 60 fps → хранить в секундах (`f60(n) = n/60`), никаких кадровых констант под один fps.
- Гейт 1: ни `requestAnimationFrame`, ни `setTimeout`, ни `Math.random`. Детерминированный шум/хеш — из `src/motion` (`hash`) или их FNV `rand(seed)`.
- Размер кадра — из `useVideoConfig()`, не константа 1920×1080 (у нас 1080×1920 и 1920×1080).
- Не дублировать `src/motion/index.ts` (clamp, lerp, кривые) — импортировать/расширять.
- Именованные токены: сцены используют только `E.*`/`SPR.*`, сырые bezier/числа пружин в сценах — нельзя.

## 011-А — ядро (`src/motion/`)
1. `spring.ts`: `step(t, cfg)` замкнутая форма (недо-/критич./передемпф.), `track(t, keys, cfg)` сумма шагов, `critical(response)`; `ctrack` (цвет по каналам, OKLab-смешение из cinetic `color.ts`), `vis` (Barty-Bart, значения как в источнике).
2. `tokens.ts`: `E` (все кривые из anim.ts, включая dolly/glide/contact/whip/rest), `SPR` (snap, pop, land, micro, firm, soft, heavy, calm, word, detent, glide 150/20/1, camera 120/30/1.2); `hitPulse`, `durFor(px, camera?, pace)`, `arrive/depart/arriveK`, `squash`, `stagger`, `inertia`, `blurIn/blurOut`; `PACE {calm, crisp}` в секундах.
3. `sync.ts`: `peak`, `delayTo`, `hit`, `settleOf`; сетка `b(bar, beat, fraction)` из `beats.json` (product-film `at`).
4. `camera.ts`: ключи камеры на пружине, зум в лог-пространстве (product-film) + `breath`, `dip`, `lc` (cinetic); `project`, `worldTransform` от реального размера кадра.
5. `move.ts`: `move` (magic move), `swapIn` (блюр-свап), `Rect`, `center`.
6. Тесты `src/motion/*.test.ts` в `npm run test:motion`:
   - эталонные значения: исходный TS/JS cinetic и product-film запустить через `npx tsx` на 8–10 точках каждой функции, числа вписать в тест константами (точность 1e-9);
   - `track` с одной сменой цели: в момент события = v0, t→∞ → цель; `SPR.calm`, `firm`, `soft`, `heavy` — перелёт 0; `snap` — перелёт ≈6 % (±1 %);
   - `--negative` обязан упасть.
7. MotionLab: плитки — точка с 4 сменами цели (`track`), пилюля таба на двух пружинах краёв, magic move квадрата → полоса, камера с наездом и `breath`, `hitPulse` на точке по доле 120 BPM. 2 стилла каждой плитки (середина и конец движения).

## 011-Б — элементы (`src/elements/`), после ревью 011-А
- `Words` (вход слов calm/crisp, блюр-вход, выход), `Chain` (режимы build/replace, пересборка строки по центру, акцент → чернила), `TypeOn` (каретка, вес символов), `Roll` (одометр цифр — совместить с #007 CountUp, formatUk не ломать), `MaskRise`, `Morph`, `Iris`, `Cursor` (+ `cursorArc`, `pressAt`, hover), `Punchlines` (слоты слов, без пересборки), `TargetLog` (debug-оверлей).
- Весь текст — через `<Readable>`; шрифты — наш реестр `src/theme/fonts.ts`.
- `FontGate` своей реализацией: без `requestAnimationFrame`; `document.fonts.load(face, 'ґєіїʼ’ABC')` и `check` с образцом кириллицы; таймаут → громкая ошибка, не фолбэк.
- MotionLab: по плитке на элемент, вертикаль 1080×1920, украинский текст («Погляд, який говорить більше.»), readcheck на композиции MotionLab — зелёный или каждое нарушение объяснено.

## Проверки (в отчёт — команды и вывод)
`npm run test:motion` (+ `-- --negative` красный), `npx tsc --noEmit`, readcheck MotionLab, стиллы плиток (пути), grep по `src/motion src/elements` на `requestAnimationFrame|setTimeout|Math.random|@keyframes|transition:` → пусто (позитивный контроль: тот же grep по клону cinetic находит `requestAnimationFrame` в FontGate).

## Вне рамок
Motion blur субкадрами (отдельная задача), звук/score cinetic, HyperFrames, скрипты QA cinetic (forensics, av-audit), любые новые npm-пакеты без записи в env.manifest.json.

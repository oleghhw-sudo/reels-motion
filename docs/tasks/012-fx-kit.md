# 012 — Набор эффектов `src/fx`: словарь AE на Remotion 4.0.534 (`@remotion/effects`, HtmlInCanvas, motion-blur, pushCut)

Статус: open (ждёт «да» Олега по docs/ANALYSIS-expressiveness.md §6) · Ориентир: 3 сессии по ~90 мин (012-А ядро + FxLab, 012-Б удар и склейка как данные, 012-В расширенный каталог G–M) · Полный рендер: НЕ нужен · Блокирует: 008 v2 (А/Б)
Правила, которым служит код: `.claude/skills/cinematic-fx/SKILL.md` (§2 анатомия удара, §3 каталог, §4 реализация), living-motion §−1/§5/§9. Эталон движения: `docs/tasks/data/008-proto-rook-card.py` (ROOK).

## Зависимости (гейт 2: сначала env.manifest.json, потом package.json, версии ровно 4.0.534)
- `@remotion/effects` и `@remotion/transitions` (Remotion License: бесплатна для физлиц и компаний ≤ 3 человек, коммерческое использование разрешено — записать в `src/motion/THIRD-PARTY-LICENSES.md` ссылкой на `LICENSE.md` репозитория Remotion), `@remotion/motion-blur` (MIT), `@remotion/layout-utils` (MIT). `@remotion/noise` уже есть. В 4.0.534 — 74 эффекта (список в `node_modules/@remotion/effects/dist`); имена параметров — по `.d.ts`, не по памяти.
- Проверить в отчёте: `npm ls` показывает ровно 4.0.534 у всех `@remotion/*`; `npx remotion gpu --gl=angle` на Mac — WebGL2 доступен (вывод в отчёт). Без GPU (CI/Linux) — `REMOTION_GL=swangle` и пометка «медленно».
- Studio: HtmlInCanvas в предпросмотре требует Chrome ≥ 149 с флагом `chrome://flags/#canvas-draw-element`; в headless-рендере с 4.0.534 — без настроек. Если Studio на Mac не показывает слой — это ожидаемо, проверять стиллами.

## 012-А — ядро (`src/fx/`)
1. `presets.ts` — именованные пресеты (сырые числа в сценах запрещены, как для `E`/`SPR`):
   - `HIT = { S, M, L }`: `{ flash: {opacity, frames@24}, impactFrames, shake: {amp, decay, roll}, ca: {px, decay}, zoomPunch: {k, releaseSec}, settleSec }` — числа cinematic-fx §2 (ROOK: L — вспышка 0.9 × 1 кадр, 2 impact-кадра, тряска 30 px × 0.72/кадр, хроматика 14 px × 0.7/кадр; M — 0.6, 0, 12 px, 6 px; S — zoom-punch 1.06–1.08, без вспышки);
   - `LEAD = { ramp: 0.55, frames: 10, push: 1.16, desat: 0.4, contrast: 1.3, ca: 10, preflash: [0.35, 0.7] }` (подвод, ROOK);
   - `SLAM = { name: {from: 1.9, w: 34, zeta: 0.5, trailCopies: 2, trailFrames: 2, trailScale: 0.18}, stamp: {from: 2.2, w: 30, zeta: 0.45}, tag: {frames: 7, slide: 60} }` (#008, ROOK, #005);
   - `WHIP = { outFrames: 3, inFrames: 2, blurPx: [100, 250], shift: 0.35 }`;
   - `LOOK = { none, film, trailer, pop, monoHit, vhs }` — таблица cinematic-fx §5 как параметры effects (`colorCorrection/lut`, `glow` для halation, `chromaticAberration`, `vignette`, `noise`, letterbox px);
   - `SHAKE = { hit(amp, decay), handheld(freq, amp, roll) }`;
   - время — секунды; кадры только через `fps` вызывающего; запись «при 24 fps» в комментариях.
2. `fx.ts` — чистые функции: `hitEnvelope(t, hit, fps) → {flash, impactIndex, shake:[x,y,roll], ca, punch}` (использует `hitPulse`, `shakeXY`/`noise2D`, затухание `decay^k` по кадрам); `leadIn(p) → {speed, push, sat, contrast, ca, white}`; `slam(t, cfg) → {scale, trail:[{scale, alpha}]}` (пружина `step` из `spring.ts` с w/ζ → `SpringConfig`); `whipSmear(t, cfg, dir) → {blurPx, shift}`; `remapSpeed(frame, speedFn)` (накопление по кадрам, рецепт Remotion «accelerated video»); `lookEffects(preset, frame, fps) → effects[]` (seed зерна на двойках `Math.floor(frame/2)`); `letterboxPx(preset, h)`.
3. Компоненты (`src/fx/*.tsx`), все — функции кадра:
   - `<Look preset overrides>` — один `<HtmlInCanvas>` поверх детей с `effects={lookEffects(...)}` + полосы letterbox; DOM детей сохраняется (readcheck видит текст).
   - `<HitLayer t0 size seed>` — вспышка (`AbsoluteFill` белый), impact-кадры (слот `impact` — дети для постера; реализация постера: `grayscale → levels` порог через `@remotions/effects` или `createEffect` 2d), тряска/крен/zoom-punch как transform контейнера (слой увеличен на 6 %), хроматика через `chromaticAberration({amount})` на `<HtmlInCanvas>`.
   - `<LeadIn t0 frames>` — для `<OffthreadVideo>`: ramp по `remapSpeed` (один `<Sequence>` на кадр, `src + '#disable'`), второй слой `trimBefore + 1` с α = дробная часть (смешивание) — за флагом `blend`; наезд, desaturate/contrast (effects), хроматика, засветка.
   - `<WhipCut dir>` — направленный смаз: `blur({horizontal:true})` из effects или `<HtmlInCanvasMotionBlur shutterAngle=360 samples=8>`; сдвиг; резерв без WebGL — SVG `feGaussianBlur stdDeviation="40 0"`.
   - `<Slam>`, `<Stamp>` — display-слово (через `fontFor`, `<Readable>`), пружина с перелётом, шлейф `<Trail layers=2 lagInFrames=1>` только первые 2 кадра; `<TagPlate>` — маска-раскрытие #005.
   - `<Handheld>` — `noise2D(seed, t·f)` + поворот 0.3–1°.
4. `src/labs/FxLab.tsx` — 1080×1920, 24 и 60 fps (две композиции `FxLab24`, `FxLab60`), плитка на приём, события на 0.5/1.5/2.5/3.5 с: удар S/M/L на одном и том же кадре-образце (PNG из `public/`, не внешний путь), слэм «ROOK», штамп «#2», плашка, хлёст между двумя цветными плитками, ramp на тестовом видео из `scripts/fixtures` (сгенерировать ffmpeg: движущийся прямоугольник 2 с — детерминированно), look-пресеты на одном кадре; подписи JetBrainsMono как в MotionLabKit.
5. Тесты `src/fx/fx.test.ts` в `npm run test:motion`: `hitEnvelope` — вспышка только в кадре удара (1 кадр @24, 2–3 @60 по мс), тряска затухает монотонно по огибающей и равна 0 через ≤ 12 кадров, хроматика ×0.7/кадр; `slam` — перелёт есть и ≤ 1 осцилляция; `remapSpeed` — монотонно, суммарное время = интеграл; `lookEffects` — детерминирован, seed зерна меняется каждые 2 кадра; `--negative` обязан упасть.

## 012-Б — удар и склейка как данные
- Схема `scenes.yaml`/`outro.yaml` (расширение, гейт 3 — поле + читатель вместе): `look: film`, в пунктах `hit: S|M|L`, `in: whip|cut|flash`, `ramp: true`, `slam: {title, tag}`; `model.ts` аутро принимает v2-поля (`in`, `ramp`, `music.holdAfter`, `sfx` v2 с `pick`) — это пересекается с 008 v2: делать здесь только схему и валидацию, сборку аутро — в 008 v2.
- `<TransitionSeries>` с `pushCut({flashOpacity: 0.2, flashFrames: 2, cutProgress: 5/11, outgoingScale: 1.04, incomingStartScale: 1.04, incomingEndScale: 1.07})` (монотонный тайминг) для удара M между сценами презентации; `<TransitionSeries.Overlay>` + `lightLeak({seed, progress})` — для перехода `in: leak` (≤ 1 на ролик, cinematic-fx §1).

## 012-В — расширенный каталог (после 012-А/Б; cinematic-fx §3 G–M; по отдаче)
1. **Нативные замены prep-слоёв ROOK**: `starburst({rays, colors, rotation: градусы, smoothness})` (лучи; генератор — на `<Solid>` под фигурой), `halftone`/`halftoneLinearGradient` (растр), `outline({width, edgeSimplification})` + `dropShadow` (обводка/тень вырезки) — сравнить стиллом с prep-версией; если тонкие пряди хуже — оставить prep, записать.
2. **Переходы-эффекты** как презентации/оверлеи: `tear`, `evolve`, `venetianBlinds`, `pixelDissolve`, `pixelate` 40→1 (ввод), `barrelDistortion` импульс 0→0.25→0 (6 кадров), `wave` «жидкий» 0→30→0 (8 кадров) — каждый с номером motion-prompt, если есть (#017/#018/#019/#045).
3. **Свет**: god rays (копия → `levels` порог → `zoomBlur` → screen), bloom по порогу (`glow threshold 0.75`), `shine` (#022), rack focus (`regionBlur`), tilt-shift (`linearProgressiveBlur`).
4. **Цвет**: `LOOK` на `colorCorrection`/`levels`/`vibrance`/`whiteBalance`/`linearGradientTint`; `lut` — один .cube (teal-orange) в `public/luts` через env.manifest; луки bleach/cross/day-for-night/faded как пресеты; «вспышка экспозицией» (`exposure` 3→0).
5. **Плёночные луки**: `LOOK.projector`, `vhs`, `crt`, `mm8`, `oldPhoto`, `riso` по §3 M (gate weave и flicker — по `rand` на двойках).
6. **Композитинг**: text-matte (видео в буквах), double exposure, split screen, perspective flip (#021), PiP с тенью, `colorKey` для генераций на зелёном (лист краёв).
7. **Время**: `<Trail>` эхо, строб/заикание/flicker cut по сетке восьмых (energycheck FLASH_RATE обязан ловить превышение > 3/с — позитивный контроль), реверс — prep в манифест.
8. **Аудиореактивность**: prep `loudness.json` (ffmpeg `astats` по кадрам, полоса 40–120 Гц) + `audioScale(frame)`; тест на синтетическом WAV с ударом на 1.0 с (пик rms в кадре 24 ±1 при 24 fps); позитивный контроль — сдвинутый файл.
9. FxLab: плитки на каждую группу G–M; стиллы; лист перехода (−4…+8).

## Проверки (в отчёт — команды и вывод)
- `npm run test:motion` (+ `-- --negative` красный), `npx tsc --noEmit`.
- Детерминизм: `npm run still -- FxLab24 36` дважды → `shasum` совпадает; позитивный контроль — плитка с `Math.random` (временная, в отчёте) даёт разные хеши.
- `grep -rnE 'requestAnimationFrame|setTimeout|Math.random|@keyframes|transition:' src/fx` → пусто (позитивный контроль — тот же grep по клону `reactvideoeditor/remotion-templates` что-нибудь находит, либо по временной плитке).
- `node scripts/readcheck.mjs FxLab24` — текст внутри `<HtmlInCanvas>` виден проверке (слэм «ROOK» — OK или SHORT с объяснением), LATIN_ONLY на Anton не сработал на латинице.
- Стиллы: середина/конец каждой плитки + **лист удара** `out/qa/FxLab24-hit-L.png` (кадры −4…+8 через кадр, одна строка): видны подвод (desat, наезд, хроматика), вспышка, 2 impact-кадра, затухание тряски.
- Время рендера плитки с ramp+blend против без blend — в отчёт (решение «в кадре или prep» для 008 v2).

## Вне рамок
Сборка аутро (008 v2), субтитры (014), energycheck (013), апгрейд Remotion (turbulentDisplace/lensBlur — 4.0.537), порт кода из сторонних MIT-репо (при нехватке `@remotion/effects` — отдельной задачей с лицензией в THIRD-PARTY).

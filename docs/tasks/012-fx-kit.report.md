# Отчёт: 012-fx-kit — сессия 012-А (`src/fx` из работающего ep01)
Статус: готово (012-А целиком; 012-Б — отдельная сессия на Mac, не делалась)
Время: ≈ 70 мин · Mac (нужны были стиллы MiaOutro: `MIA_SHORT_DIR`, assets ep01 на диске)

## Сделано
- **`src/fx`** — приёмы вынесены из `src/videos/mia-outro/{fx.tsx, MiaOutro.tsx}` (финал ep01, 2f3856c) на той же DOM/SVG-реализации; `fx.tsx` аутро удалён.
  - `core.ts` — чистая математика **без импортов remotion** (её тянет `model.ts` → node-скрипты `check-zones.mjs`, `stills.mjs`): `remapSpeed` (= `livePos` ep01), `sampleProfile`, `whipSmear`, `tauFromPerFrame`/`decayAt`, `RAMP`.
  - `presets.ts` — `HIT = {S, M, L}` + `BLAST` (финал-взрыв ep01: 3 белых кадра, тряска 40 px), `LEAD`, `RECOIL`, `SLAM`, `STAMP`, `TAG`, `WHIP`, `LOOK = {none, film, monoHit}`. Числа ROOK, записаны **в секундах** через `F24(n)` (n кадров при 24 fps); затухания «×0.72 за кадр» — как τ (с). Кадры — только через `fps` вызывающего.
  - `hit.ts` — `hitEnvelope(t, fps, preset, seed)` → фаза (`flash | impact | recoil`) по центру кадра, вспышка, impact-кадр (первая половина — красный), тряска (`shakeAt`, seed:кадр — ключи те же, что в ep01), хроматика, раскрытие, zoom-punch; `leadIn(p)`, `leadFlash(tToHit, fps)`.
  - `text.ts` — `slam`, `stamp`, `tagReveal`.
  - `components.tsx` — `<HitLayer>` (кадр удара + impact-кадры, `useHit`), `<LeadIn>` + `<LeadFlash>`, `<WhipCut>`, `<Slam>`/`<Stamp>`/`<TagPlate>`, `<Look>` (+ `lookFilter`), `<Grain>` на **`<Img>`-тайлах** (п. 3), `<Vignette>`, `<Filters>`/`filterCss`, `<White>`, `<Rays>`.
  - `index.ts` — barrel; `lab/FxLab24.tsx` + `lab/fixtures.ts`; `fx.test.ts`.
- **`MiaOutro.tsx` на `src/fx`** (393 → 294 строки): `Cut` → `<WhipCut>`, подвод → `<LeadIn>`/`<LeadFlash>`, удар карточки → `useHit(HIT.L)` + `<HitLayer>`, отдача — `RECOIL`, тексты — `<Slam>`/`<Stamp>`/`<TagPlate>`, зерно/виньетка → `<Look>`, финал — `BLAST`. Сырых чисел приёмов в сцене не осталось (кроме данных outro.yaml и раскладки текста TXT). `model.ts`: `livePos(i, n, L, ramp, fps)` делегирует `remapSpeed`.
- **Зерно через `<Img>`**: кадр замощён тайлами 512 px (`<Img>` ждёт загрузки — `/docs/flickering`), выбор тайла «на двойках» как раньше. Картинка побайтно та же (см. регрессию).
- **`FxLab24`** (1080×1920, 24 fps, 108 кадров = 4.5 с), сетка 2×5: удар S (zoom-punch) и M на 0.5/1.5/2.5/3.5 с; слэм «ROOK», штамп «#2», плашка «THE HUNTER» на 0.5 и 2.5 с (текст в safe zones, `<Readable>`); смаз-склейка (5 панелей, направления чередуются, каждая вторая уходит «как карточка»); **удар L — анатомия ROOK** во всю ширину на 1.5 и 3.5 с (подвод `LeadIn` → вспышка 90 % → 2 impact-кадра с постером → раскрытие кругом → фигура SPR.pop → слэм «HIT L»); ramp (#038) с подводом → удар M на синтетическом видео; look film | monoHit.
- **Фикстуры** `public/fixtures` (не в git, `.gitignore`): `scripts/fxlab.mjs fixtures` — ffmpeg `testsrc2` 540×384 @24, 48 кадров (280 532 B) + 4 тайла зерна ImageMagick `-seed 1000+k` (как prepare-assets), 2.2 MB. Пути — только в `src/fx/lab/fixtures.ts` (лаборатория и генератор читают одно место); нет файла → `<Img>`/`<OffthreadVideo>` падают.
- **Скрипты**: `scripts/pixregress.mjs capture|compare` (попиксельная регрессия через ffmpeg rgb24), `scripts/fxlab.mjs fixtures|sheet` (лист удара L).
- `src/motion/test.ts` гоняет и `src/fx/*.test.ts`; `--negative` падает в каждом файле.

## Файлы (новые / изменённые)
- **Новые:** `src/fx/{core.ts, presets.ts, hit.ts, text.ts, components.tsx, index.ts, fx.test.ts}`, `src/fx/lab/{FxLab24.tsx, fixtures.ts}`, `scripts/pixregress.mjs`, `scripts/fxlab.mjs`, этот отчёт.
- **Изменённые:** `src/videos/mia-outro/MiaOutro.tsx` (переписан на src/fx), `src/videos/mia-outro/model.ts` (`livePos` → `remapSpeed`, параметр fps), `src/Root.tsx` (+ `FxLab24`), `src/motion/test.ts` (+ src/fx), `.gitignore` (+ `public/fixtures/`).
- **Удалён:** `src/videos/mia-outro/fx.tsx`.

## Проверки (команда → результат)
**Регрессия MiaOutro (п. 2)** — кадры из отчёта финального рендера 008: h2 f66/f68/f82, финал f387/f439/f469, обе ориентации:
```
node scripts/pixregress.mjs capture out/qa/regress/before      (на коде до переноса, HEAD 086dae4)   → 12 стиллов за 9 с
node scripts/pixregress.mjs capture out/qa/regress/after       (на src/fx)                            → 12 стиллов за 11 с
node scripts/pixregress.mjs compare out/qa/regress/before out/qa/regress/after
  Δ > 8/255 хотя бы в одном канале; порог 1 % пикселей
  ✓ MiaOutro-f66 … f469, MiaOutroVertical-f66 … f469: 0 из 2073600 px (0.000 %), макс. Δ 0   (все 12)
  OK: 12 стиллов, картинка не изменилась                                                       → exit 0
```
Позитивный контроль — изменённый пресет (`HIT.L.flash` 0.9 → 0.3, `HIT.L.shake` 22 → 60 px), capture → `out/qa/regress/mutated`, compare с before:
```
  ✗ MiaOutro-f66.png:         2073596 из 2073600 px (100.000 %), макс. Δ 149
  ✗ MiaOutroVertical-f66.png: 2073600 из 2073600 px (100.000 %), макс. Δ 148
  ✓ остальные 10 — 0 %  (f68/f82/финал: тряска отдачи к f82 уже затухла, вспышка только в f66)
  ПРОВАЛ: 2 из 12 стиллов                                                                      → exit 1
```
`presets.ts` восстановлен (`git diff` пуст).

**Тесты и типы:**
```
npx tsc --noEmit                              → exit 0
npm run test:motion                           → fx/fx.test.ts OK: fx · kit OK · motion OK · OK: 3 файлов
npm run test:motion -- --negative             → ✗ НЕГАТИВ (должен упасть): remapSpeed V3 последний кадр = 31 · ✗ kit · ✗ motion → ПРОВАЛ: 3 из 3 файлов
```
`fx.test.ts` (45 проверок): `remapSpeed` = числа отчёта 008 (V3 33→22: шаги 2.254, затем 0.55; V10 44→44; V9 12→11 целиком ×0.55), `@60 fps` slowFrames 23; `whipSmear` 120/60 · 60/120 · 90/180/270 + 0.22/0.44/0.66, @60 fps интерполяция; `hitEnvelope` L/M/S/BLAST покадрово (фазы, вспышка, импакт-цвета, хроматика 14·0.7^(k−1), раскрытие E.out, тряска ≤ амплитуд и 0 после maxDur, детерминизм seed), @60 fps вспышка 2 кадра / impact 5; `leadIn`/`leadFlash`; `slam` (1.9, шлейф α 70/130 только ≤ 0.09 с, перелёт SPR.slam: мин. масштаб 0.83–0.88), `stamp` 2.2, `tagReveal` 7 кадров/60 px.

**Детерминизм FxLab24:**
```
npm run still -- FxLab24 36 --suffix a ; npm run still -- FxLab24 36 --suffix b ; shasum
  8232a6c7e656f39ca680405521e9c78b010fd0c9  out/stills/FxLab24-36-a.png
  8232a6c7e656f39ca680405521e9c78b010fd0c9  out/stills/FxLab24-36-b.png                       → совпадают
позитивный контроль: временная плитка `background: hsl(${Math.random() * 360} …)` поверх всех плиток
  8e48cd3dda90ac4e15f0e20308c27bee77af631c  FxLab24-36-rnd1.png
  62255466b1a534d222d05cfaa3696ac09e1a84aa  FxLab24-36-rnd2.png                                → разные; плитка удалена
```
(Первая попытка контроля дала одинаковые хеши — плитка оказалась под непрозрачной плиткой look и в кадр не попала; переставлена поверх, контроль повторён.)

**grep на запрещённое:**
```
grep -rnE 'requestAnimationFrame|setTimeout|Math.random|@keyframes|transition:|backgroundImage' src/fx   → пусто, exit 1
с временной плиткой: src/fx/lab/FxLab24.tsx:288: … Math.random() …                                      → exit 0 (нашёл); после восстановления снова пусто
```

**Readcheck FxLab24** (`node scripts/readcheck.mjs FxLab24`) → exit 0, 4 текста, 0 нарушений:
```
OK  lab.stamp  "#2"           нужно 1.00  держит 4.00
OK  lab.slam   "ROOK"         нужно 1.00  держит 1.92
OK  lab.tag    "THE HUNTER"   нужно 1.25  держит 1.83
OK  lab.hitL   "HIT L"        нужно 1.00  держит 1.75
```

**Лист удара L** — `node --experimental-strip-types scripts/fxlab.mjs sheet` → `out/qa/FxLab24-hit-L.png` (13 кадров f32…f44 = −4…+8 от удара f36, полоса плитки L; стиллы `out/qa/fxlab/`). Видно: подвод (обесцвечивание, наезд), засветка 35/70 % (f34/f35), вспышка 90 % (f36), impact-кадр красный с лучами и постером (f37), impact-кадр цвета карточки (f38), раскрытие + слэм «HIT L» со шлейфом и смазанным полётом (f39–f40), посадка имени, фигура на SPR.pop, затухание тряски (f41–f44).

**Фикстуры:** `node --experimental-strip-types scripts/fxlab.mjs fixtures` → `fx-ramp.mp4` 540×384 @24, 48 кадров (проверено ffprobe), 280 532 B; `grain-0…3.png` ≈ 494 KB каждый.

## Отклонения от задачи и почему
- **`BLAST`** — четвёртый пресет удара сверх `HIT = {S, M, L}`: финал ep01 (3 белых кадра + тряска 40 px, без impact-кадров) не укладывается в L без сырых чисел в сцене; оформлен как отдельный именованный пресет в `presets.ts`.
- **`RECOIL`** — отдельный пресет отдачи (фигура, лучи, наезд, моменты входа текстов); в задаче перечислен не был, но без него числа отдачи остались бы в сцене.
- **Финал: тряска через `shakeAt(…, 'final')`, а не из `hitEnvelope`** — у `hitEnvelope` ключ seed `…:a`, у финала ep01 был `final:k`; чтобы картинка не изменилась, финал зовёт `shakeAt` напрямую тем же seed. Вспышка — из `hitEnvelope(BLAST)`.
- **Семантика пресетов — по центру кадра** `(k + 0.5)/fps`: при 24 fps совпадает с ep01 покадрово; при 60 fps вспышка 42 мс = 2 кадра, impact 83 мс = 5 кадров (тест).
- **`LEAD.ease = E.in`** (как в ep01), хотя cinematic-fx §2 называет `E.contact` — смена кривой изменила бы картинку; записано в пресете как гипотеза для калибровки.
- **`livePos` получил параметр `fps`** (slowFrames считаются от fps вызывающего) — два вызова в `MiaOutro.tsx` обновлены; node-скрипты `livePos` не зовут.
- Позитивный контроль регрессии дал красное только на кадре удара (f66): мутация тряски к f82 уже затухла — достаточно одного красного; амплитуда вспышки — та часть пресета, что видна в выбранных кадрах.
- Вибрация затишья (4 px за последние 11 кадров) и наезд 3 % финала оставлены в `MiaOutro.tsx` — это не приёмы из списка 012-А, а числа сцены (push из outro.yaml); можно вынести следующей итерацией.

## Предложения (вне рамок задачи, не сделано)
- `CLAUDE.md → Команды`: строки для `scripts/pixregress.mjs` и `scripts/fxlab.mjs` (не трогал CLAUDE.md в этой задаче).
- 012-Б: A/B `@remotion/effects` против DOM-версий — плитки FxLab24 уже разложены по приёмам, добавить вторую колонку.
- `LEAD.ease` E.in ↔ E.contact и `RECOIL` — калибровать на эталоне ROOK стиллами (сейчас числа = ep01).
- Lull: вибрацию 0→4 px оформить пресетом (`jitter`), когда понадобится второй ролик с затишьем.

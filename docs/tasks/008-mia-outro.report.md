# Отчёт: 008-mia-outro
Статус: частично — сборка, проверки и черновики готовы. Полный рендер не делался (по задаче). Открыто: 4 SHORT в readcheck — их ограничивают данные (доли в outro.yaml), решение за Олегом. Кроп 9:16 ждёт выбора Олега по стиллам.
Время: ~3 ч

## Сделано
1. **Запретные зоны.**
   - В `shots.json` (MIA_SHORT_DIR, копия прежнего — `_outro-analysis/data/shots.before-v11v12.json`) добавлены V11 и V12. Склейки V12 по `scene>0.2`: 3.208 и 8.208 с.
   - V12 разбит на `V12-01a` 0–3.0 / `01b` 3.0–3.208 / `02` 3.208–8.208 / `03a` 8.208–8.5 / `03b` 8.5–15.05. Зона 3.0–8.5 с помечена `excluded: true, reason: artifact` — вшитый титр «MIA'S STORY», на листе ≈3.5–8.0 с.
   - V11 — один план 0–7.072, `note`: «не используется». Контакт-листы: `_outro-analysis/sheets/V11_01.png`, `V12_01.png`, `V12_02.png`.
   - Проверка — одна чистая функция (`src/videos/mia-outro/model.ts: checkZones`), её зовут три места: CLI `npm run mia:zones` (с `--inject`), `prepare-assets` и сборка композиции (`calculateMetadata` → исключение).
   - Каждый показанный кадр исходника f (время f / 24) проверяется против зон из `outro.yaml forbidden` и `shots.json excluded` (последние зафиксированы в манифесте).
   - Карточка DARK — вырезка из V10 f221, а это зона «только кроп без BLOND». Она допускается явно, отдельной строкой: фон с юным BLOND удалён, остальное — ошибка.
2. **Композиции `MiaOutro` (1920×1080) и `MiaOutroVertical` (1080×1920).**
   - 24 fps, props `{episode}` (+ необязательные `verticalCrop: A|B|C` для стиллов выбора и `qaInjectForbidden` для позитивного контроля).
   - Длительность — из данных: `calculateMetadata` → `timelineFor(episode).durationInFrames` = **396 кадров (16.5 с)** для ep01.
   - Таймлайн: пункт с `on: hN` стоит на ударе `music.hits`, остальные — встык по долям. Разрыв между «концом по долям» и ударом больше 1 кадра — громкая ошибка. Конец пункта = начало следующего.
3. **Карточка героя по эталону `MIA_cards_concept_v2.jpg`:**
   - удар → вспышка 2 кадра → поп-арт фон: цвет `bg`, растр точек (размер растёт слева направо) и 18 лучей, лучи медленно вращаются (6°/с), растр дрейфует;
   - фигура из готового `*_cut.png`. Вырезки в рантайме нет: в `prepare` по альфе строятся только слои обводки — сглаженный силуэт (порог 200, открытие 15×15, размытие 8, порог 50 %), расширение 22 px (чёрная) и 14 px (белая), жёсткая тень 18/18. Метод — как в `card_concept.py`; тонкие пряди остаются без обводки;
   - вход фигуры — `hitPulse` (+5 %) и наезд 3 % за удержание (`E.dolly`), лёгкое обесцвечивание/контраст;
   - имя — `SPR.snap` с `clamp` (без перелёта); подпись — через 0.18 с, плашка раскрывается по `E.out`; номер «#N».
   - **9:16 — своя раскладка:** имя сверху (ниже safe zone 220 px), фигура снизу по центру. У вырезок, срезанных верхом кадра исходника (все 4), верхний срез в 9:16 растворяется в фон на 120 px, а не рисуется прямой линией с обводкой.
4. **Шрифты.**
   - Oswald уже был, проверка зелёная. Anton (OFL, google/fonts `ofl/anton`, v2.116) положен в `public/fonts/Anton` вместе с OFL.txt.
   - **В Anton нет ґ є і ї Ґ Є І Ї.** Решение Олега 2026-10-18: Anton с исключением `latinOnly` и защитой кодом:
     - `env.manifest.json` → `fonts.files[]`: `latinOnly: true`, `family: "RM Anton"`, свой набор глифов `’A–Z` с обоснованием;
     - `src/theme/fonts.ts`: `FONTS.Anton.latinOnly`; `fontFor(id, text)` бросает ошибку на тексте с U+0400–U+04FF или ’ — весь текст аутро набирается через `fontFor`, поэтому сборка падает;
     - `scripts/readcheck.mjs`: новое нарушение **LATIN_ONLY** — любой текстовый узел кадра (в `<Readable>` и вне его), набранный семейством `latinOnly`, с кириллицей или ’;
     - позитивный контроль: `src/theme/fonts.test.ts --negative` и композиция `LatinOnlyFixture` («ЇЖАК» в `<Readable>` и «ҐЕДЗЬ» вне его — шрифтом Anton).
   - В кадре только имена из `names`: ROOK, JAX, HALE. Сборка падает, если `title` карточки не совпадает с `names`.
5. **Звук.**
   - Отрезок трека 44.203–60.720 с. SFX v1 из `outro.yaml sfx` сведены в `prepare` по `transientMs` с точностью до мс — в Remotion старт квантуется кадром (42 мс):
     - удар `shutter-modern` + `impact-metal-heavy-00N`: пик = удар;
     - реверс `whoosh`: старт = удар − 0.25 с;
     - громкость SFX ×0.35 к музыке.
   - Затем нормализация всего микса — loudnorm в два прохода, −14 LUFS / −1 dBTP. В композиции одна дорожка `mix.ep01.wav`; звук исходников заглушён.
   - Лицензии: `out/mia-outro/license-report.md`.
6. **Варианты кропа 9:16** живых планов — по 3 (A/B/C) на каждый из 8 планов (`src/videos/mia-outro/vertical.ts`, центр окна в долях ширины исходника). Стиллы и лист — ниже. До выбора Олега композиция берёт A.
7. **Конвейер ассетов** (как у beauty-studio):
   - `npm run mia:prepare` → `videos/mia-outro/assets/` (gitignore, 127 МБ) и ссылка `public/videos/mia-outro`;
   - `videos/mia-outro/assets.manifest.json` (в git) — sha256 исходников и выходов, зоны `shots.json`, раскладка карточек, cue-лист SFX, громкость; абсолютных путей в нём нет;
   - живые планы — точные кадры исходника → 1920×1080 и высокая версия под 9:16 (×3414×1920), all-intra.
8. **`MIA_SHORT_DIR`** добавлен в `env.manifest.json → data_dirs` (`required_for: mia-outro`, `must_contain`).

## Файлы
- **Новые:**
  - `src/videos/mia-outro/{model.ts, script.ts, vertical.ts, MiaOutro.tsx}`;
  - `videos/mia-outro/{prepare-assets.mjs, check-zones.mjs, stills.mjs, assets.manifest.json}`;
  - `src/qa/LatinOnlyFixture.tsx`, `src/theme/fonts.test.ts`;
  - `public/fonts/Anton/{Anton-Regular.ttf, OFL.txt}`;
  - этот отчёт.
- **Изменённые:**
  - `env.manifest.json` — `MIA_SHORT_DIR`, Anton `latinOnly`;
  - `src/theme/fonts.ts` — Anton, `latinOnly`, `fontFor`, `latinOnlyViolation`;
  - `scripts/readcheck.mjs` — LATIN_ONLY;
  - `src/Root.tsx` — MiaOutro, MiaOutroVertical, LatinOnlyFixture;
  - `package.json` — `mia:prepare`, `mia:zones`.
- **Вне git:** `shots.json` (MIA_SHORT_DIR) — +6 записей V11/V12. `videos/mia-outro/outro.yaml` **не менялся** (гейт 5): в `git status` его нет, `assets.manifest.json → outroSha256`.

## Проверки (команда → результат)

### Запретные зоны
```
MIA_SHORT_DIR=… npm run mia:zones
ep01: 12 пунктов, 396 кадров (16.517 с @ 24 fps); зон: 20 (outro.yaml 6, shots.json 14, подложено 0)
  · timeline[4] card V10 f221–221 (9.208–9.208 с): вырезка без фона в зона V10 8.13–9.458 с «spoiler-flashback — только кроп без BLOND» [outro.yaml forbidden] — допущено
  · timeline[4] card V10 f221–221 (9.208–9.208 с): вырезка без фона в зона V10 8.125–9.458 с «spoiler-flashback — только кроп (allowed_crop)» [shots.json V10-03a] — допущено
OK: ни один кадр не задевает запретные зоны            → exit 0
```
**Позитивный контроль, CLI:**
```
npm run mia:zones -- --inject V10:6.5-7.0
ЗАПРЕТНЫЕ ЗОНЫ: 1 нарушени(е/я) — сборка остановлена:
  ✗ timeline[3] live V10 f150–193 (6.250–8.042 с) задевает зона V10 6.5–7 с «ПОДЛОЖЕНО (позитивный контроль)» [--inject]: кадры 156–167 (12 шт.)   → exit 1
npm run mia:zones -- --inject V12:0.2-0.4
  ✗ timeline[7] live V12 f1–12 (0.042–0.500 с) задевает зона V12 0.2–0.4 с …: кадры 5–9 (5 шт.)   → exit 1
```
**Позитивный контроль, сборка** — та же подложенная зона через props роняет рендер:
```
npm run still -- MiaOutro 70 --props '{"episode":"ep01","qaInjectForbidden":[{"src":"V10","from":6.5,"to":7.0}]}'
 Error  Error: ЗАПРЕТНЫЕ ЗОНЫ: 1 нарушени(е/я) — сборка остановлена: …   → exit 1
npm run still -- MiaOutro 70 --props '{"episode":"ep01"}'   → out/stills/MiaOutro-70.png (без подложенной зоны — рендерится)
```

### Шрифты и latinOnly
```
MIA_SHORT_DIR=… npm run check -- --scope mia-outro
  ✓ шрифт Oswald Regular: глифы ґєіїʼҐЄІЇ есть
  ✓ шрифт Anton Regular: глифы ’ABCDEFGHIJKLMNOPQRSTUVWXYZ есть (свой набор: latinOnly: только латиница, тексты аутро MIA английские …)
  ✓ MIA_SHORT_DIR: 1 каталог(а), обязательные файлы на месте
OK: среда готова (scopes: base, render, mia-outro)          → exit 0
(без MIA_SHORT_DIR → ✗ MIA_SHORT_DIR не задан …, exit 1)
```
Проверка глифов Anton до решения: ґ✗ є✗ і✗ ї✗ ʼ✓ ’✓ Ґ✗ Є✗ І✗ Ї✗ (fontkit).
```
node --experimental-strip-types src/theme/fonts.test.ts   → 6 ✓, OK: fonts latinOnly (exit 0)
  ✓ fontFor(Anton, «ЇЖАК») — громкая ошибка — Шрифт Anton — latinOnly (…), а в тексте «ЇЖАК» есть Ї Ж А К: кириллицу и ’ им набирать нельзя
node --experimental-strip-types src/theme/fonts.test.ts --negative   → ✗ ПОЗИТИВНЫЙ КОНТРОЛЬ: «ЇЖАК» шрифтом Anton принят …; exit 1
node scripts/readcheck.mjs LatinOnlyFixture   → exit 1
  LATIN_ONLY            fx.latin                  0      4     1.00   2.00    "ЇЖАК"
  OK                    fx.latin.ok               0      3     1.00   2.00    "MIA"
  LATIN_ONLY  fx.latin  "ЇЖАК" шрифтом RM Anton с 0 с — шрифт без кириллицы (env.manifest.json latinOnly)
  LATIN_ONLY  (вне Readable)  "ҐЕДЗЬ" шрифтом RM Anton с 0 с — шрифт без кириллицы (env.manifest.json latinOnly)
  Текстов: 2; нарушений: 2 {"LATIN_ONLY":2}
node scripts/readcheck.mjs --self-test   → SELF-TEST OK: найдено ровно ожидаемое (SHORT, OUT_OF_FRAME, UNSAFE; fx.ok без нарушений)
```

### Readcheck аутро
Команды: `node scripts/readcheck.mjs MiaOutro --props '{"episode":"ep01"}'` и то же для `MiaOutroVertical` → exit 1. Отчёты: `out/qa/readcheck-MiaOutro.json` и `out/qa/readcheck-MiaOutroVertical.json`. Обе ориентации дают одинаковый результат: 15 текстов, **4 нарушения — все SHORT**, UNSAFE и LATIN_ONLY нет.

| id | нужно, с | держит, с | почему |
|---|---|---|---|
| MIA.tagline «THE INVENTOR» | 1.42 | 1.08 | карточка = 3 доли (1.375 с), подпись входит через 0.18 + 0.22 с |
| DARK.tagline «THE HUNTER» | 1.25 | 1.08 | то же |
| BLOND.tagline «FRIEND OR ENEMY?» | 1.67 | 1.08 | то же; в outro.yaml «на грани» |
| final.line «She built the future. They came to take it.» | 3.42 | 2.25 | от финального удара до конца трека 2.71 с |

Ниже допустимого по данным не опустить: SHORT — следствие долей в `outro.yaml`. Варианты для Олега:
- карточки по 4 доли (как у HALE — там подпись OK, 1.58 с) — ролик станет длиннее на 3 доли или потеряет живые планы;
- короче подписи;
- держать финальную строку в тишине после обрыва трека на 0.8–1.2 с (сейчас длительность = длина музыки);
- либо принять с пометкой, как в beauty-studio.

Первая версия readcheck нашла ещё 4 UNSAFE. Это ошибки раскладки, исправлены:
- JAX и HALE въезжали в правую зону на 0.08 с — теперь въезжают изнутри кадра;
- строка и хвост финала задевали нижнюю зону в 16:9 (+43 / +123 px) и правую в 9:16 (+20 px).

### Стиллы
Команда `node --experimental-strip-types videos/mia-outro/stills.mjs` — один бандл → 70 стиллов за 55 с.
- `out/mia-outro/stills/MiaOutro/`: на каждом ударе h1–h8 кадр удара (на карточках и финале — вспышка) и +2 кадра; середина каждой карточки; финал +0.5 / +1.4 / +2.5 с.
- `out/mia-outro/stills/MiaOutroVertical/`: то же, плюс варианты кропа `crop-<пункт>-<A|B|C>-f<кадр>.png`.
- Листы:
  - `out/mia-outro/sheets/MiaOutro-hits-cards.png`;
  - `out/mia-outro/sheets/MiaOutroVertical-hits-cards.png`;
  - **`out/mia-outro/sheets/MiaOutroVertical-crops.png`** — выбор кропа 9:16: строка = план, A/B/C.
- Просмотрено глазами:
  - карточки совпадают с эталоном — растр, лучи, обводка белая/чёрная, тень, имя с подложкой, подпись в плашке;
  - финал: «MIA» крупно, строка в две ровные строки (`text-wrap: balance`), «TO BE CONTINUED»;
  - кадров из запретных зон нет: V10 f150–193 — ROOK наводит пистолет на MIA (V10-02, разрешено), V12 — только f1–12 и f317–360.

**Варианты кропа 9:16:**

| План | A (по умолчанию) | B | C |
|---|---|---|---|
| [0] V5 f2–24 MIA | лицо по центру | левее | правее |
| [2] V10 f97–108 | ROOK | ROOK и MIA | MIA вниз головой |
| [3] V10 f150–193 | рука с пистолетом у двери | пистолет и MIA | MIA |
| [5] V9 f157–168 JAX | лицо по центру | левее | правее |
| [7] V12 f1–12 HALE | лицо и гарнитура | больше неба перед лицом | затылок |
| [9] V12 f317–360 | дверь и заряд (HALE в кадре не всегда) | HALE | заряд с огоньком |
| [10] затишье V5 f239–282 | дверь с прорезью | дверь крупнее | дверь левее и стена |
| [11] финал V5 f283–347 | как затишье | | |

**Резкость 9:16:** V5 и V9 — исходники 720p, в вертикали это апскейл ×2.67 (в 16:9 — ×1.5): мягче 4K-планов. V10 и V12 — 4K, уменьшение ×0.83.

### Черновики (0.5, CRF 24)
```
npx remotion render src/index.ts MiaOutro out/mia-outro/draft/MiaOutro-draft-0.5.mp4 --scale=0.5 --crf=24 --props='{"episode":"ep01"}'  → Encoded 396/396
npx remotion render src/index.ts MiaOutroVertical out/mia-outro/draft/MiaOutroVertical-draft-0.5.mp4 --scale=0.5 --crf=24 …          → Encoded 396/396
ffprobe: 960×540 и 540×960, 24 fps, 396 кадров, 16.512 с, видео + аудио
```

### Громкость
```
prepare: микс ep01: музыка 44.203–60.72 с + 12 SFX; до нормализации I -15.32 / TP -4.47 → I -13.8 LUFS / TP -3.2 dBTP (loudnorm, linear)
ffmpeg ebur128 по черновикам (оба): I -13.8 LUFS, LRA 1.0 LU, Peak -3.1 dBFS
```
−14 ±1 LUFS и TP ≤ −1 dBTP — в норме. linear-режим не поднял громче −13.8: ограничивает истинный пик.

**На слух не проверял** (beat-sync): ни отрезок, ни положение SFX. «Ок» Олега на слух по `C_preroll_8bars_CLICKS.wav` в чате не было — отрезок взят из `outro.yaml` по указанию задачи.

### Регрессия
- `npm run test:motion` → OK: 2 файла.
- `npx tsc --noEmit` → exit 0.
- `node scripts/readcheck.mjs --self-test` → OK.

## Таблица «кадр ↔ доля ↔ событие» (ep01, 24 fps, доля 0.4587 с = 11 кадров)
| # | Кадры ролика | Время, с | Доли | Пункт | Исходник | Титр | Звук (пик, с) |
|---|---|---|---|---|---|---|---|
| 0 | 0–21 | 0.000–0.917 | 2 | live | V5 f2–24 | — | музыка |
| 1 | 22–54 | 0.928–2.292 | 3 (h1) | card MIA | V5 f24 (вырезка) | MIA · The Inventor | shutter 0.928; whoosh реверс старт 0.678; impact-000 0.928 |
| 2 | 55–66 | 2.304–2.792 | 1 | live | V10 f97–108 | — | музыка |
| 3 | 67–110 | 2.773–4.625 | 4 (h2) | live | V10 f150–193 | — | музыка |
| 4 | 111–143 | 4.608–6.000 | 3 (h3) | card DARK | V10 f221 (вырезка) | ROOK · The Hunter | shutter 4.608; реверс 4.358; impact-001 4.608 |
| 5 | 144–154 | 5.984–6.458 | 1 | live | V9 f157–168 | — | музыка |
| 6 | 155–187 | 6.453–7.833 | 3 (h4) | card BLOND | V9 f168 (вырезка) | JAX · Friend or enemy? | shutter 6.453; реверс 6.203; impact-002 6.453 |
| 7 | 188–198 | 7.829–8.292 | 1 | live | V12 f1–12 | — | музыка |
| 8 | 199–242 | 8.288–10.125 | 4 (h5) | card OFFICER | V12 f12 (вырезка) | HALE · The Law | shutter 8.288; реверс 8.038; impact-000 8.288 |
| 9 | 243–286 | 10.122–11.958 | 4 (h6) | live | V12 f317–360 | — | музыка |
| 10 | 287–330 | 11.957–13.792 | 4 (h7) | lull | V5 f239–282, наезд 4 % | — | музыка |
| 11 | 331–395 | 13.792–16.500 | хвост (h8) | final | V5 f283–347 | MIA · She built the future. They came to take it. · To be continued | музыка (вспышка) |

Удар → кадр: `round(t · 24)` от времени, без накопления; расхождение ≤ 11 мс (< 1 кадра).

## Отклонения от задачи и почему
- **SFX сведены в `prepare`, а не `<Audio>` в Remotion:** там старт квантуется кадром (42 мс), а пик должен лечь на удар по `transientMs` с точностью до мс. Нормализация −14 / −1 применяется к итоговому миксу.
- **Реверс свиста:** `remotion__whoosh` длится 148 мс, а `lead` 0.25 с длиннее файла. Поэтому старт = удар − 0.25 с (beat-sync: «реверс за 0.2–0.4 с до удара»), реверс кончается за ~0.1 с до удара.
- **Финал без `from`** продолжает исходник V5 после затишья (f283 →), и это тоже проходит проверку зон.
- **Затишье** — живой V5 f239–282 с наездом `push` 4 %, а не стоп-кадр.
- **Цвет растра и лучей** не задан в `outro.yaml`, выведен из `bg`: точки темнее на 30 % (у тёмного `#1E1E1E` светлее на 18 %); лучи — `tagColor`, чёрные на светлом и белые на тёмном фоне.
- **«ок» Олега на слух** по отрезку в чате не звучало (см. «Громкость»).
- **Readcheck не зелёный:** 4 SHORT упираются в данные (см. таблицу выше).
- **Рабочие имена DARK/BLOND/OFFICER** остались в коде и данных (`outro.yaml`), в кадре — только `names`.

## Предложения (вне рамок задачи, не сделано)
- Решить 4 SHORT — варианты выше; это правка `outro.yaml` (Олег/архитектор).
- Выбрать кроп 9:16 по листу `MiaOutroVertical-crops.png` и записать выбор в `outro.yaml` (поле на план); сейчас варианты живут в `src/videos/mia-outro/vertical.ts`.
- Лист «вокруг ударов» (8 кадров через 0.1 с) — по черновику после правок долей.
- Мастер-скрипт полного рендера с повторной проверкой громкости и цветового диапазона — когда Олег скажет «ок» по черновику.

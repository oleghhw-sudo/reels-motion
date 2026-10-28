# Отчёт: 025-person-matte
Статус: частично — всё построено и откалибровано на эталоне с известной правдой; **живой эталон (дубль Олега) не сделан — живой съёмки человека на диске нет**; критерий скорости Vision ≤ 1 с/с не достигнут (см. таблицу). Подключение к эффектам §3 O и правка `cinematic-fx` — после «да» Олега (СТОП по задаче).
Время: ≈ 125 мин (19:05–21:10, включая фоновые прогоны калибровки ≈ 25 мин)

## Разведка (этап 0)
| Что | Факт |
|---|---|
| macOS | 27.0 (26A428), Apple M5, arm64 |
| Xcode / swiftc | `/Applications/Xcode.app/Contents/Developer`, Swift 6.4 (swiftlang-6.4.0.34.1) — Command Line Tools на месте |
| Python | системный `/opt/homebrew/bin/python3` = 3.15.0 без torch; есть `python3.12`; в репо `.venv-asr` (3.12.13, torch 2.8.0, **mps: True**) |
| ffmpeg | 8.1 (`~/homebrew/bin`), есть `prores_ks`, `prores_videotoolbox`, `libx264`; **нет `drawtext`** (без freetype) — подписи на листе рисую сам |
| node | 24.14.0 |
| RVM | на диске не было → поставлен как внешний инструмент в `~/Projects/RobustVideoMatting` (см. ниже) |
| Видео с человеком | **живой съёмки человека нет**: в `videos/` — генерации Seedance (MIA, стилизованные персонажи), `~/Movies/CapCut/0424.mov` — Veo-анимация; люди есть только в демо-роликах MiniMax Hailuo (`~/Movies/Hub/Projects/H3 PlayGround/*.mp4`, витрина «MiniMax H3 ShowCase») — это генерации MiniMax Hailuo (стенд-ин, не съёмка). Их взял как стенд-ин для эталона с известной правдой: только локальное измерение, ничего из них в git (листы — в `out/`, gitignore). Живой эталон — дубль Олега (ниже «Что нужно от Олега») |

## Сделано
- **`tools/matte/vision-matte.swift`** (компилируется обёрткой: `swiftc -O -o out/bin/vision-matte …`, бинарь не в git). Два режима:
  - `segment`: `AVAssetReader` + `AVAssetReaderVideoCompositionOutput` с `videoComposition(withPropertiesOf:)` — кадры приходят уже повёрнутыми по метаданным телефона; на каждом кадре `VNGeneratePersonSegmentationRequest` (`.accurate`, `OneComponent8`; маска у Vision 1512×2016 для 9:16) и `VNDetectFaceRectanglesRequest` (самое большое лицо; лицо целиком вне кропа 9:16 отбрасывается). Кроп «cover» под 9:16 по центру считается сам. Маска → рабочий размер 360×640 (vImage) → `raw.y8`; сырые лица → `faces.raw.json`. Кадры считаются пачками по `--jobs` параллельно (см. «Скорость»).
  - `smooth`: сглаживание во времени по рецепту §J, **одна реализация на оба движка, внутри Swift (Accelerate)** — обоснование: основной путь (Vision) остаётся без Python и без зависимостей, а vImage даёт dilate/масштаб/blur в миллисекунды; RVM отдаёт такой же `raw.y8`, и его гонят через тот же `smooth`. Шаги: порог smoothstep 0.35–0.65 → рост только внутри dilate 31×31 прошлой маски (15 px на 360 ≈ 45 px на 1080) → там, где текущая маска 0, прошлое не подмешивается (ушедший кусок не тянется) → смесь 0.3 прошлого / 0.7 текущего → апскейл 1080×1920 (`vImageScale_Planar8`) → gaussian 1.4 px (разделимая свёртка) → кадры gray в stdout → ffmpeg. Флаги `--no-thr`, `--no-grow`, `--blend`, `--blur`, `--work`.
  - Лицо: прямоугольник Vision → иначе по силуэту сглаженной маски (макушка = первая строка с ≥ 3 px; ширина головы = медиана строк 2–6 % высоты ниже макушки; плечи = первая строка шире головы в 1,6 раза, иначе 25 % высоты; центр лица на 55 % высоты головы, ширина 0,8 от максимума в голове) → иначе `hold` (прошлое значение), `none` — если лица не было ни разу. Сглаживание 0.7 прошлое / 0.3 новое. Время `t` — секунды от начала отрезка (`from` записан отдельно).
- **`tools/matte/rvm-matte.py`** — запасной движок: `sys.path` на `RVM_DIR`, `MattingNetwork(variant)`, веса из `RVM_DIR`, устройство `mps` (при ошибке — `cpu` с предупреждением в stderr), кадры через ffmpeg (автоповорот, тот же кроп, что у Vision, вход сети 1080×1920, `downsample_ratio` 0.25), альфа → 360×640 → `raw.y8` + `info.json` (коммит RVM, веса, устройство, torch). Лицо в режиме rvm даёт `vision-matte segment --no-mask`.
- **`tools/matte/matte.mjs`** = `npm run matte -- <video> --id <id> [--engine vision|rvm] [--from S --to S] [--work] [--thr|--no-thr] [--dilate|--no-grow] [--blend] [--blur] [--variant] [--downsample] [--keep-work] [--no-link] [--prores-ks]`. Пишет в `MATTE_DIR/<id>/`: `matte.mp4` (H.264 crf 10, yuv420p, 30 fps), `person.mov` (ProRes 4444 с альфой, 30 fps, 1080×1920; кодер `prores_videotoolbox` ≈ 4× быстрее `prores_ks`, при отказе — `prores_ks`), `face.json`, `matte.json` (движок, версия = macOS + ревизии Vision / коммит RVM + веса, параметры, источник с sha256, from/to, `durationSec`, `renderSecPerSec`, тайминги по шагам, sha256 и число кадров выходов). Ссылка `public/matte/<id>` → `MATTE_DIR/<id>` для Remotion (`public/matte/` в `.gitignore`). Для `rvm` порог и рост по умолчанию выключены (решение калибровки ниже).
- **`env.manifest.json`** → `data_dirs`: `MATTE_DIR` (`required_for: matte`), `RVM_DIR` (`required_for: matte-rvm`, `must_contain` код, venv, оба файла весов). Гейт 2 проверен красным (ниже).
- **`src/matte/`** — читатель (гейт 3: поля и читатель вместе): `face.ts` (`loadFace` с проверкой формы, `faceAt(t)` — линейная интерполяция cx/cy/w, source ближайшего кадра, `faceDuration`), `BehindPerson.tsx` (`matteSrc(id)`, `<BehindPerson person video?>`: фон-видео → дети → `person.mov` через `<OffthreadVideo transparent>`; без `mask-image`/`backgroundImage`/`backdrop-filter`), `index.ts`, `matte.test.ts` (`npm run test:matte`, `-- --negative`), `MatteLab.tsx` — композиция `MatteLab` (props `{id}`, длина из `face.json` через `calculateMetadata`): градиент → жёлтый круг «за человеком» на лице → человек → рамка лица.
- **`tools/matte/sheet.mjs`** = `npm run matte:sheet -- --id <id>` → `out/<id>/matte/sheet.jpg` + `sheet.json`: 12 кадров (кадр + маска красным 40 % + рамка лица: зелёная Vision / жёлтая силуэт / серая hold), под ними полоса |m_t − m_{t−1}| ×2, подписи своим растровым шрифтом (в ffmpeg нет drawtext); в json — разница соседних кадров по всем кадрам.
- **`tools/matte/calibrate.mjs`** = `npm run matte:calibrate -- --truth <id> --test <id>` (метрики на кадр и сводка → `MATTE_DIR/_calibration/<test>.json`), `--table`, `--empty <id>`, `--self-test --truth <id>`.
- `THIRD-PARTY.md` (новый, в корне): RVM — внешний инструмент, GPL-3.0, не распространяется; ссылки на `src/motion/THIRD-PARTY-LICENSES.md` и `vendor/motion-prompt`.
- `package.json`: `matte`, `matte:sheet`, `matte:calibrate`, `test:matte`. `src/Root.tsx`: + композиция `MatteLab`.

## RVM — внешний инструмент (вне репо)
`RVM_DIR=~/Projects/RobustVideoMatting`: `git clone --depth 1 https://github.com/PeterL1n/RobustVideoMatting`, коммит **53d74c6826735f01f4406b5ca9075eee27bec094** (2023-03-13); `.venv` на `python3.12` (torch 2.8.0, torchvision 0.23.0, numpy, pillow; mps доступен); веса из releases/v1.0.0: `rvm_resnet50.pth` sha256 `c191a807251164c0…` (107,9 МБ), `rvm_mobilenetv3.pth` `3c7c1d92033f7c38…` (15,2 МБ). Передано через окружение процесса (`.env` билдер не трогает): `MATTE_DIR=$HOME/Movies/reels-matte RVM_DIR=$HOME/Projects/RobustVideoMatting`.

## Проверки (команда → результат)
1. `npm run check -- --scope matte` без переменной → `СРЕДА НЕ ГОТОВА — недостаёт (1): ✗ MATTE_DIR не задан (ни в окружении, ни в .env) — …`, exit 1 (гейт 2 красный). С `MATTE_DIR=~/Movies/reels-matte` до создания каталога → `✗ MATTE_DIR: каталога … нет`; после `mkdir` → `OK: среда готова (scopes: base, render, matte)`. `--scope matte-rvm` с `RVM_DIR` → обязательные файлы на месте.
2. `swiftc -O -o out/bin/vision-matte tools/matte/vision-matte.swift` → только предупреждения об устаревших API AVFoundation (macOS 26/27: `AVMutableVideoComposition`, `copyNextSampleBuffer`), exit 0.
3. `npx tsc --noEmit -p tsconfig.json` → exit 0.
4. `npm run test:matte` → 13 ✓, `OK`, exit 0. `npm run test:matte -- --negative` → `ПОЗИТИВНЫЙ КОНТРОЛЬ … ✗ negative: faceAt(0.25).cx === 600`, `ПРОВАЛ: 1`, **exit 1** (гейт 4).
5. `npm run still -- MatteLab 60 --props '{"id":"cal-D-truth"}'` → `out/stills/MatteLab-60.png`: человек (ProRes 4444 через `<OffthreadVideo transparent>`) поверх жёлтого круга «за человеком», круг привязан к лицу из `face.json`, собака (не человек) вырезана → альфа и читатель работают в Remotion. Рендер 5,3 с.
6. Дым: `npm run matte -- ~/Movies/Hub/…/59.mp4 --id smoke-59 --from 0 --to 5` → 150 кадров `matte.mp4` и `person.mov`; `--engine rvm` → то же. `npm run matte:sheet -- --id smoke-59` → лист, проверен глазами (маска по лицу, рамки лица; на зеркальных очках маска рваная у обоих движков).
7. Гейт 4 для калибровки: `npm run matte:calibrate -- --self-test --truth cal-B-truth` → `правда cal-B-truth против себя же со сдвигом 20 px (10 кадров): IoU средний 0.840, порог 0.95 … сдвиг пойман, проверка упала — как и должна`, **exit 1**.
8. Видео без человека (контроль б): `--empty ctl-empty-interior` (стоп-кадр вокзала, Vision) → `максимум маски 0/255, площадь 0.000 %, лицо {"none":150} → OK`. **`ctl-empty-window` (стена с окном и котом, Vision) → ПРОВАЛ: максимум 255/255, площадь до 43.2 % кадра, лицо {"none":21,"silhouette":28,"hold":101}** — Vision принимает кота крупным планом за человека (кадры ≈ 115–135, лист `out/ctl-empty-window/matte/sheet.jpg`). RVM на том же видео: максимум 232/255, площадь ≤ 0.298 % (пятнышко на 1 кадре), лицо none → OK.
9. Детерминизм (контроль в): `ctl-det-1` и `ctl-det-2` (один файл дважды, Vision) → sha256 `matte.mp4` **совпадает** (`60bce609…`), `face.json` совпадает (`e7097bc7…`), `person.mov` совпадает (`7cae8dfb…`, prores_videotoolbox) — Vision и весь конвейер детерминированы.
10. Параллельный Vision (`--jobs`): `raw.y8` при `--jobs 1/4/8` побайтно совпадает с последовательной версией (`cmp`), скорость `segment` на 150 кадрах 1080×1920: последовательно 23.2 к/с, `--jobs 4` 32.9 к/с, `--jobs 8` 30.3 к/с → по умолчанию 4.

## Калибровка (эталон с известной правдой)
**Материал (генерации MiniMax Hailuo — стенд-ин, не съёмка, см. разведку):** 4 отрезка по 5 с из демо-генераций MiniMax Hailuo (стенд-ин, не съёмка; `~/Movies/Hub/Projects/H3 PlayGround`): A = `59.mp4` 0–5 с (крайне крупное лицо, зеркальные очки, склейка; правда сомнительная), B = `59.mp4` 5–10 с (две модели в полный рост + 1,7 с товарный план без людей — проверка ложной фигуры), C = `02.mp4` 0–5 с (трое детей бегут, волосы, быстрое движение), D = `34.mp4` 0–5 с (мужчина с собакой на руках крупно — ближе всего к говорящей голове; собака по правде не человек).
**Правда:** RVM `resnet50` (`cal-{A,B,C,D}-truth`), листы проверены глазами (`out/cal-*-truth/matte/sheet.jpg`): B, C, D — маска держится, D стабильна (flickerFramePermille 2,5), собака вырезана; A рвётся на очках и на склейке → в вердикте не учитывается. Вырезки композитированы на 3 фона (`MATTE_DIR/_cal/*.mp4`, 1080×1920, 30 fps): `solid` — однотонный тёмно-синий, `interior` — стоп-кадр вокзала (скамьи, турникеты, табло), `window` — стена с ярким окном и движущимся котом (видео). **Смещение в пользу RVM по построению:** правда — его же выход, так что IoU/край у RVM завышены; честный вердикт — только живой эталон Олега и листы глазами.
**Метрики** (`npm run matte:calibrate`, порог маски 127, полоса края ±8 px на 1080×1920, flickerEdge — |m_t − m_{t−1}| в полосе края, flickerEdgeQuiet — то же на «тихих» кадрах (правда меняется < 2 % площади), дыра — компонента фона теста внутри его силуэта > 0,5 % кадра там, где по правде человек; с/с — `renderSecPerSec` всего конвейера на M5):

| тест | движок | IoU ср. | IoU мин. | край | flickerEdgeQuiet (тихих к.) | flickerEdge | дыры | с/с (справка) |
|---|---|---|---|---|---|---|---|---|
| cal-A-interior-rvm | rvm | 0.865 | 0.470 | 0.220 | 0.0570 (102) | 0.0598 | 0/150 | 2.31 |
| cal-A-interior-vision | vision | 0.661 | 0.000 | 0.344 | 0.0523 (102) | 0.0715 | 4/150 | 1.21 |
| cal-A-solid-rvm | rvm | 0.789 | 0.431 | 0.285 | 0.0406 (102) | 0.0461 | 0/150 | 2.14 |
| cal-A-solid-vision | vision | 0.698 | 0.202 | 0.376 | 0.0415 (102) | 0.0477 | 2/150 | 1.21 |
| cal-A-window-rvm | rvm | 0.932 | 0.653 | 0.134 | 0.0673 (102) | 0.0725 | 2/150 | 2.07 |
| cal-A-window-vision | vision | 0.796 | 0.019 | 0.317 | 0.0881 (102) | 0.0892 | 1/150 | 1.23 |
| cal-B-interior-rvm | rvm | 0.919 | 0.000 | 0.075 | 0.0312 (102) | 0.0510 | 0/150 | 2.31 |
| cal-B-interior-vision | vision | 0.888 | 0.000 | 0.110 | 0.0355 (102) | 0.0405 | 0/150 | 1.17 |
| cal-B-solid-rvm | rvm | 0.896 | 0.000 | 0.067 | 0.0327 (102) | 0.0605 | 0/150 | 1.92 |
| cal-B-solid-vision | vision | 0.880 | 0.000 | 0.133 | 0.0318 (102) | 0.0387 | 0/150 | 1.13 |
| cal-B-window-rvm | rvm | 0.940 | 0.000 | 0.053 | 0.0336 (102) | 0.0610 | 0/150 | 2.01 |
| cal-B-window-vision | vision | 0.797 | 0.000 | 0.146 | 0.0378 (102) | 0.0364 | 0/150 | 1.19 |
| cal-C-interior-rvm | rvm | 0.975 | 0.900 | 0.167 | 0.1242 (51) | 0.1828 | 2/150 | 2.21 |
| cal-C-interior-vision | vision | 0.906 | 0.543 | 0.317 | 0.1370 (51) | 0.2218 | 14/150 | 1.24 |
| cal-C-solid-rvm | rvm | 0.980 | 0.900 | 0.115 | 0.1279 (51) | 0.1859 | 1/150 | 2.18 |
| cal-C-solid-vision | vision | 0.936 | 0.696 | 0.281 | 0.1576 (51) | 0.2660 | 15/150 | 1.26 |
| cal-C-window-rvm | rvm | 0.958 | 0.698 | 0.150 | 0.1200 (51) | 0.1702 | 3/150 | 2.29 |
| cal-C-window-vision | vision | 0.918 | 0.558 | 0.303 | 0.1586 (51) | 0.2423 | 12/150 | 1.22 |
| cal-D-interior-rvm | rvm | 0.985 | 0.684 | 0.151 | 0.0781 (146) | 0.0777 | 7/150 | 2.1 |
| cal-D-interior-vision | vision | 0.953 | 0.608 | 0.264 | 0.1000 (146) | 0.0998 | 3/150 | 1.28 |
| cal-D-solid-rvm | rvm | 0.640 | 0.434 | 0.355 | 0.0362 (146) | 0.0361 | 1/150 | 2.09 |
| cal-D-solid-vision | vision | 0.856 | 0.450 | 0.307 | 0.0926 (146) | 0.0915 | 1/150 | 1.22 |
| cal-D-window-rvm | rvm | 0.991 | 0.820 | 0.106 | 0.0845 (146) | 0.0839 | 0/150 | 2.04 |
| cal-D-window-vision | vision | 0.847 | 0.501 | 0.337 | 0.1087 (146) | 0.1072 | 0/150 | 1.46 |

Варианты параметров сглаживания (фон `interior`; для RVM — порог+рост включены, для Vision — выключены по одному):

| тест | движок | IoU ср. | IoU мин. | край | flickerEdgeQuiet (тихих к.) | flickerEdge | дыры | с/с (справка) |
|---|---|---|---|---|---|---|---|---|
| cal-B-interior-rvm-thr | rvm | 0.923 | 0.000 | 0.087 | 0.0326 (102) | 0.0570 | 0/150 | 2.01 |
| cal-B-interior-rvm | rvm | 0.919 | 0.000 | 0.075 | 0.0312 (102) | 0.0510 | 0/150 | 2.31 |
| cal-B-interior-vision-blend0 | vision | 0.888 | 0.000 | 0.113 | 0.0379 (102) | 0.0436 | 0/150 | 1.16 |
| cal-B-interior-vision-nogrow | vision | 0.895 | 0.000 | 0.108 | 0.0353 (102) | 0.0407 | 0/150 | 1.13 |
| cal-B-interior-vision-rawthr | vision | 0.886 | 0.000 | 0.106 | 0.0336 (102) | 0.0391 | 0/150 | 1.17 |
| cal-B-interior-vision-w540 | vision | 0.888 | 0.000 | 0.110 | 0.0355 (102) | 0.0405 | 0/150 | 1.21 |
| cal-B-interior-vision | vision | 0.888 | 0.000 | 0.110 | 0.0355 (102) | 0.0405 | 0/150 | 1.17 |
| cal-C-interior-rvm-thr | rvm | 0.974 | 0.903 | 0.277 | 0.1476 (51) | 0.2409 | 3/150 | 2.03 |
| cal-C-interior-rvm | rvm | 0.975 | 0.900 | 0.167 | 0.1242 (51) | 0.1828 | 2/150 | 2.21 |
| cal-C-interior-vision-blend0 | vision | 0.906 | 0.543 | 0.348 | 0.1357 (51) | 0.2523 | 12/150 | 1.5 |
| cal-C-interior-vision-nogrow | vision | 0.926 | 0.543 | 0.314 | 0.1360 (51) | 0.2280 | 16/150 | 1.61 |
| cal-C-interior-vision-rawthr | vision | 0.907 | 0.545 | 0.238 | 0.1309 (51) | 0.1888 | 14/150 | 1.62 |
| cal-C-interior-vision-w540 | vision | 0.907 | 0.543 | 0.318 | 0.1369 (51) | 0.2223 | 14/150 | 1.58 |
| cal-C-interior-vision | vision | 0.906 | 0.543 | 0.317 | 0.1370 (51) | 0.2218 | 14/150 | 1.24 |
| cal-D-interior-rvm-thr | rvm | 0.985 | 0.684 | 0.231 | 0.0892 (146) | 0.0884 | 8/150 | 2.12 |
| cal-D-interior-rvm | rvm | 0.985 | 0.684 | 0.151 | 0.0781 (146) | 0.0777 | 7/150 | 2.1 |
| cal-D-interior-vision-blend0 | vision | 0.953 | 0.608 | 0.275 | 0.1110 (146) | 0.1109 | 3/150 | 1.5 |
| cal-D-interior-vision-nogrow | vision | 0.947 | 0.608 | 0.264 | 0.1000 (146) | 0.0998 | 3/150 | 1.53 |
| cal-D-interior-vision-rawthr | vision | 0.954 | 0.608 | 0.207 | 0.0855 (146) | 0.0854 | 2/150 | 1.55 |
| cal-D-interior-vision-w540 | vision | 0.953 | 0.608 | 0.266 | 0.1000 (146) | 0.0998 | 3/150 | 1.52 |
| cal-D-interior-vision | vision | 0.953 | 0.608 | 0.264 | 0.1000 (146) | 0.0998 | 3/150 | 1.28 |

**Решения по параметрам:** RVM — порог и рост остаются **выключенными** (с ними край хуже: 0.087/0.277/0.231 против 0.075/0.167/0.151, flickerEdge выше, IoU тот же). Vision — рецепт §J оставлен по умолчанию; `--work 540x960` ничего не даёт; `--blend 0` чуть хуже; **`--no-thr` (сырая мягкая маска Vision без smoothstep) лучше по краю (0.207 против 0.264 на D, 0.238 против 0.317 на C) и по flickerEdge** — кандидат на новый дефолт после живого эталона (сейчас флаг).

**Критерий приёмки Vision (гипотеза из задачи) — не пройден на стенд-ине:**
| критерий | Vision | RVM | |
|---|---|---|---|
| IoU ≥ 0.95 | только D-interior (0.953); D-solid 0.856, D-window 0.847 (кот), C 0.906–0.936, B 0.80–0.89 | C и D-interior/window 0.958–0.991; **D-solid 0.640** (RVM теряет человека на однотонном тёмном фоне), B 0.90–0.94 | смещение правды в пользу RVM |
| flickerEdgeQuiet ≤ 1,5× RVM | 0.9–1.3× — **да** | — | |
| дыр 0 % | 0–16 кадров из 150 (C — волосы и руки, D-interior 3) | 0–8 | оба не 0 |
| скорость (справка; критерий ≤ 1 с/с снят в 025-Б) | 1.2–1.3 с/с (segment 0.94 + smooth 0.17 + ProRes 0.14); на 15 с: 19.2 с = 1.27 с/с | 1.6–2.3 с/с (resnet50; 15 с: 24.6 с = 1.63); mobilenetv3 1.29 с/с | |
| ложная фигура на пустом видео | **кот крупным планом → «человек» до 43 % кадра**; D-window: кот под человеком приклеивается к маске (flickerFramePermille 33, IoU 0.847) | чисто (≤ 0.3 %) | |

**Вердикт билдера: решение не менять, вопрос Олегу.** На стенд-ине RVM точнее по краю и устойчивее к животным и склейкам, но правда — его собственная; Vision проигрывает по IoU и по «коту», выигрывает по скорости (в 1,3–1,8 раза), детерминизму и отсутствию зависимостей. Для говорящей головы без животных (D-interior) Vision даёт 0.953 — на грани порога. Настоящий ответ даст живой дубль Олега (команды ниже) — оба листа рядом.

**Предложенное правило переключения на запасной** (уже в обёртке как `selfCheck` в `matte.json`, без правды, автоматически не перегоняет): после прогона Vision по `matte.mp4` (270×480) считаются `flickerFramePermille` (средняя |m_t − m_{t−1}| по всему кадру, ‰) и `areaJumpMax` (максимальный скачок площади маски между соседними кадрами, доля кадра). **`flickerFramePermille > 25` или `areaJumpMax > 0.10` → предупреждение «проверь лист, перегнать `--engine rvm`».** На калибровке: D-window (кот) → 33,1 и 0,254 → предупреждение; D-interior (чистая голова) → 7,8, без предупреждения; B-interior → areaJumpMax 0,353 на кадре 74 — это склейка (ложная тревога, допустимая: предупреждение, не перегон); пустой кот → 0,64. Пороги — гипотеза, уточнить по живому дублю. В `cinematic-fx` §3 O записать после «да» Олега.

**Листы кадров:** `out/cal-{A,B,C,D}-truth/matte/sheet.jpg` (правда), `out/cal-B-interior-{vision,rvm}/matte/sheet.jpg`, `out/cal-D-window-{vision,rvm}/matte/sheet.jpg`, `out/cal-A-interior-vision`, `out/cal-D-interior-vision`, `out/ctl-empty-window{,-rvm}/matte/sheet.jpg`, `out/smoke-59{,-rvm}/matte/sheet.jpg`; JSON метрик — `MATTE_DIR/_calibration/*.json`; still Remotion — `out/stills/MatteLab-60.png`.

**Скорость на 15 с (`59.mp4`, 1440×2560 → 1080×1920, 362 кадра @24 → 453 @30):** Vision 19,2 с = **1,27 с/с** (segment 14,2 / smooth 2,7 / ProRes 2,1); RVM resnet50 24,6 с = **1,63 с/с** (segment 19,9); RVM mobilenetv3 19,5 с = 1,29 с/с. Без аппаратного ProRes было бы ещё +3,5 с на 15 с.

## Что не вышло
- Критерий ≤ 1 с/с для Vision: 1,2–1,3 с/с (критерий снят в 025-Б, скорость — справка). Сама сеть `.accurate` даёт ≈ 33 к/с на 1080×1920 при `--jobs 4` (ANE упирается), остальное — ProRes и сглаживание.
- Живой эталон — нет дубля (см. «Что нужно от Олега»).
- Лицо Vision: в профиль и в больших очках `VNDetectFaceRectanglesRequest` молчит (A: 7 из 150 кадров, B: 90–101), работает силуэтный запасной (рамка грубее).

## Что нужно от Олега (живой эталон)
Дубль 10–15 с на телефоне 9:16: жестикуляция, руки перед телом, сзади кресло или лампа, по возможности окно. Положить файл куда угодно и выполнить (терминал Mac, из `~/Projects/reels-motion`; `MATTE_DIR` и `RVM_DIR` — или в `.env`, или как ниже):
```
MATTE_DIR=$HOME/Movies/reels-matte RVM_DIR=$HOME/Projects/RobustVideoMatting npm run matte -- /путь/к/дублю.mp4 --id live-01
```
```
MATTE_DIR=$HOME/Movies/reels-matte RVM_DIR=$HOME/Projects/RobustVideoMatting npm run matte -- /путь/к/дублю.mp4 --id live-01-rvm --engine rvm
```
```
MATTE_DIR=$HOME/Movies/reels-matte npm run matte:sheet -- --id live-01 && MATTE_DIR=$HOME/Movies/reels-matte npm run matte:sheet -- --id live-01-rvm
```
Листы: `out/live-01/matte/sheet.jpg` и `out/live-01-rvm/matte/sheet.jpg` — вердикт глазами. Живьём в Studio: композиция `MatteLab`, props `{"id":"live-01"}`.

## Отклонения от задачи и почему
- Эталон с известной правдой построен не на живой съёмке (её на диске нет), а на демо-роликах MiniMax (реальные люди, только локально, см. разведку). Отрезок A (крайне крупное лицо, зеркальные очки) — правда RVM сама сомнительная (лист проверен: маска рвётся на очках и на склейке), оставлен в таблице как «трудный», в вердикте не учитывается.
- `MATTE_DIR`, `RVM_DIR` переданы через окружение процесса, не через `.env` (билдер `.env` не трогает); семантика по манифесту та же.
- Сглаживание — в Swift, не в `temporal.py` (обоснование в «Сделано»).
- Ворота роста (dilate прошлой маски) получили исключение: если прошлая маска пуста (< 0,5 % кадра), ворота не применяются (`--grow-min`). Без этого после пустого кадра (человек вышел, склейка) маска Vision не возвращалась никогда — найдено на композите B (разрыв с товарным планом) и на A.
- `person.mov` кодируется `prores_videotoolbox` (≈ 0,6 с на 5 с видео против 3,4 с у `prores_ks`); `--prores-ks` оставлен флагом. Выход у обоих ProRes 4444 `yuva444p12le` с альфой.

## Предложения (вне рамок задачи, не сделано)
- `.env`: строки `MATTE_DIR=/Users/olegkhukhashvili/Movies/reels-matte` и `RVM_DIR=/Users/olegkhukhashvili/Projects/RobustVideoMatting` — тогда команды выше без префиксов (Олег вводит сам).
- Скорость Vision упирается в саму нейросеть `.accurate` (≈ 25–30 к/с на 1080×1920 при любом `--jobs`): если 1 с/с нужен жёстко — `qualityLevel = .balanced` как флаг `--quality` с проверкой на калибровке (край хуже), либо принять 1,2–1,5 с/с.
- Лицо: `VNDetectFaceRectanglesRequest` теряет лицо в профиль и в больших очках (силуэтный запасной срабатывает часто); можно добавить `VNDetectHumanBodyPoseRequest` (нос/уши) как второй источник — отдельная задача.
- В `CLAUDE.md` → «Команды» добавить `npm run matte`, `matte:sheet`, `matte:calibrate`, `test:matte` (правка CLAUDE.md — не в этой задаче).
- `cinematic-fx` §3 O и `EFFECTS_PANTRY` §J: правило переключения и пути prep — после «да» Олега (задача велит СТОП).

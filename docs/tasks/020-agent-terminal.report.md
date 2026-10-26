# Отчёт: 020-agent-terminal
Статус: готово
Время: ≈ 25 мин (13:05–13:30, включая рендер 14 с)

Путь к пакету передан через окружение процесса (`ANC_VIDEO_PACK_DIR=$HOME/ANC/draft_exp/video_pack npm run agent:prepare`): в `.env` переменной не было, а `.env` билдер не трогает. Манифест среды допускает окружение процесса. Для следующих запусков Олегу — строка в `.env` (см. «Предложения»).

## Сделано
- `env.manifest.json`: `data_dirs → ANC_VIDEO_PACK_DIR` (`required_for: agent-terminal`, `must_contain` по задаче). Гейт 2: `npm run check -- --scope agent-terminal` без переменной падает громко (проверено до prepare).
- `videos/agent-terminal/prepare-assets.mjs` (`npm run agent:prepare`): копии 16 json → `src/videos/agent-terminal/data/` (5 верхних + 11 `geometry-OXX.json`), 66 кадров шагов → `public/videos/agent-terminal/frames/OXX/` (как есть), 11 миниатюр 240×168 из `01_input.png` (ffmpeg cover-crop) → `thumbs/OXX.png`, фон `bg.png` 1920×1080 (#0b0f14, сетка 64 px, зерно с фиксированным seed, ffmpeg lavfi), манифест `assets.manifest.json` с sha256 источника и копии по каждому файлу.
- Композиция `AgentTerminal` (1920×1080, 30 fps, 960 кадров), регистрация в `src/Root.tsx` — единственная правка существующего файла. Скрипты `agent:prepare`, `test:agent` в `package.json`.
- `src/videos/agent-terminal/`: `theme.ts` (палитра сториборда, раскладка), `format.ts` (uk-UA: запятая, U+2212, U+00A0, U+202F), `data.ts` (типизированный доступ, `ZONES_MEDIAN_KEY`, реестр `screenNumbers()`, геометрия полотна минус crop, `planMap` для плана Сум), `timeline.ts` (все кадры таблицы задачи, модули, лог), компоненты `Header, ModuleRail, ScanCanvas, ZonePlan, LogStream, QueueStrip, Finale`, `AgentTerminal.tsx`, `numbers.test.ts`.
- Все строки с числами на экране — только из `screenNumbers()`; компоненты числа не форматируют. Литералов данных в `.tsx` нет (единственная константа — линейка `RULER_M = 1` плана, не данные пакета).
- Штамп «ДО ЛЮДИНИ» — `Stamp` из `src/fx` (#e5484d, −8°). Шрифты: Unbounded (заголовок), Onest (UI), JetBrains Mono (логи, числа) — реестр `src/theme/fonts.ts`.
- План Сум: поворот выбирается из {0, 90, 180, 270} так, чтобы `ent` оказался ниже центроида (выбран 180°), равномерный масштаб, без зеркала; `san_polygon_m` пунктиром бурштином с подписью «вхідні дані: обвід С/У»; зоны g2 по очереди (зал раскрывается от фасада вглубь clip-прямоугольником), поверх — контуры truth тонкой линией.
- Петля: откат 924–950, кадр 959 = пустой дашборд = кадр 0.

## Файлы (новые / изменённые)
Новые: `docs/tasks/020-agent-terminal.md` (задача, закоммичена вместе с работой), `docs/tasks/020-agent-terminal.report.md`, `videos/agent-terminal/prepare-assets.mjs`, `videos/agent-terminal/assets.manifest.json`, `src/videos/agent-terminal/{AgentTerminal.tsx, timeline.ts, data.ts, format.ts, theme.ts, Header.tsx, ModuleRail.tsx, ScanCanvas.tsx, ZonePlan.tsx, LogStream.tsx, QueueStrip.tsx, Finale.tsx, numbers.test.ts}`, `src/videos/agent-terminal/data/*.json` (16 копий json пакета — в git, чтобы `test:agent` и сборка работали в облаке без пакета).
Изменённые: `env.manifest.json` (+ANC_VIDEO_PACK_DIR), `package.json` (+2 скрипта), `src/Root.tsx` (+1 Composition).
Не в git (gitignore): `public/videos/agent-terminal/` (кадры, миниатюры, bg.png — воспроизводятся `npm run agent:prepare`), `out/`.

## Проверки (команда → результат)
1. `npm run check -- --scope agent-terminal` (до prepare, переменная не задана) → `СРЕДА НЕ ГОТОВА — недостаёт (1): ✗ ANC_VIDEO_PACK_DIR не задан…`, exit 1 (гейт 2 работает).
2. `ANC_VIDEO_PACK_DIR=… npm run agent:prepare` → `✓ agent-terminal: страниц 11; data 16, кадров 66, миниатюр 11, фон 1 → videos/agent-terminal/assets.manifest.json`.
3. `npx tsc --noEmit -p tsconfig.json` → exit 0.
4. `npm run test:agent` → **94 ✓, 0 ✗**, exit 0. Вывод (сокращённо; полный — ниже в «Числа экрана»):
   - форматтер: 17 литеральных проверок (9,25 м · 8,70 м · 3,58 м · 99,3 м² · 99,0 м² · 0,9 м² · +0,3 % · −1,9 % · −42,3 % · −0,6 % · 89 % · 65 % · 55 % · 2,5 % · 10,5 · 17,4 · «1 038» U+202F);
   - реестр ↔ json: 50 ключей (см. таблицу);
   - reasons[0]: O05 −54,9 ↔ err −54.87, O06 −7,2 ↔ −7.21, O07 −72,6 ↔ −72.6, O08 −9,5 ↔ −9.46; O03/O04/O09/O10/O11 без числа;
   - согласованность: stats.sumy.S = real.sumy.S = 113.4; G2_acc = G2.acc = 0.887; 2 + 9 = 11;
   - геометрия: O02 primary [[151,96],[151,659]], check [[131,142],[349,142]] внутри 813×712; O07 primary [[105,414],[618,414]], check [[464,222],[464,424]] внутри 726×669; контуры (10 и 18 вершин) внутри; O02 кадр после crop = 813×712 = png пакета;
   - план Сум: θ = 180°, ent y 802.1 > центроид 452.4 (ниже); det = −s² (поворот без зеркала); |ex| = |ey| = s; контур в box; bbox san_polygon_m внутри bbox контура ± 1 см и ≈ bbox truth sanitary ± 1 см.
5. `npm run test:agent -- --negative` (позитивный контроль, гейт 4) → `ПОЗИТИВНЫЙ КОНТРОЛЬ: results.json → O02.err подменён 0.29 → 1.29`; падают ровно `o02.area` («…· +1,3 %» вместо «+0,3 %») и `chip.O02` («✓ +1,3 %»); `92 ✓, 2 ✗`, `подмена поймана, тест упал — как и должен`, **exit 1**.
6. Stills `npm run still -- AgentTerminal <кадр>` → `out/stills/AgentTerminal-{0,30,180,315,495,720,900,959}.png` — каждый открыт и сверен глазами (таблица ниже). По итогам первого прохода исправлены 3 вёрсточных дефекта (иконка ПЕРЕВІРКА сжималась flex-ом, строки лога сжимались при переполнении, подпись обвода С/У налезала на зону) и 2 тайминга лога (см. readcheck); stills пересняты.
7. Петля: `ffmpeg → rgb24 raw`, python: средняя |разница| кадров 0 и 959 = **0,0092/255** (цель < 2/255); различных байтов 2 523 из 6 220 800.
8. `node scripts/readcheck.mjs AgentTerminal --step 6` → `Текстов: 101; нарушений: 141 {UNSAFE: 91, SHORT: 50}`, exit 1. Разбор: **UNSAFE (91) — шум**: safe zones в `src/labs/safe-zones.ts` только для 9:16 (верх 220 / низ 380 / право 140 px), на 1920×1080 под них попадают шапка, нижняя очередь и весь лог — для горизонтали проверка не применима. **NEVER (8) в первом прогоне** были настоящими (строки лога, которые сменялись раньше, чем успевали проявиться) — исправлено: появление строки 6 кадров, две свежие строки с opacity ≥ 0,9, лог «санвузол — з позначки менеджера» сдвинут 596 → 603, строка долей 624 → 632; повторный прогон NEVER = 0. **SHORT (50)** остались: 38 строк лога (жанр потока: строка читаема до прихода следующей; по задаче 9 страниц прогона по 10 кадров), «сторінка N / 11» и счётчик во время прогона (0,33 с на страницу по задаче), плашки `o02.area` (2,2 с из 3,5), `o07.check.result` (2,2 из 2,25), `o07.area` (1,4 из 3,6), `final.line` (2,4 с из 6,5), `final.note` (1,8 из 5,4) — все ограничены таймлайном задачи, тайминги не менял (гейт 7). Пороги cps=12 / minHold=1 — гипотеза.
9. Рендер (один): `npx remotion render src/index.ts AgentTerminal out/agent-terminal/agent-terminal-v1.mp4 --codec=h264 --crf=18` → exit 0, 14 с.
   ffprobe:
   ```
   codec_name=h264
   width=1920
   height=1080
   r_frame_rate=30/1
   nb_frames=960
   duration=32.000000
   size=11906672
   ```
   Дополнительно из mp4 извлечены кадры 4,0 с (сканер стен: 03_walls раскрыт сверху до линии) и 18,5 с (штамп «ДО ЛЮДИНИ» на O07) — соответствуют задуманному.
10. Пакет не изменён: sha256 всех 84 файлов `~/ANC/draft_exp/video_pack` до задачи и после (списки `find | sort | xargs shasum -a 256`) совпадают построчно; sha256 списка = `59f9382a875f9ac6563fbacffbd5363bddd740d8da59518d06823a0dcacadc1c` до и после.

## Числа экрана → источник → что на still
| на экране | источник | still | |
|---|---|---|---|
| 11 (старт · 11 сторінок у черзі; — / 11; сторінка N / 11) | `results.json` длина | 30, 180, 315, 495, 900 | ✓ |
| Чернетка 2 / До людини 9 | `results.json` count по `route` | 720, 900 (2 / 9); 315 (1 / 0); 495 (2 / 8 — O07 ещё не отправлен, до кадра 540) | ✓ |
| 65 %, «медіана, 1 038 аптек» | `stats.json → zones_median_acc.value, .n` | 720, 900 | ✓ |
| ~10,5 / ~17,4 px | `frames/O02/geometry.json → walls.thin_px, thick_px` | 180 | ✓ |
| 10 вершин | `geometry.json O02 → outline.vertices` | 180 | ✓ |
| 9,25 м | `scale.json → O02.primary.value_m` | 315 (линия и лог) | ✓ |
| 3,65 → 3,58 м · −1,9 % | `results.json → O02.check` | 315 | ✓ |
| 99,3 / 99,0 / +0,3 % | `results.json → O02.area, truth, err` | 315 (плашка, лог, чип O02) | ✓ |
| с/у 0,9 проти 2,2 | `geometry.json O02 → rooms[id=6].area_m2`; `truth.json → O02.rooms[label=2].m2` | 315 | ✓ |
| O01 ✓ −0,6 % | `results.json → O01.err` | 495, 720, 900 (чип) | ✓ |
| причины O03–O11 | `results.json → reasons[0]` | 495 (лог), чипы «до людини» | ✓ |
| 8,70 м | `scale.json → O07.primary.value_m` | 495 | ✓ |
| 5,94 → 3,43 м · −42,3 % | `results.json → O07.check` | 495 (лог; плашка — в mp4 18,5 с) | ✓ |
| 22,9 / 83,6 / −72,6 % | `results.json → O07.area, truth, err` | 720 (лог), mp4 18,5 с (плашка) | ✓ |
| 113,4 м² | `real_examples.json → sumy.S` (= `stats.json → sumy.S`) | 720, 900 | ✓ |
| 89 % | `real_examples.json → sumy.G2.acc` (= `stats → sumy.G2_acc`) | 720, 900 | ✓ |
| доли зон 55 / 2,5 / 28 / 15 % | `stats.json → sumy.target_shares` | 720 (лог) | ✓ |
| 80–120 | `stats.json → sumy.bucket` | 720 (лог) | ✓ |
| 2 з 11 · 9 (финал) | `results.json` route | 900 | ✓ |

Расхождений числа с json не найдено — вопросов к Олегу по числам нет.

## Stills
`out/stills/AgentTerminal-0.png` (петля, пустой дашборд) · `-30.png` (1,0 с: старт) · `-180.png` (6,0 с: КОНТУР O02) · `-315.png` (10,5 с: КРЕСЛЯР, чип O02, Чернетка 1) · `-495.png` (16,5 с: ПЕРЕВІРКА мигает, 8,70 м) · `-720.png` (24,0 с: зоны Сум, truth, 65 %) · `-900.png` (30,0 с: финал) · `-959.png` (петля).

## Отклонения от задачи и почему
- `ANC_VIDEO_PACK_DIR` передан через окружение процесса, не через `.env` (в `.env` его не было; билдер в `.env` не пишет). Семантика по манифесту та же.
- Строки лога без чисел (например «позначки менеджера немає → уся сторінка = приміщення», «фасад = стіна з входом», «контур знайдено» для O07) — литералы в `timeline.ts`, числа в них отсутствуют.
- Сдвиг двух строк лога на 7–8 кадров внутри своих сцен (603 вместо 596, 632 вместо 624) — по readcheck NEVER; границы сцен таблицы не тронуты.
- Копии json пакета положены в git (`src/videos/agent-terminal/data/`) — иначе облачная сессия не соберёт композицию и не запустит `test:agent`. Медиа (png) в git нет.
- readcheck прогнан, но «зелёным» быть не может на 1920×1080 (safe zones 9:16); остаточные SHORT — таймлайн задачи.

## Предложения (вне рамок задачи, не сделано)
- Олегу — добавить в `.env` строку `ANC_VIDEO_PACK_DIR=/Users/olegkhukhashvili/ANC/draft_exp/video_pack`, тогда `npm run check -- --scope agent-terminal` и `npm run agent:prepare` работают без префикса.
- readcheck: параметр формата (safe zones для 16:9 = 0) или режим «без safe zones», иначе для горизонтальных роликов UNSAFE — шум.
- Если нужно больше времени на итоговую строку финала (72 знака при cps 12 → 6,5 с): удлинить сцену 28,0–30,8 за счёт зон (23,4–26,0) — решение Олега.
- Звук (UI-тики на строки лога и штамп) — отдельной задачей, как и сказано в задаче.

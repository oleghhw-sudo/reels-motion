# Отчёт: 019-capcut-pilot
Статус: готово; **шаг 8 выполнен 2026-10-25** (причина неработающего зума найдена — идентификатор `UNIFORM_SCALE`; зум перекодирован в `KFTypeScaleX`/`KFTypeScaleY`; проверка глазами в CapCut — за Олегом). Раздел «Шаг 8» — в конце отчёта.
Время: ≈ 15 мин (22:21–22:36, 2026-10-24) · Mac, CapCut 9.5.0, capcut-cli 0.31.1

## Сделано
- `pilot/capcut/` — локальная закреплённая установка capcut-cli **0.31.1** (`package.json` с точной версией, `npm install --ignore-scripts`, `node_modules` в `.gitignore`; lock: `sha512-q4ZTihelV9Uw…Ff3Qg==`). Не плагин, не `-g`, не `npx` без версии. Запуск: `pilot/capcut/node_modules/.bin/capcut` → `0.31.1`.
- Гейт 2: в `env.manifest.json` → `data_dirs.vars` добавлены `CAPCUT_PROJECTS_DIR` (must_contain `root_meta_info.json`) и `CAPCUT_MEDIA_DIR`, `required_for: "capcut"`. Дефолтов в коде нет. **В `.env` не записывал** (файл Олега); все команды сессии получали значения через окружение процесса. Что добавить в `.env` — внизу, «Для Олега».
- Медиа скопированы настоящими файлами (`cp -L`, симлинков 0) в `~/Movies/reels-pilot-media/`: `V1.mp4`, `V3.mp4`, `V10.mp4`, `D_preroll_9hits_42.379-60.720.wav`; sha256 копий = sha256 исходников.
- Генератор спецификации `pilot/capcut/make-spec.mjs` (пути только из `CAPCUT_MEDIA_DIR`, падает без неё) → `out/capcut-pilot/pilot-spec.json`.
- Запись одной атомарной командой `compile --into <Pilot> --active-timeline` (после `--check`): 3 клипа на видеодорожке со стыками на h1/h2, музыка на всю длину с fade-out 0.3 с, 1 переход на стыке 2→3, keyframe-зум UNIFORM_SCALE 1.00→1.12 на клипе 2. `lint`: 0 ошибок, 0 предупреждений. Медиа зарегистрированы в `draft_meta_info.json` самим compile (`register --materials` план: «every referenced media file (4) is registered», action none).
- Позитивный контроль гейта 4: CapCut запущен → команда записи **отказана** `refused [editor-open]`, sha файлов Pilot не изменились; CapCut закрыт, `pgrep` пуст.
- Доказательство неприкосновенности: sha256 всех 17 `draft_info.json` остальных 9 проектов (корни и `Timelines/*/`) и `root_meta_info.json` — до = после. Файлов вне папки Pilot с mtime новее бэкапа — нет. В `~/.config/capcut-cli` ничего не создано (каталог и трипвайр перенаправлены в `out/capcut-pilot/`).

## Файлы (новые / изменённые)
- new `pilot/capcut/package.json`, `pilot/capcut/package-lock.json`, `pilot/capcut/.gitignore`, `pilot/capcut/make-spec.mjs`
- new `pilot/capcut/fix-zoom-kftype.mjs` (шаг 8: перекодировка зума `UNIFORM_SCALE` → `KFTypeScaleX`/`KFTypeScaleY`, `--check`/`--apply`)
- mod `env.manifest.json` (+2 переменные, scope `capcut`)
- new `docs/tasks/019-capcut-pilot.report.md`
- вне git (`out/` в .gitignore): `out/capcut-pilot/backup-20261024-222343/` (полная копия `1024/` + `root_meta_info.json` до записи), `written-pre-pc/`, `written/` (снимки после записи), `pilot-spec.json`, `compile-output.json`, `sha-*.txt`, `pc-*.txt`, `cli-transitions.json`, `user-enums.json` (не создан — нечего было записать), `app-versions.json` (трипвайр версий capcut-cli)
- вне git, вне репо: `~/Movies/reels-pilot-media/` (4 файла, 107 МБ); папка проекта `…/com.lveditor.draft/1024/` (= Pilot): перезаписаны `draft_info.json`, `template-2.tmp`, `Timelines/E670B181…/draft_info.json`, `Timelines/E670B181…/template-2.tmp`, `draft_meta_info.json`; добавлены `assets/video/{V1,V3,V10}.mp4`, `assets/audio/D_preroll….wav`, `*.bak`, `.capcut-cli-history/` (снимки и журнал capcut-cli для `restore`)

## Проверки (команда → результат)

Переменные окружения для всех команд ниже (в `.env` не записаны, передавались явно):
```
export CAPCUT_PROJECTS_DIR="$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft"
export CAPCUT_MEDIA_DIR="$HOME/Movies/reels-pilot-media"
export CAPCUT_CLI_APP_VERSIONS=out/capcut-pilot/app-versions.json CAPCUT_CLI_USER_ENUMS=out/capcut-pilot/user-enums.json
CC=pilot/capcut/node_modules/capcut-cli/dist/index.js
P="$CAPCUT_PROJECTS_DIR/1024"
```

### Шаг 1 — установка
```
cd pilot/capcut && npm install --ignore-scripts --no-audit --no-fund   → added 1 package
./node_modules/.bin/capcut --version                                    → 0.31.1
```
Зависимостей у пакета нет (`dependencies: None`); `npm view capcut-cli@0.31.1 dist.integrity` = `sha512-q4ZTihelV9UwxBRsmLPPbgbpXPDasGW/VcsOfbYOYplUts2RFI7wL2ABdou7pDMsopqIKyNxE0i5eoxkwFf3Qg==` (совпадает с lock).

### Шаг 2 — диагностика проекта Pilot (только чтение)
Проект Олега лежит в папке **`1024`** (CapCut именует папку датой), `draft_name: "Pilot"` в `root_meta_info.json` и `draft_meta_info.json`; создан 2026-10-24 22:20, `tm_duration 0`. Файлы: `draft_info.json`, `draft_info.json.bak`, `template-2.tmp`, `draft_meta_info.json`, `Timelines/project.json`, `Timelines/E670B181-4352-4B92-A8AC-84A775ED7AAD/{draft_info.json, draft_info.json.bak, template-2.tmp, attachment_pc_common.json}`, пустые `Resources/`, `subdraft/`, `adjust_mask/`… `draft_content.json` отсутствует; `crypto_key_store.dat` в этом проекте нет.
- `Timelines/project.json`: `main_timeline_id = E670B181-4352-4B92-A8AC-84A775ED7AAD`, 1 таймлайн «Временная шкала 01», `version: 0`.
- `draft_info.json` (все 4 копии побайтно равны, `cmp` exit 0): `new_version 187.0.0`, `version 360000`, `fps 30`, `canvas 1920×1080 "original"`, `platform.app_version 9.5.0`, `tracks: []`, 55 типов материалов, все пустые.
```
$CC diagnose "$P" -H                     → Canonical: template-2.tmp · Layout: info-primary · Version 9.5.0 · Diverged: no · Editor: not detected
$CC diagnose "$P" --active-timeline -H   → Canonical: Timelines/E670B181…/draft_info.json · Layout: timelines-active · Diverged: no
$CC version "$P" --active-timeline       → support.status "untested", write_guard "ok", beyond_known_range false, schema_int 360000
$CC lint "$P" --active-timeline          → {"ok":true, errors 0, warnings 0}
$CC doctor -H                            → draft-store: 10 project(s) — 10 readable, 0 encrypted
```
Авторитетный документ на 9.5 (по capcut-cli и issue #50 для 9.2.8): **вложенный** `Timelines/<main_timeline_id>/draft_info.json`; корневые `draft_info.json`/`template-2.tmp` — зеркала. Поэтому запись шла с `--active-timeline` (compile синхронизирует вложенный документ и все корневые зеркала одной атомарной записью). `sync-timelines --nested` не использовался: он для **уже разъехавшихся** зеркал (`Diverged: no`), а в `compile --into` он не нужен — все 4 копии после записи имеют один sha.

### Шаг 3 — каталог ID (harvest-enums, только чтение, без `--apply`)
```
for p in 0701 0831 Anime "Georgian Movie" "Mias Story" "Short Georgian" Vulcan "Сайт"; do $CC harvest-enums "$CAPCUT_PROJECTS_DIR/$p" --active-timeline; done
$CC harvest-enums "$CAPCUT_PROJECTS_DIR/0427"      # плоский проект (new_version 167, без Timelines) — без флага
```
Результат: **переходов в проектах Олега нет ни одного** (`materials.transitions` = 0 во всех 9 `draft_info.json`, проверено и capcut-cli, и прямым чтением JSON). Единственный найденный ресурс — `video_effects` «Zoom Lens» `7399465441057328389` в «Georgian Movie». Каталог не записывался (нечего).
Дополнительно сверил 116 встроенных переходов capcut-cli с локальным кэшем эффектов `~/Movies/CapCut/User Data/Cache/effect/` (143 записи): совпадений по `resource_id` и `md5` — **0**. В кэше — маски (`linear`, `mirror`, `circle`, `rect`, `star`), бьюти/ретушь-модели, стикер-конфиги, `matting`, два `AE2Effect_*`; переходов нет. Вывод: условие «переход, который уже встречается в его проектах» выполнить невозможно → см. «Отклонения» п. 1.

### Шаг 4 — медиа
```
cp -L "$MIA_SHORT_DIR/_outro-analysis/src/{V1,V3,V10}.mp4" ~/Movies/reels-pilot-media/
cp -p "$MIA_SHORT_DIR/_outro-analysis/music/D_preroll_9hits_42.379-60.720.wav" ~/Movies/reels-pilot-media/
```
ffprobe исходников: V1 1280×720 24 fps 361 кадров; V3 и V10 4096×2304 24 fps 361 кадров; музыка pcm_s16le 48 kHz stereo 18.341 с.
sha256 (первые 16): V1 `1237ea345a5251cf`, V3 `582415914b34d647`, V10 `60039ad160b43953`, wav `51dbe26b40af38e5` — исходник = копия, симлинков 0.
Лицензия музыки (гейт 6): `outro.yaml` → «Suno — тариф уточнить (некоммерческое использование ок; **предупреждение по гейту 6**)». В CapCut-проекте поля лицензии нет; флаг — здесь и в `make-spec.mjs`.
```
npm run check -- --scope capcut   (с переменными)  → ✓ CAPCUT_PROJECTS_DIR … ✓ CAPCUT_MEDIA_DIR … OK: среда готова (scopes: base, render, capcut)
npm run check -- --scope capcut   (без переменных) → СРЕДА НЕ ГОТОВА — недостаёт (2): ✗ CAPCUT_PROJECTS_DIR не задан … ✗ CAPCUT_MEDIA_DIR не задан   (позитивный контроль гейта 2/4)
npm run check                                      → OK: среда готова (scopes: base, render); capcut-переменные «пропущено»
node pilot/capcut/make-spec.mjs   (без CAPCUT_MEDIA_DIR) → «CAPCUT_MEDIA_DIR не задан …», exit 1   (позитивный контроль генератора)
```

### Шаг 5 — запись в Pilot
Предусловия: `pgrep -x CapCut` → пусто (exit 1); бэкап `cp -Rp 1024 → out/capcut-pilot/backup-20261024-222343/1024` (22 файла, `diff -r` идентично) + копия `root_meta_info.json`; sha256 17 `draft_info.json` остальных проектов → `out/capcut-pilot/sha-others-before.txt`.
```
CAPCUT_MEDIA_DIR="$HOME/Movies/reels-pilot-media" node pilot/capcut/make-spec.mjs > out/capcut-pilot/pilot-spec.json
$CC compile out/capcut-pilot/pilot-spec.json --into "$P" --active-timeline --check
   → {"ok":true, tracks 2, items 4, operations 4, refs [clip1,clip2,clip3,music], into true, file_path ".../1024/Timelines/E670B181…/draft_info.json", checked true, write false}
$CC compile out/capcut-pilot/pilot-spec.json --into "$P" --active-timeline
   → {"ok":true,"into":true,"tracks":2,"segments":4,"duration_us":4543667,"warnings":[],"refs":{"clip1":"5155de4c-…","clip2":"252fb279-…","clip3":"1f079602-…","music":"45373189-…"}}
```
Спецификация (секунды; `sourceStart` = кадр/24): clip1 V1 `start 0, dur 0.917, sourceStart 7.5`; clip2 V3 `start 0.917, dur 1.835, sourceStart 9.5`; clip3 V10 `start 2.752, dur 1.791667, sourceStart 6.25`; music `start 0, dur 4.543667`; operations: `transition clip2 dissolve`, `keyframe clip2 scale t=0 → 1.0`, `keyframe clip2 scale t=1.835 → 1.12`, `audio-fade music fadeOut 0.3`.

Что записано (прямое чтение `Timelines/E670B181…/draft_info.json`):
- `duration 4543667`, `fps 30`, `id E670B181…` (id проекта сохранён), `new_version 187.0.0`, `version 360000`, `platform`/`last_modified_platform.app_version 9.5.0`, canvas без изменений.
- video-дорожка: `5155de4c` target 0+917000 / source 7500000+917000; `252fb279` target 917000+1835000 / source 9500000+1835000, `common_keyframes: UNIFORM_SCALE [(0,[1],Line),(1835000,[1.12],Line)]`, `extra_material_refs → transitions{name Dissolve, effect_id 392FD26E-A514-4d0f-8950-EA4A20CB407C, resource_id 6724846004274729480, duration 466666, is_overlap false}`; `1f079602` target 2752000+1791667 / source 6250000+1791667. Все speed 1, volume 1.
- audio-дорожка: `45373189` target 0+4543667, `audio_fades{fade_in 0, fade_out 300000}`.
- материалы: пути → `…/1024/assets/video/V{1,3,10}.mp4`, `…/1024/assets/audio/D_preroll….wav` (compile копирует медиа внутрь проекта); `local_material_id` у всех 4 заполнен и совпадает с записями `draft_materials[type 0]` в `draft_meta_info.json` (единственное изменение sidecar: `draft_materials` 0 → 4 записи с `file_Path`, `duration`, `width/height`, `metetype`).
```
$CC lint "$P" --active-timeline               → {"ok":true, errors 0, warnings 0, info 1: keyframe-trimmed-clock (сегмент 252fb279 начинается на 9.5 с медиа; JianYing 11.6 читает keyframes по часам медиа — к CapCut 9.5 не относится, проверить глазами)}
$CC lint "$P" --active-timeline --frame-grid  → 4 warnings segment-off-frame-grid: стыки 0.917/2.752/4.543667 с не кратны кадру 30 fps (см. «Отклонения» п. 4)
$CC register "$P" --materials --active-timeline (план) → materials: state ok, action none, «every referenced media file (4) is registered in draft_materials»; НО targets: draft_meta_info.json и root_meta_info.json «stale» (draft_id, tm_duration) — --apply НЕ выполнял, см. «Отклонения» п. 3
$CC info "$P" --active-timeline -H            → Duration 4.54s · 1920x1080 · FPS 30 · Tracks 2 · Segments 4 · transitions 1 · audio_fades 1
$CC segments "$P" --active-timeline -H        → V1 0:00–0:00.92 · V3 0:00.92–0:02.75 · V10 0:02.75–0:04.54 · wav 0:00–0:04.54
$CC diagnose "$P" --active-timeline -H        → Canonical Timelines/E670B181…/draft_info.json · Diverged: no · все 4 копии 15904 bytes
```
sha256 после записи (`out/capcut-pilot/sha-pilot-written.txt`): `draft_info.json` = `template-2.tmp` = `Timelines/…/draft_info.json` = `Timelines/…/template-2.tmp` = `f276d1f51a317af2…`; `draft_meta_info.json` `a296969ef8055e96…`; `Timelines/project.json` `e957c70cedebee40…` (не тронут, равен бэкапу).

### Шаг 6 — позитивный контроль (гейт 4)
```
open -a CapCut; pgrep -x CapCut                                         → 56788 (через 1 с; через 8 с — тот же PID)
$CC volume "$P" 45373189-d6a2-441e-8478-804b8e436539 1.0 --active-timeline
   → {"error":"refused [editor-open]: CapCut is running. Close the editor before writing this managed draft, or pass --force-write …"}
sha256 Pilot до / после отказанной команды                             → совпадают (pc-sha-1-before.txt = pc-sha-2-after-refusal.txt)
osascript -e 'quit app "CapCut"'                                        → AppleScript вернул -128 («Отменено пользователем»), но процесс завершился: pgrep -x CapCut пуст через 4 с
sha256 Pilot после закрытия CapCut                                      → совпадают с «до» (CapCut при запуске/выходе файлы Pilot не менял); root_meta_info.json не изменился; файлов с mtime новее снимка в Pilot нет
```

### Шаг 7 — снимок и неприкосновенность
```
out/capcut-pilot/written/   — все draft_info.json/template-2.tmp (корень и Timelines/), draft_meta_info.json, Timelines/project.json; sha → sha-pilot-written.txt (= written-pre-pc, идентично)
diff sha-others-before.txt sha-others-after.txt   → пусто: 17 draft_info.json остальных 9 проектов ДО = ПОСЛЕ
root_meta_info.json a7d16a86381e420c…            → ДО = ПОСЛЕ
find <store> -not -path 1024 -newer backup        → пусто
ls ~/.config/capcut-cli                           → No such file or directory
```

### Сетевые команды пакета (grep `dist/*.js` на `fetch(`/`http.request`/URL)
Только 3 файла ходят в сеть:
- `capcut-cloud-asr.js` → `editor-api-sg.capcutapi.com/lv/v1/{upload_sign, common_task/new, common_task/query}` — команда **`caption --cloud`** (аудио на серверы ByteDance);
- `translate.js` → `api.anthropic.com/v1/messages` — команда **`translate`**;
- `wikimedia.js` → `commons.wikimedia.org`, `upload.wikimedia.org` — **`add-video` / `add-audio` с URL Wikimedia**.
Ничего из этого не вызывалось. Вызывались: `--version`, `describe`, `<cmd> --help`, `doctor`, `projects`, `diagnose`, `version`, `info`, `lint`, `timeline`, `segments`, `materials`, `enums --transitions`, `harvest-enums` (план), `register` (план), `compile --check`, `compile --into`, `volume` (отказана). `init`/`quickstart`/`export`/`caption`/`translate`/`sync-timelines --apply` — не вызывались. Телеметрии в пакете нет (других URL, кроме ссылок на GitHub в текстах, grep не нашёл).

## Отклонения от задачи и почему
1. **Переход не «из проектов Олега»**: в его проектах и в локальном кэше эффектов переходов нет (шаг 3). Взят самый базовый встроенный `dissolve` (effect_id `392FD26E-…`, resource_id `6724846004274729480`, `is_overlap: false`, длительность по умолчанию 466666 мкс). Это ровно тот случай «ID не в кэше», о котором предупреждает `docs/CAPCUT-analysis.md §3` (CapCut может молча выбросить) — и это полезный результат пилота: шаг 8 покажет, выброшен ли он. Если Олег против — `capcut remove`/`restore` или заново из бэкапа.
2. **Out-кадры клипов 1 и 2 не равны кадрам из шага 4**: задача требует одновременно «обрезка по кадрам» и «стыки на долях h1/h2». При скорости 1.0 это несовместимо (V1 180–201 = 0.875 с, доля до h1 = 0.917 с; V3 228–260 = 1.333 с, h1→h2 = 1.835 с). Выбрано: in-кадры точно по шагу 4, стыки точно на h1/h2, скорость 1.0 → V1 фактически 180–202, V3 228–272, V10 ровно 150–193. Speed ramp capcut-cli не умеет (анализ §3), а постоянное замедление V3 до 0.727× дало бы lint-предупреждение «keyframes на re-timed клипе» и смешало бы две гипотезы в одном клипе. В `outro.yaml` V3 помечен `ramp: true` — в Remotion это делает `src/fx`.
3. **`register --materials --apply` не выполнен.** Регистрация медиа уже сделана compile (план: «registered 4, to_register []»). А «ремонт идентичности», который register хочет применить, перепишет `draft_id` в `draft_meta_info.json` и **в `root_meta_info.json` вне папки Pilot** (запрет задачи) значением id таймлайна `E670B181…` — на 9.5 id проекта (`8887AF1A…`) и id таймлайна разные по замыслу приложения; это похоже на ложное срабатывание для вложенной раскладки. `tm_duration 0` в sidecar CapCut пересчитает сам при открытии.
4. **fps проекта оставлен 30** (как создало приложение; в spec не задавал — compile меняет fps только если он указан). Исходники 24 fps, стыки по долям (0.917 с, 2.752 с) не кратны кадру 30 fps — `lint --frame-grid` предупреждает (4 warnings), обычный `lint` чист. Оставлено намеренно: пилот проверяет, что CapCut делает с микросекундными границами (шаг 8 покажет, квантует ли он).
5. **`.env` не менял** — переменные передавались через окружение. Олег добавляет две строки сам (ниже).
6. `harvest-enums` для `0427` потребовал запуск **без** `--active-timeline` (плоский проект 167.0.0 без `Timelines/`; с флагом — отказ `active-timeline-invalid`). Результат тот же: 0 переходов.
7. Файл `1024/draft_biz_config.json` пустой (0 байт) ещё до записи — compile его не трогал; `diagnose` показывает `draft_meta_info.json` как «unreadable» в смысле «не таймлайн» — это нормально.

## Предложения (вне рамок задачи, не сделано)
- Шаг 8 (после проверки Олега): `diff -u out/capcut-pilot/written/… <живые файлы Pilot>` + `$CC diff` — что CapCut переписал/выбросил (переход, keyframes, границы, `draft_materials`, `.bak`/`.capcut-cli-history`).
- Если переход выживет только из кэша — попросить Олега один раз поставить любой переход в CapCut руками в черновом проекте: он появится в `Cache/effect`, и `harvest-enums` даст реальный id.
- Для будущих роликов задавать `fps: 24` в спецификации (ARCHITECTURE: кино-ролики — fps исходников) — тогда доли `outro.yaml` ложатся на сетку кадров ровно (22 и 66 кадров).
- `.bak`, `.capcut-cli-history/` и `assets/` внутри папки проекта — убедиться по шагу 8, что CapCut их игнорирует; иначе чистить перед открытием.

## Для Олега (после отчёта)
Где: файл `~/Projects/reels-motion/.env` (терминал Mac, две строки в конец файла; значения — пути, не ключи):
```
echo 'CAPCUT_PROJECTS_DIR=/Users/olegkhukhashvili/Movies/CapCut/User Data/Projects/com.lveditor.draft' >> ~/Projects/reels-motion/.env
```
```
echo 'CAPCUT_MEDIA_DIR=/Users/olegkhukhashvili/Movies/reels-pilot-media' >> ~/Projects/reels-motion/.env
```
Проверка (терминал Mac, ожидается «OK: среда готова (scopes: base, render, capcut)»):
```
cd ~/Projects/reels-motion && npm run check -- --scope capcut
```
Проверка глазами (CapCut): открыть проект **Pilot** → 3 клипа (V1 0–0.92 с, V3 0.92–2.75 с, V10 2.75–4.54 с), музыка на всю длину с затуханием в конце, переход Dissolve на стыке V3→V10, плавный наезд ×1.12 на V3; закрыть и открыть снова; экспорт 1080p. Ответ архитектору одной строкой. Откат, если нужно: `out/capcut-pilot/backup-20261024-222343/1024/` → поверх папки `1024` при закрытом CapCut.

## Шаг 8 — что переписал CapCut, причина неработающего зума, исправление (2026-10-25, 02:01–02:15)

Вход: Олег открыл проект в CapCut 9.5 (25.10 01:57–02:01) и сообщил: 3 клипа, переход Dissolve и музыка с фейдом — на месте; **зум на V3 не работает**; имя проекта «1024», а не «Pilot». Разрешение Олега: «пусть агент реализует Zoom». Правила шага: запись только в папку `1024`, новый полный бэкап, CapCut закрыт, остальные проекты только чтение, без сети/`init`/`quickstart`/UI-автоматизации.

### 8.1 Диагностика: `out/capcut-pilot/written/` (как записал compile) vs живые файлы `1024`
Команда: `find … -type f`, `shasum -a 256`, разбор JSON (`python3 -I`), сравнение полей сегментов и материалов.
- 4 копии таймлайна (`draft_info.json`, `template-2.tmp`, `Timelines/E670B181…/draft_info.json`, `…/template-2.tmp`) CapCut переписал **байт-в-байт одинаково**: sha `f276d1f5…` → `4956aa34…`. `Timelines/project.json` не изменился (`e957c70c…`). Появился `Timelines/E670B181…/template.tmp` (new_version 75.0.0, пустой шаблон приложения).
- **Границы квантованы к сетке 30 fps** (ответ на отклонение 4): 917000→933333, 1835000→1833333, 2752000→2766666, 1791667→1800000 мкс; `duration` 4543667→4566666. Доли h1/h2 сдвинулись на +16 мс и +15 мс.
- **Пути медиа** переписаны из абсолютных в плейсхолдер `##_draftpath_placeholder_<UUID>_##/assets/video/V3.mp4`; файлы в `1024/assets/{video,audio}` на месте (размеры совпадают).
- **Переход Dissolve остался** — CapCut дописал в материал `path` на свой кэш `Cache/effect/670883/…`, `request_id`, `is_ai_transition` и т. п. Гипотеза анализа §3 «ID не в кэше → выбросит» для встроенного `dissolve` **не подтвердилась**.
- Сегментам дописаны поля приложения: `uniform_scale: {on: true, value: 1.0}`, `enable_*`, `hdr_settings`, `responsive_layout`, `source: "segmentsourcenormal"`, …; `render_index` 14000→0 (compile ставил 14000).
- **Ключевые кадры масштаба CapCut НЕ выбросил**: список `common_keyframes[0]` с `property_type: "UNIFORM_SCALE"` и двумя кадрами (0→[1.0], 1835000→[1.12]) сохранён, CapCut лишь добавил `string_value: ""`. Но не анимирует (наблюдение Олега). Побочно: после квантования кадр 1835000 оказался на 1667 мкс **позже конца сегмента** (1833333).
- `draft_meta_info.json`: `draft_materials` — 4 медиа (как зарегистрировал compile, пути переписаны в `./assets/…`), `tm_duration` 4566666, `draft_name` «1024» (см. 8.5). `.bak`, `.capcut-cli-history/`, `assets/` CapCut не трогал (mtime 24.10 22:30).

### 8.2 Причина: движок CapCut 9.5 не знает идентификатор `UNIFORM_SCALE`
1. **Эталона в проектах Олега нет**: просмотрены все 46 `draft_info.json`/`template*.tmp` остальных 9 проектов (только чтение) — 0 сегментов с `common_keyframes`/`keyframe_refs`, корневые `keyframes.*` пустые. В `User Data` и контейнере `com.lemon.lvoverseas` строк `KFTypeScaleX`/`UNIFORM_SCALE` вне папки `1024` нет (grep -rl).
2. **Эталон — сам движок** (`strings -n 6 /Applications/CapCut.app/Contents/Frameworks/libvideoeditor.dylib`, только чтение; приложение 9.5.0). В нём встроены Lua-миграции формата черновика, и они называют свойство масштаба прямо:
   - `downgrade_74_to_73_crop_scale`: `if property_type == "KFTypeScale" and #list ~= 0 then return false, 'contain scale keyframe', '74.0.0'` — до версии 77 единый масштаб звался **`KFTypeScale`**;
   - `downgrade_keyframeType`: `property_type == 'KFTypeScaleX' or 'KFTypeScaleY' or 'KFTypeMaskSizeX' … → return false`; `downgrade_77_76_keyframe`: `'cannot downgrade because of having splited KFTypeScale', '77.0.0'`; рядом `downgrade_77_76_uniform_scale` проверяет `seg['uniform_scale']['on']` — с **new_version 77.0.0** единый масштаб «расщеплён» на **`KFTypeScaleX` + `KFTypeScaleY`** при `segment.uniform_scale.on = true`.
   - Строки `UNIFORM_SCALE` как `property_type` в `libvideoeditor.dylib` и `libVECreator.dylib` **нет** — только имя действия `SET_UNIFORM_SCALE_ACTION`. Перечень известных движку типов (`KFTypeScaleX` ×46, `KFTypeScaleY` ×63, `KFTypePositionX/Y`, `KFTypeRotation`, `KFTypeVolume`, …) — в `strings`. Наш черновик — `new_version 187.0.0`, т. е. формат ≥ 77.
3. **Косвенные подтверждения**: capcut-cli 0.31.1 `lint` имеет проверку `uniform-scale-keyframe` («JianYing 11.6+ has been reported to ignore UNIFORM_SCALE, it reads KFTypeScaleX with uniform scaling on») — но включается только для `app_source: "lv"` ≥ 11.6, для CapCut `cc 9.5.0` молчит, поэтому lint шага 5 был чист; собственный рецепт пакета `examples/keyframe-zoom.md` пишет зум как **`KFTypeScaleX`** (с заметкой «ScaleX interpolated linearly»). Источник ошибки capcut-cli — таблица `PROPERTY_MAP` в `dist/decorators.js` (`uniform_scale: "UNIFORM_SCALE"`), унаследованная из pyJianYingDraft (`KeyframeProperty.uniform_scale`); сам pyJianYingDraft офлайн недоступен (сети нет), сверка — по этой таблице и докам `docs/draft-schema/03-keyframes-and-animations.md`.
4. **Вывод**: место в JSON (`segment.common_keyframes[]`), время (`time_offset` мкс от начала сегмента), значения (`values: [1.0]`/`[1.12]`), `curveType: "Line"` — совпадают с форматом движка; неверен только идентификатор свойства. CapCut сохраняет неизвестный список как есть и не анимирует.

### 8.3 Исправление
Файл `pilot/capcut/fix-zoom-kftype.mjs` (гейт 2: корень проектов только из `CAPCUT_PROJECTS_DIR`, дефолта нет). Заменяет в указанном сегменте список `UNIFORM_SCALE` на два списка `KFTypeScaleX` и `KFTypeScaleY` с теми же кадрами; последний кадр прижимает к `target_timerange.duration` (1835000→1833333 — «от начала до конца клипа»); `uniform_scale.on = true`; пишет **атомарно во все 4 копии** (temp + fsync + rename, откат при сбое) и только если копии байт-в-байт одинаковы и CapCut закрыт. `--check` ничего не пишет и красный (exit 1), если в сегменте есть `UNIFORM_SCALE` или нет пары `KFTypeScaleX/Y`. Штатной командой capcut-cli нельзя: `capcut keyframe` 0.31.1 кодирует `scale` только как `UNIFORM_SCALE` и не умеет удалять список.

Команды (терминал Mac, `cd ~/Projects/reels-motion`, `CAPCUT_PROJECTS_DIR` через окружение; сегмент клипа V3 — `252fb279-ae43-43ae-b63b-4c4c9b478db5`):
```
pgrep -x CapCut; echo exit=$?            # → exit=1 (CapCut закрыт) до и после
mkdir -p out/capcut-pilot/backup-20261025-020959 && cp -R "$CAPCUT_PROJECTS_DIR/1024" out/capcut-pilot/backup-20261025-020959/1024 && cp "$CAPCUT_PROJECTS_DIR/root_meta_info.json" out/capcut-pilot/backup-20261025-020959/
diff -rq "$CAPCUT_PROJECTS_DIR/1024" out/capcut-pilot/backup-20261025-020959/1024   # → пусто (108 МБ)
node pilot/capcut/fix-zoom-kftype.mjs 1024 252fb279-ae43-43ae-b63b-4c4c9b478db5 --check
node pilot/capcut/fix-zoom-kftype.mjs 1024 252fb279-ae43-43ae-b63b-4c4c9b478db5 --apply
node pilot/capcut/fix-zoom-kftype.mjs 1024 252fb279-ae43-43ae-b63b-4c4c9b478db5 --check
```
Результат дословно:
```
--check ДО:   списки ключевых кадров: [ 'UNIFORM_SCALE: 0→1 1835000→1.12' ]
              ПРОБЛЕМЫ: есть список UNIFORM_SCALE (2 кадров) — движок CapCut 9.5 его не знает; нет списка KFTypeScaleX; нет списка KFTypeScaleY   → exit=1  (позитивный контроль, гейт 4)
--apply:      записано: 62507d96adcef9a2 × 4 (draft_info.json, template-2.tmp, Timelines/E670B181…/draft_info.json, …/template-2.tmp)
              новые списки: [ 'KFTypeScaleX: 0→1 1833333→1.12', 'KFTypeScaleY: 0→1 1833333→1.12' ]   → exit=0
--check ПОСЛЕ: OK: зум закодирован как KFTypeScaleX/KFTypeScaleY, UNIFORM_SCALE нет   → exit=0
```

### 8.4 Проверки
- **Точечность правки**: структурный diff бэкап→живой файл при численном равенстве (`1.0 == 1`) — ровно одно отличие: `/tracks[0]/segments[1]/common_keyframes [len 1->2]`. (Побайтно файлы отличаются ещё и формой чисел: `JSON.stringify` пишет `1` вместо `1.0`, `30` вместо `30.0` — так же писал compile в шаге 5, CapCut это принял и вернул `1.0`.)
- **lint живого проекта** (`capcut lint "$CAPCUT_PROJECTS_DIR/1024" --active-timeline`, `out/capcut-pilot/step8-lint.txt`): `errors: 4, warnings: 0, info: 1` — все 4 ошибки `missing-file` на пути вида `##_draftpath_placeholder_…_##/assets/…`: **capcut-cli 0.31.1 не знает плейсхолдер CapCut** (`grep -rn draftpath_placeholder dist docs` — 0 совпадений), файлы в `1024/assets/` существуют. Это артефакт перезаписи путей приложением (8.1), не правки зума. Доказательство, что других ошибок нет: scratch-копия проекта с подставленным вместо плейсхолдера реальным путём (16 замен, вне папки проектов) → `ok: true, errors: 0, warnings: 0, info: 5` (`media-outside-draft` ×4 — следствие той же подстановки, `keyframe-trimmed-clock` — info о сегменте с sourceStart>0, было и в шаге 5). Файл: `out/capcut-pilot/step8-lint-abs-paths.txt`.
- **Позитивный контроль lint (гейт 4)**: scratch-копия бэкапа с `segment2.target_timerange.start = 0` → `error segment-overlap` («Segments 5155de4c and 252fb279 overlap by 933333us»), exit 2.
- **Неприкосновенность**: sha256 всех `draft_info.json` вне `1024` (19 файлов, включая `.recycle_bin/0909`) + `root_meta_info.json` — `step8-sha-others-before.txt` = `step8-sha-others-after.txt` (20 строк, `cmp` идентичны). `draft_meta_info.json` не менялся (`bf46a1fb…` до и после). Временных `*.step8.tmp` не осталось. `pgrep -x CapCut` пуст до и после.
- **Бэкап**: `out/capcut-pilot/backup-20261025-020959/` (полная папка `1024` + `root_meta_info.json`, `diff -rq` пуст). **Снимок записанного**: `out/capcut-pilot/written-step8/` + `step8-sha-pilot-written.txt` (таймлайн `62507d96…` ×4, `project.json` `e957c70c…`, `draft_meta_info.json` `bf46a1fb…`).

### 8.5 Имя «1024» вместо «Pilot»
- **Наша запись имя не меняла**: в снимке `written/draft_meta_info.json` (после compile) `draft_name: "Pilot"`; `root_meta_info.json` compile не трогал (sha до = после, шаг 7); оба говорили «Pilot» до открытия в CapCut.
- **Переименовал CapCut** при открытии 25.10 01:57–02:01: `draft_name` «Pilot»→«1024» одновременно в `draft_meta_info.json` и `root_meta_info.json` (вместе с `tm_duration 0→4566666`, `tm_draft_modified`). Механизм (по данным на этом Mac): CapCut держит имя папки = имени проекта — проект «Mias Story» лежит в папке `Mias Story`, переименованной приложением из `1002` (в его `draft_meta_info.draft_fold_path` остался старый `…/1002`); у остальных 8 проектов папка = имя. У Pilot папка осталась `1024` (переименование папки до закрытия приложения не произошло), и при открытии CapCut привёл имя к папке. Других хранилищ имени нет: `grep -rl Pilot` по `User Data` и контейнеру — 0; в `Config/draftLayoutConfig.ini` только `draft_id=0`; логов за 25.10 нет.
- **«Pilot» не возвращал**: это не следствие нашей записи, а правка имени требует писать `root_meta_info.json` **вне папки `1024`** (запрет шага). Переименовать может Олег в CapCut (правый клик → Rename): приложение переименует и папку.

### 8.6 Отклонения шага 8
1. «lint без ошибок» на живом проекте буквально не выполняется: 4 ложных `missing-file` из-за плейсхолдера путей CapCut, которого capcut-cli 0.31.1 не знает (8.4). На копии с раскрытым плейсхолдером — 0 ошибок, 0 предупреждений. Переписывать пути обратно в абсолютные не стал: это не зум, и CapCut вернёт плейсхолдер при следующем сохранении.
2. Эталон найден не в проектах Олега (там ключевых кадров нет) и не в pyJianYingDraft (офлайн недоступен), а в Lua-миграциях движка `libvideoeditor.dylib` + примере и lint-заметке capcut-cli (8.2). Это чтение строк бинарника приложения, без модификации и без запуска.
3. Правка — точечная JSON-правка собственным скриптом, не штатной командой capcut-cli (штатная пишет только `UNIFORM_SCALE`); все гарантии записи capcut-cli (атомарность, 4 копии, закрытый CapCut, одинаковые копии) воспроизведены в скрипте.

### Для Олега (шаг 8)
CapCut: открыть проект **«1024»** → клип V3 (0.93–2.77 с) должен плавно наезжать до ×1.12 к концу клипа; переход V3→V10 и музыка — как раньше. Если зум виден — переименовать проект в «Pilot» правым кликом (приложение переименует и папку). Ответ архитектору одной строкой: «зум работает / не работает». Откат, если нужно (терминал Mac, при закрытом CapCut):
```
rm -rf "$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft/1024" && cp -R ~/Projects/reels-motion/out/capcut-pilot/backup-20261025-020959/1024 "$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft/1024"
```
Для capcut-cli стоит завести issue: `PROPERTY_MAP.uniform_scale` должен давать пару `KFTypeScaleX`/`KFTypeScaleY` для черновиков new_version ≥ 77 (CapCut 9.x) — вне рамок задачи, не делал.

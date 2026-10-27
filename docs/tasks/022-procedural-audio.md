# 022 — Процедурный звук (mgaudio, MIT) как источник sfx + аудио-QC

Согласовано: Олег «да» 2026-10-27. Архитектор. Где: **только Mac** (прослушка, библиотека sfx). Ориентир: 150 мин. Больше 300 — стоп и причина.
После 021 (обе задачи правят `env.manifest.json` — не параллельно).

## Зачем
Сейчас SFX — только скачанные библиотеки (Kenney CC0, Sonniss по белому списку). Нет звуков под HUD/терминал/печать/штамп для «Терміналу» (020, звук отложен) и нет пути «CC0 вместо внешних SFX» (бэклог 008). Наши аудио-проверки — громкость, true peak и синхрон; баланса по полосам, моно-совместимости и измерения онсетов нет.

## Источник
`Vincentwei1021/mg-styles-15` @ `49052d8`, MIT, `lib/audio/mgaudio/` (≈ 30 файлов Python: osc/filters/synth/fm/drums/sfx/fx/mix/master/qc/sync/theory). Сэмплы `lib/audio/samples/` (≈ 56 МБ) — подмножество VCSL, заявлено CC0.
- Код → `vendor/mgaudio/` + `VENDORED.md` (коммит, лицензия, что изменено). Без музыкальных рецептов-демо роликов (`demos/*/audio.py` не брать).
- Сэмплы в git не класть: папка вне репо, путь — новая переменная `MGAUDIO_SAMPLES_DIR` (гейт 2), скачать скриптом из клона или из upstream VCSL.
- **Лицензия сэмплов — проверить до использования:** `samples.py` ссылается на `SAMPLES.md`, которого в репо нет. Открыть upstream `sgossner/VCSL`, прочитать LICENSE, записать дословно в `VENDORED.md`. Не CC0 → сэмплы не использовать, работать только синтезом (большинство `sfx.*` сэмплов не требует). Гейт 6: лицензия в манифест.
- Python: отдельный venv `.venv-mgaudio` с точными версиями из `requirements.txt` репо (numpy, scipy, soundfile, numba, pedalboard, pyloudnorm, librosa, matplotlib); путь — `MGAUDIO_PYTHON` в `env.manifest.json`.

## Что сделать
1. `sfx/procedural/recipes.yaml` — список звуков: `{id, type, fn, args, seed, note}`; `fn` — функция `mgaudio.sfx.*`. Первый набор под «Термінал» и UI (≈ 24 звука, по 2–3 варианта seed на тип):
   `hud_beep` (новая строка лога, 3 ноты), `typing` (строка печатается, n_keys 6/10), `tick('hi')`, `click('soft'|'switch')`, `ui('confirm'|'error'|'notify')`, `hud_scan` (сканер стен), `lock_on` (контур замкнулся), `stamp('rubber')` (штамп «ДО ЛЮДИНИ»), `paper('slide')`, `whoosh('soft')`, `impact('soft')`.
2. `sfx/procedural/build.py` (запуск: `npm run sfx:procedural`) → WAV 48 кГц в `sfx/raw/procedural/` → дальше **существующий** `sfx/collect.mjs` как ещё один источник (`source: "mgaudio"`, `license: "MIT"`, для сэмплов — их лицензия): та же конвертация, измерение `transientMs`, sha256, запись в manifest. В `approved.json` ничего не писать (гейт 5) — отбор делает Олег в `npm run sfx:lab`.
   Детерминизм: один и тот же `recipes.yaml` → побайтно одинаковые WAV (проверка двумя прогонами, sha256 в отчёт).
3. `scripts/audiocheck.mjs <wav|mp4> [--hits "t1,t2"] [--dur S]` → обёртка над `mgaudio.qc.analyze`: LUFS, true peak, полосы (% энергии sub/bass/lowmid/presence/brilliance/air), `stereo_corr`, `longest_gap`, онсеты, `hit_alignment` по `--hits` → `out/qa/audio-<name>.json` + спектрограмма PNG с отметками ударов; exit 1 при предупреждениях. Пороги — из `qc.py` (откалиброваны авторами на коммерческих мастерах), помечены в отчёте как гипотеза для нашей калибровки.
   Позитивный контроль (гейт 4): (а) мастер аутро MIA v3 → без предупреждений по фазе и длительности (что выдаст по полосам — в отчёт как есть); (б) тот же файл с инвертированным правым каналом → обязан дать предупреждение фазы (`stereo_corr < 0`); (в) `--hits` со сдвигом 80 мс → обязан упасть по hit_alignment.
4. Скилл motion-review, раздел «Автоматические проверки»: строка про `audiocheck` (полосы, моно, удары). Скилл beat-sync шаг 6: «источник SFX — библиотека или `sfx/procedural`; звук, синтезированный кодом, ставится по точке синхрона (для свиста — пик пролёта, для riser — конец)».

## Не делать
Музыку рецептами mgaudio для роликов (Suno звучит лучше; рецепты — только если Олег попросит). Звук «Терміналу» в саму композицию — отдельная задача после отбора Олегом. Трогать `sfx/approved.json`.

## Отчёт `docs/tasks/022-procedural-audio.report.md`
Лицензия VCSL дословно; список сгенерированных id; sha256 двух прогонов; вывод audiocheck и трёх контролей; ссылка на прослушку. Коммит `task 022: процедурный звук + audiocheck`, push, **СТОП**.

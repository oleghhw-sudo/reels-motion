# Vendored: mexicat/pdoom-video (анализ музыки)

- Источник: https://github.com/mexicat/pdoom-video
- Коммит: fa164b7 (fa164b74fd0b26a99375715b619c55b4a0fb3d05, 2026-10-05), лицензия MIT (c) 2026 Giacomo Magnanini — см. LICENSE рядом.
  Песня из того репозитория — не их и к нам не копировалась.
- Скопировано без правок (для сверки с переносом):
  - `analyze.py` ← `analysis/analyze.py` — сетка темпа, огибающие 100 fps, онсеты kick/snare/hat, вокальные онсеты, картинки;
  - `common.py` ← `analysis/common.py` — пути, кэш, `STEM_OFFSET_SAMPLES`, загрузка стемов;
  - `vocal_feats.py` ← `analysis/vocal_feats.py` — признаки вокального стема (нужны `vocal_onsets`);
  - `LICENSE`.
  Не скопировано: выравнивание текста песни (`align.py`, `ctcalign.py`, `ctc_emissions.py`, `pron.py`, `whisper_run.py` —
  отложено решением Олега 2026-10-27), `qa_plot.py`, `zoom.py`, `make_fonts.py`, движок three.js, данные и аудио.
- Эти файлы у нас НЕ запускаются и не импортируются (при импорте `common.py` создаёт каталоги рядом с собой и ждёт
  `audio/pdoom.mp3`). Рабочий код — `audio/analyze/`:
  - `pdoom_dsp.py` — перенесённые функции (`band_sos`, `frame_rms`, `smooth_env`, `norm01`, `band_onsets`, `drum_onsets`,
    `strength01`, `vocal_feats`, `vocal_onsets`); список правок — в шапке файла;
  - `analyze.py` — свой код: вход, стемы, сетка, сильная доля, такты, финальный удар, выводы. Из оригинала взяты
    идея и вид оценки сетки (`fit_grid.score` → `grid_scores`, `fit_tempo`) и раскладка картинки (`make_plots` → `make_plot`).
- Что в оригинале задано руками и чем заменено (задача 021):
  | В оригинале | У нас |
  |---|---|
  | `SECTION_BARS` — секции под одну песню | секции не угадываются: `bars[].loudnessDb` и `sectionsCandidates` (скачок громкости такта ≥ 4 дБ, `candidate: true`) |
  | поиск темпа только 125–138 BPM | 70–180 BPM: гребёнка автокорреляции + приор у 120; вне диапазона — `--bpm-hint` |
  | фаза по медиане остатков бочки | период и фаза — регрессией по онсетам бочки и малого (или атакам микса, если барабанов нет) |
  | полутакт снят вручную по гармонии | рисунок «малый на 2 и 4» + смена гармонии по долям + акцент; слабый перевес → `downbeatConfidence: "low"` |
  | `STEM_OFFSET_SAMPLES = 1015` для mp3 | вход декодируется ffmpeg в WAV 44.1 кГц один раз; смещение стемов — кросс-корреляцией (`stemOffsetMs`) |
  | темп считается постоянным | отклонение онсетов от сетки по окнам 15 с; > 10 мс → `tempo: "variable"`, доли из локальных сеток |
  | стемы — отдельной командой `python -m demucs` | `separate.py` (API Demucs, CPU, `shifts=0` — повторяемо), запуск через `/usr/bin/time -l` |
- Обновить: клонировать репозиторий на нужном коммите, заменить три файла и LICENSE, сверить перенос в `pdoom_dsp.py`,
  обновить коммит здесь и в `THIRD-PARTY.md`.

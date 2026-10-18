# Копилка эффектов и правил (из внешних репозиториев)

Снято 2026-10-14. Коммиты зафиксированы. Код брать только по лицензии, правила с числами — как гипотезы,
калибровать на своём эталоне (правило калибровки проекта), а не принимать как истину.

| Репо | Коммит | Лицензия | Что это на самом деле |
|---|---|---|---|
| JohnHeibel/ClaudeAnimationBase | 0ac8bf2 | MIT | p5.js + p5.brush, персонажная анимация, детерминированный рендер `renderAt(t)`; ~1400 строк кода |
| feitangyuan/onetake | 4157581 | **PolyForm Noncommercial** | методика «carry» + `lib/motion.js` на HTML/Playwright. **Код не копировать** (ролики коммерческие; в коде водяной знак `otk-7f3e1c`) — только идеи |
| lemomo-ai/lemo-opuscar | fdc46d7 | MIT | 43 стиля-промпта + ядро на Playwright/ffmpeg; ценны проверки и аудио-инструменты |
| pyang5166/gbro-collage-broll | a1a4ee2 | MIT | скилл для **Codex**; коллаж генерирует Gemini/Veo по промпту, кода эффектов нет |

## A. Портировать код (MIT) — чистые функции от t → в Remotion `t = frame/fps`

| Что | Источник | Зачем нам |
|---|---|---|
| `spring`/`ring`: `exp(-k·Δt)·sin(w·Δt)`, k=6, w=18 | ClaudeAnimationBase `src/core.js:59-60` | «пинок» после события (появление цифры, кнопки) **Перенесено → src/motion/index.ts (`ring`, `ringEvents`, `kick`)** |
| `take`, `jump` (сплющивание `.22·e^(-8a)·cos(20a)`) | там же `:67-80` | реакция объекта на удар/долю **Перенесено → src/motion/index.ts (`take`, `jump`, `squashScale`)** |
| `pulse`/`beatN`: `exp(-frac(beat)·k)` | там же `:31-33` | пульс на сильную долю — дополнение к нашей сетке долей **Перенесено → src/motion/index.ts (`pulse`, `beatN`, `gridFromBeat`)** |
| `shakeXY` (hash от кадра), `onTwos` `floor(t·12)/12` | там же `:54, :62` | детерминированная тряска; «на двойках» для стоп-моушна **Перенесено → src/motion/index.ts (`shakeXY`, `onTwos`)** |
| `ribbon`/`through` (Catmull-Rom) | там же `:150-180` | линии-связки между элементами **Перенесено → src/motion/index.ts (`through`, `ribbon`, `svgPath`, `pathUpTo`; плюс `arcPt`)** |
| `readcheck`: ролик проходится с шагом 0.04 с, каждый текст должен быть целиком в кадре ≥ нужного времени; ловит вылеты за край | lemo-opuscar `core/render/readcheck.mjs` | **автопроверка читаемости** — у нас её нет **Перенесено → scripts/readcheck.mjs + src/qa/Readable.tsx (фикстура src/qa/ReadcheckFixture.tsx)** |
| ASR-сверка голоса + `words.json` с таймингами слов; сопоставление слов субтитров со словами Whisper по буквам | lemo-opuscar `core/tts/asr_check.py`, `styles/swiss-motion/demo/tools/words.py` | шаг после Fish Audio: тайминги слов на украинском и пословные субтитры |
| Ducking: полоса «говорят» → `maximum_filter` (опережение ~80 мс) → сглаживание 250 мс → `1 − .68·vad` | lemo-opuscar `styles/swiss-motion/demo/mix.py` | в Remotion — формула в `volume={(f)=>…}` |
| `snap`/`steps`/`track`: элемент стартует на 1/8 раньше и встаёт точно на долю | lemo-opuscar `styles/swiss-motion/demo/ease.js` | монтаж под сильные доли (Beauty Studio) |

## B. Идеи — реализовать своим кодом

- **Carry (onetake).** На каждом стыке что-то переживает склейку: объект сдвигается ≥2% диагонали или масштабируется ≥10%. Голая склейка — только в «пачке» ударных слов и перед финальной карточкой. В раскадровке колонка «что переносится».
- **Переходы-carry:** `morphRect` (кнопка → окно), `iris` от объекта, `zoomThrough` (лог-зум, пока карточка не заполнит кадр), `gather` (элементы слетаются веером, шаг 0.08 с).
- **brushWipe (ClaudeAnimationBase `timeline.js:141-159`):** 5 полос, задержки `[0,.14,.06,.18,.1]`, наклон −0.1 рад, склейка на p=0.5 под полным перекрытием. У нас — SVG/clipPath.
- **Смена состояния (`emotions()`):** прищур за 0.1 с до смены и 0.14 с после, `backOut` 0.4 с, цвет перетекает 0.3 с → для смены цифр/статусов в UI-блоках.
- **Стоп-моушн коллаж (gbro):** однотонный фон + зерно, ч/б полутоновые вырезки, цвет только для иерархии, кремовая обводка + мягкая тень; сборка с пустого фона «структура → объект → связки → действие → результат», 3–6 групп, слои через `spring()` со сдвигом 8–12 кадров, «на двойках». Числа обводки/тени в репо нет — подобрать.
- **Камера-оператор (onetake):** следование с опережением ~0.1 с на sineInOut; рывок — ключ в точку приземления на expoInOut; «рука» из двух синусов, равная нулю в паузах; при зуме >20× ключевать лог-зум.
- **Motion blur как затвор 180°** — у Remotion есть `@remotion/motion-blur`; нужен при скорости >80 px/кадр.
- **Кривые по t80** (доля длительности до 80% пути): expoOut .23, quintOut .28, cubicOut .42, smoother .67 — словарь для выбора easing. **Перенесено (свои формулы) → src/motion/index.ts (`expoOut`, `quintOut`, `cubicOut`, `smoother`, `T80`).**
- **Против ряби на тёмных градиентах после кодирования:** фиксированный шум 256², альфа ≤ 7/255.
- **Луки = 8 токенов** (ground, deep, card, line, mute, ink, accent, accent2), ink ≥4.5:1, mute ≥3:1 — сверить с нашей схемой пресетов.
- **Стили lemo, близкие к editorial:** `swiss-motion` (12 колонок, 2 кривые `(.7,0,.2,1)` и линейная, без overshoot, удаление «ножом»), `halftone-dossier` (штамп 0.09 с с 2.6×→1×, посимвольный drop со сдвигом 0.05–0.08 с), `risograph` (сдвиг совмещения ±1–3 px на шот, kick 8–14 px ~0.25 с на акценте).

## C. Правила режиссуры (гипотезы для калибровки)

**Время чтения**
- Шот длится столько, сколько нужно на «прочтения», а не наоборот; причина раньше реакции; «быстрые действия, медленные смыслы» (ClaudeAnimationBase, ANIMATION_GUIDE 49-59, 451-461).
- Текст держится после анимации (букв/15 + 1.5) с; субтитр max(1.8 с, фраза + 0.6 с); титр ≥ 4 с (lemo DIRECTOR). **Для украинского 15 симв/с, вероятно, много — проверить.**

**Ритм**
- Длины планов: коэф. вариации ≥ 0.25, разброс ≥ 4× (0.25 с рядом с 2.5 с); два плана подряд не заканчиваются одинаково; «пачка» = ≥3 смены за 1.5 с (onetake rhythm.md).
- ⚠ **Противоречие источников:** onetake — ≥25% кадров полностью статичны и пауза ≥1 с (медленный наезд паузой не считается); ClaudeAnimationBase — «ни одного статичного кадра». Решать по жанру и проверять на эталоне.
- Хук в первые 3 с; одна «нативная» фишка медиума в эмоциональном пике (lemo).

**Звук**
- Три слоя: эмбиент, фоли, музыка; у каждого видимого действия — свой звук, но событий меньше, чем битов; звуки ближе 40 мс — оставить один; все в одной «комнате» (onetake, lemo).
- Голос на ~10 дБ над музыкой (минимум 6), ducking ~−10 дБ; 20–120 Гц −3 дБ; пэды не ниже MIDI 48; питчевые партии не ниже F4.
- ⚠ **Мастер расходится:** onetake −16 LUFS / TP −3.5…−4; lemo −14 / −1.2; у нас −14 / −1 (норма Instagram). Оставляем наш, TP можно опустить до −1.5 для AAC.

**Ревью-цикл**
- Контактные листы с шагом 0.1–0.2 с, покадровые ленты ключевых движений, первые и последние 0.5 с каждого шота отдельно; ebur128 + blackdetect; повторный Whisper по финальному миксу.

## D. Не брать
- Рендер-движки (p5.brush, Playwright/HTML-рендер, three/post, crt.js) — дублируют Remotion, p5.brush к тому же секунды на кадр.
- Генерация движения моделью (gbro: Gemini Omni/Veo) — недетерминированно, платно, 720p/24fps, фальшивые буквы.
- Любые файлы onetake как есть (лицензия); пружины onetake (в Remotion есть `spring()`).

## Красные флаги (не запускать их скрипты как есть)
- lemo `plugin/.../setup.sh`: на каждом запуске `git fetch` + `reset --hard` upstream — подмена кода без ревью; Python-зависимости без пинов.
- gbro `upload_file.py:70-79`: вызывает отсутствующий `prep_video.py` через subprocess; `allow_implicit_invocation: true`; ключ через `--api-key` виден в процессах.
- ClaudeAnimationBase: `eval` для CLI-флага `--crop-at` (`src/core.js:307`), Chrome с `--no-sandbox`.
- onetake: функция камеры `OM.rig` описана, но вырезана (в Pro); пороги откалиброваны на нескольких роликах одного заказчика.
- README ≠ код: lemo обещает 98 стилей, в репо 43; дефолт у всех — 1920×1080 при 24 fps, не 9:16/30.

## E. motion-prompt (showheyohtaki, MIT, коммит 770eefb) — подключено 2026-10-15

Каталог 120 именованных элементов, закреплён в `vendor/motion-prompt`, скилл `.claude/skills/motion-prompt`.
Каждый элемент — чистая функция от времени + точная спецификация (тайминги, кривые, дистанции).
Закрывает пробелы, которых не было в разделах A–D:

| № | Что | Зачем нам |
|---|---|---|
| #017 Mask transition, #018 Shape transition, #019 Liquid transition, #020 Zoom through | переходы между сценами | у нас были только шторки и растворения |
| #043 Whip pan, #045 Wipe, #046 Smash cut, #042 Match cut | переходы «камерой» | ритм и «carry» на стыках |
| #047 J-cut, #048 L-cut | звук опережает/отстаёт от склейки | правило lemo «≥2 J/L-перехода» — теперь с эталоном |
| #005 Mask reveal, #006 Typewriter, #007 Count-up, #008 Kinetic typography | текстовые появления | переносить спецификацией в DOM + `<Readable>` |
| #097–#120 photo | свет, линзы, финишные луки | словарь для промптов генерации изображений (AI-CGI курсы), не код |

Пересекается с `src/motion`: #009 Easing, #010 Overshoot, #011 Squash & stretch, #024 Impact shake — при переносе сверять кривые, не дублировать.

## F. Статья «Claude — студия» + 4 репозитория (разбор 2026-10-16)

Статья: пересказ анонса Anthropic от 08.10.2026 (Dashboards — бета на платных планах, у графика виден запрос;
Motion — бета Team/Enterprise, анимация кодом, MP4; Docs/Slides/Design — все планы). Список из 11 репо проверен — все существуют.

| Репо | Коммит | Лицензия | Вердикт |
|---|---|---|---|
| remotion-dev/skills | 7ba4dcf | файла нет (вероятно Remotion License монорепо) | частично: закрепить в vendor/, подключить только markup (timing, transitions, sequencing, audio, measuring-text, text-highlights, silence-detection) и captions с правками. НЕ брать: sfx (мемы без лицензий, сеть), voiceover (ElevenLabs, просит ключ), docs (живой Algolia), upgrade (ломает пин 4.0.534), maps, interactivity |
| LottieFiles/motion-design-skill | f9a8a04 | MIT | не скиллом (тянет CSS/Framer, UI-мышление в мс) — правила в копилку как гипотезы |
| Barty-Bart/motion-graphics | 3d83d98 | MIT | портировать `M.track` (сумма пружин на смену цели) и `M.vis` (смена содержимого) в src/motion; CC0-звуки через наш манифест (без Mixkit) |
| howseen-ai/claude-motion-design | 3d90d34 | MIT | идея: звук ставится так, чтобы ИЗМЕРЕННЫЙ пик попал в событие; правила субтитров; остальное не брать (сеть, Mixkit, remake чужих видео) |

**Новое и полезное (гипотезы для калибровки):**
- Remotion: длина = сумма сцен − сумма переходов; `fitText`/`fillTextBox` — проверка переполнения до рендера (дополняет readcheck); `posterize` = «на двойках»; `render --frames=0,30,90` — контактный лист одним вызовом; Google Fonts — ТОЛЬКО с `subsets: ['cyrillic','latin']` (в их примерах только latin → потеря ґєії).
- LottieFiles: выход = 65–75 % от входа; длительность растёт с дистанцией (50 px ×0.8 … весь экран ×1.8–2); бюджет перелёта (ошибка 0 %, успех 5–10 %, праздник 15–25 %); вторичные элементы отстают на 50–150 мс; после развязки 100–200 мс тишины; фоновые «дыхание» 0.98–1.02 за 2–4 с, парение ±5–15 px с несинхронными периодами.
- Barty-Bart: одна смена на ударное слово, интервал 0.4–1.2 с; не перебивать первую секунду хука; whoosh на 2 кадра раньше удара; музыка −12 дБ, ducking 8–12 дБ под голос.
- howseen: субтитры ≤17 симв/с и ≥0.7 с на экране, слово загорается на своём стартовом кадре; крупное появление можно подтянуть к доле ≤0.15 с, мелкое ≤0.10 с; подкадры motion blur по скорости.

**Пробел, который закрыть своим кодом (после калибровки голоса, задача 002):** резолвер «элемент на слово» —
`at: {word, n}` в scenes.yaml → кадр начала слова из words.json; анимация на `M.track`/`M.vis`; проверка в стиле readcheck
(смена в [start,end] своего слова, между сменами ≥0.4 с) с позитивным контролем на смещённом якоре.

**Расхождения источников, решать на эталоне:** мастер −16 LUFS (Barty-Bart, onetake) vs −14 (наш, howseen, lemo); «всегда 3 слоя движения» (LottieFiles) vs «≥25 % статичных кадров» (onetake).

## G. cinetic и product-film-skill (разбор 2026-10-18, через prompt-motion.com)

| Репо | Коммит | Лицензия | Вердикт |
|---|---|---|---|
| Leonxlnx/cinetic | ecfa660 | MIT | Нормы движения взяты в скиллы living-motion / motion-review / reel-presentation. Код-кандидаты на порт (задачей): `lib/anim.ts` (E, SPR, hitPulse, durFor, arrive/depart, squash, inertia), `lib/camera.ts`, `lib/pace.ts`, `lib/sync.ts` (peak, delayTo, settleOf), `fx/` (Words, Chain, TypeOn, Roll, Morph, MaskRise, Iris, Cursor, RackFocus). Риски: FontGate через requestAnimationFrame и без образца кириллицы; паузы calm короче readcheck; 60 fps по умолчанию; их safe-zone справа 120 (у нас 140). НЕ брать: score/kit-генерацию звука (перезаписывает файлы), HyperFrames-стартер (теряет кириллицу), вкусовые запреты цвета как гейт. |
| Rieranthony/product-film-skill | fe11efc | MIT | Взято в beat-sync/motion-review: бит-сетка по стемам, резка по тактам, SFX на пиках, стоп-кадры одним бандлом, листы склеек, проверка цветового диапазона мастера. Код-кандидаты: `kit/spring.ts` (step/track — совпадает с задачей 003), `move.ts` (magic move, swapIn), `camera.ts`, `cursor.tsx`, `cursor-path.ts`, `punchlines.tsx`, `debug.tsx`; скрипты `beats.py`, `audio-edit.py`, `verify.py`, `stills.ts`. |
| prompt-motion.com | — | без лицензии | Только референсы и статистика промптов (баны, «одна форма», 120 BPM / «на каждой доле»). Ассеты не брать. |

## H. Выразительность: Remotion 4.0.534, словарь AE/CapCut, скиллы GitHub 2026 (разбор 2026-10-18)

Полный разбор — `docs/ANALYSIS-expressiveness.md`; скилл — `.claude/skills/cinematic-fx`. Здесь — что откуда и можно ли брать.

| Источник | Лицензия | Вердикт |
|---|---|---|
| `@remotion/effects@4.0.534` (chromaticAberration, glow, vignette, noise, zoomBlur, blur directional, lightTrail, lightLeak, lut, halftone, duotone, evolve, pixelDissolve, noiseDisplacement, scanlines, tear, starburst, invert, levels, colorCorrection; `createEffect`) и `<HtmlInCanvas>` | Remotion License (как `remotion`) | **Подключить задачей 012** — закрывает почти весь словарь удара/оптики без портов чужого кода. Требует `--gl=angle` (есть). Не брать без апгрейда: `turbulentDisplace`, `fractalNoise`, `lensBlur` (4.0.537). |
| `@remotion/transitions@4.0.534`: `pushCut`, shader-презентации (порты gl-transitions MIT), `TransitionSeries.Overlay` | Remotion License | задача 012-Б (удар M между сценами, light leak над склейкой) |
| `@remotion/motion-blur@4.0.534`: `HtmlInCanvasMotionBlur`, `CameraMotionBlur`, `Trail` | MIT | задача 012 (затвор 180°/360°, шлейф слэма) |
| `@remotion/captions`, `@remotion/layout-utils`, `@remotion/paths` | MIT | 014 (субтитры), 012 (fitText), 011-Б (evolvePath, interpolatePaths) |
| Remotion docs «accelerated video» (speed ramp на OffthreadVideo: накопленная remap + Sequence на кадр + `#disable`) | — | рецепт ramp; `@remotion/media <Video>` ramp не умеет, реверс не поддерживается |
| Tejashmakwana/motionmaxxing | Apache-2.0 | числа 716 про-движений (медиана 10 к., перелёт < 9 %, G2 «> 3 неподвижных кадров — провал», hold 0.6–1.4 с) → cinematic-fx/motion-review как гипотезы; код (GSAP) не нужен |
| dev-isaacmello/extreme-motion-design | MIT | идеи QA: вспышки ≤ 3/с, loop seam, оценка относительно референса → 013 |
| lemomo-ai/lemo-opuscar (повторно) | MIT | DIRECTOR.md числа (субтитры ≥ max(1.8, фраза+0.6) с, титр ≥ 4 с, ≥ 2 тишины, ≥ 2 J/L), грамматики halftone-dossier/risograph (штамп 2.6×→1 за 0.09 с, тряска 5–26 px квадратичное затухание, сдвиг совмещения на шот) |
| Fats403/remotion-captions-kit, neutral-Stage/remotion-captioneer, AgriciDaniel/claude-shorts | MIT | пагинация (400 мс / 1200 мс / 42 симв / ≥ 300 мс / ≥ 2 слов), стили субтитров, cps-гейт 17/20 → 014 |
| kapishdima/remocn, degueba/onda, reactvideoeditor/remotion-templates, RenderComp/free-remotion-templates, storybynumbers/remotion-glitch-effect | MIT | детерминированные образцы shake/whip/zoom-pulse/film-burn/glitch (SVG feColorMatrix + screen) — резерв, если effects не хватит; порт только задачей с лицензией |
| echris6/motion-video-kit, edenfunf/reelmimic | MIT | процесс: строитель ≠ судья, свежие критики на рендере, before/after для правок |
| YeJe-cpu/SeeCut, YIAN6557/eian-riso-broll | PolyForm-NC / custom NC | только идеи (парное A/B лучше абсолютной оценки); код не брать |
| Liamrjohnston/remotion-motion-graphics-skill, Melvynx/video-agent-skills, kajisho5/ffmpeg-skill | MIT | «не повторять голос текстом», критик 7×(≥8), измерение референса (`/steal`), субтитры ≥ 4.5 % высоты |
| OpusClip (opus.pro) | продукт | ожидания зрителя: пресеты Karaoke/Beasty/Mozi, auto-zoom; критика «шаблонно без своего бренда» — делать свой стиль |
| AE/Premiere/CapCut-практика (schoolofmotion, aejuice, photofocus, tutvid, motionarray, borisfx, frame.io, zellahq, hormozi-гайды) | статьи | числа в cinematic-fx §3 (wiggle, zoom-punch 108–112 %, whip 10 к. + directional 100–250, glow 63/17/3.6, зерно 5–15 %, hormozi caps/1–3 слова/pop 100–200 мс, свист пик на кадре склейки, дакинг 6–12 дБ) — гипотезы |

Красные флаги: `@remotion/effects` в Studio-предпросмотре требует Chrome ≥ 149 с флагом; `feTurbulence` на полном кадре — программный путь (медленно); `backdrop-filter` в рендере не использовать; `background-image`/`mask-image` могут мерцать (гонка загрузки) — маски inline-SVG/`clip-path`; 4.0.530 изменил семантику `durationInFrames` vs `playbackRate` у OffthreadVideo (учитывать при любом апгрейде).

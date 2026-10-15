# CLAUDE.md — reels-motion

Прочитай ARCHITECTURE.md перед любой работой. Отвечай по-русски.

## Основное правило общения с Олегом

- Любой промпт, команда или фрагмент кода для Олега — ТОЛЬКО копируемым блоком (```), одна команда/шаг — отдельный блок.
- Это касается и коротких фраз для чата Claude Code («открой библиотеку motion-prompt», «используй #005 для заголовка»): никогда не вставлять их в обычный текст — только отдельным копируемым блоком.
- Над каждым блоком: куда вставлять (терминал Mac / чат Claude Code / файл с точным путём / браузер), кому адресовано, порядок и ожидаемый результат.
- Голых блоков без адресата не бывает.

## Гейты (нарушение = изменение отклоняется)

1. Всё в кадре — функция `useCurrentFrame()`. Запрещены `Date.now`, `requestAnimationFrame`, CSS-анимации, `setTimeout`, `Math.random()` без seed. Paper Shaders только с `speed={0}` и `frame={кадр/fps*1000}`.
2. Нет дефолт-путей к данным. Новый внешний файл/ключ — сначала в `env.manifest.json`.
3. Новый флаг/состояние без читателя в том же изменении — нельзя.
4. Проверка без показанного красного падения (позитивный контроль) — нельзя.
5. `sfx/approved.json`, `approved/*.json`, `videos/*/scenes.yaml` — невосстановимое. Не перезаписывать скриптами; правит только человек или прослушка/лаборатория по его действию.
6. Звук без лицензии в манифесте не попадает в library. Разрешены: CC0, MIT, собственные/сгенерированные с платным планом.
7. Изменения функционала — только после согласования с Олегом.

## Команды

- `npm run check` — проверка среды
- `npm run studio` — Remotion Studio (лаборатория фонов: композиция `BackgroundLab`)
- `npm run sfx:collect` — собрать библиотеку звуков
- `npm run sfx:lab` — прослушка на http://localhost:5174
- `npm run still -- <Composition> <frame>` — кадр в PNG для QA
- `node scripts/readcheck.mjs <Composition> [--props JSON] [--step N] [--cps N] [--min-hold S]` — проверка читаемости текстов (`<Readable>`), stills не рендерит; отчёт `out/qa/readcheck-<Comp>.json`, exit 1 при нарушениях
- `node scripts/readcheck.mjs --self-test` — позитивный контроль readcheck на `ReadcheckFixture` (обязан найти ровно SHORT, OUT_OF_FRAME, UNSAFE)
- `npm run test:motion` — тесты `src/motion` (`-- --negative` — позитивный контроль, обязан упасть)

## Читаемость (readcheck)

- Новый ролик — readcheck обязателен до финального рендера. Каждый значимый текст (заголовки, подписи, метки, кнопка, контакты) обёрнут в `<Readable id text>` (`src/qa/Readable.tsx`, визуально прозрачен).
- Пороги cps/minHold — гипотеза (по умолчанию cps=12, minHold=1.0 с, +0.5 с), калибруются на эталоне, а не принимаются как истина.

## motion-prompt (каталог именованных движений, vendor/motion-prompt, MIT, коммит 770eefb)

- Скилл `.claude/skills/motion-prompt`. Каталог только локальный: `MOTION_PROMPT_BASE=vendor/motion-prompt/api/v1 node vendor/motion-prompt/skills/motion-prompt/scripts/motion-prompt.mjs <command>`; выбор глазами — `pick --local`.
- Олег называет движения номерами (#005, #043). Переносить ровно выбранные, ничего не добавлять и не менять.
- Текстовые элементы — спецификацией в DOM + `<Readable>`; canvas-код — только для графики без текста. Строку лицензии `// Motion Prompt #ID · MIT …` сохранять.
- Обновление каталога — только сменой закреплённого коммита (vendor/motion-prompt/VENDORED.md), не живой сетью.

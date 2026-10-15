# 005 — Официальные скиллы Remotion: закрепить и подключить частично

Статус: open · Ориентир: 30 мин · Полный рендер: НЕ нужен
Разбор и обоснование: docs/EFFECTS_PANTRY.md раздел F.

## Что сделать
1. Закрепить `https://github.com/remotion-dev/skills` на коммите `7ba4dcf` в `vendor/remotion-skills/` по образцу `vendor/motion-prompt` (файл `VENDORED.md`: источник, коммит, что скопировано и что нет, как обновлять). Лицензии файла в репо нет — в VENDORED.md записать это и ссылку на лицензию монорепо Remotion; если найдётся LICENSE в подпапках — указать.
2. Копировать ТОЛЬКО: `skills/markup` (timing, transitions, sequencing/timing-props, audio, measuring-text, text-highlights, silence-detection) и `skills/captions`. НЕ копировать: sfx, voiceover, docs, upgrade, maps, saas, interactivity, best-practices.
3. Проектный скилл `.claude/skills/remotion-markup/SKILL.md` — указатель на vendor-файлы + наши правки поверх (они главнее):
   - Google Fonts только с `subsets: ['cyrillic', 'latin']`; шрифты у нас локальные — `@remotion/google-fonts` не использовать без задачи;
   - никаких удалённых ассетов (remotion.media, http-ссылки) — только локальные через манифест;
   - субтитры/тайминги — из данных (words.json / timeline.json), НЕ массивом в JSX;
   - не запускать `npx remotion upgrade`, `npx skills update`, `npx remotion add` без задачи (версия закреплена 4.0.534; новый пакет — сначала env.manifest.json);
   - `interpolate` в `src/motion` разрешён (правило «только инлайн в style» не наше).
4. CLAUDE.md: одна строка в «Команды»/«Скиллы» о `remotion-markup`.

## Проверки
`ls` vendor и скилла в отчёт; `grep -r "remotion.media\|ELEVENLABS\|algolia" .claude/skills vendor/remotion-skills` → пусто (позитивный контроль: тот же grep по полному клону находит совпадения).

## Вне рамок
Установка новых пакетов (@remotion/transitions, captions, layout-utils) — отдельной задачей при необходимости.

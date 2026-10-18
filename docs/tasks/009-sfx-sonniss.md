# 009 — Звуки Sonniss GDC 2026 в библиотеке (белый список)

Статус: open · Ориентир: 40 мин · Полный рендер видео: НЕ нужен
Согласовано Олегом 2026-10-18 (гейт 6 расширен лицензией `Sonniss-GDC`, см. CLAUDE.md).

## Почему
В бесплатном наборе Sonniss GDC 2026 есть интерфейсные звуки и удары, которых нет в CC0-библиотеке
(счётчик #007, смена слайдов, глитч-переходы). Набор скачивается вручную (гигабайты), поэтому это
не git-источник, а локальная папка + белый список файлов.

## Что сделать
1. `env.manifest.json` → `data_dirs.vars`: `SONNISS_GDC_DIR` (`required_for: "sfx"`, `kind: dir`,
   hint: «распакованный GDC 2026 bundle с gdc.sonniss.com»). Без переменной collector НЕ падает,
   а пишет «Sonniss пропущен: SONNISS_GDC_DIR не задан» (источник необязательный).
2. `sfx/sonniss.whitelist.json` — белый список (подстрока имени файла → тип библиотеки):
   - `Readout Thin Long` → `tick` (счётчик #007)
   - `Woosh Sweep Slide Infographics Basic` → `whoosh`
   - `Interface Accept Glassy Snap`, `Interface Percussion Snap`, `Interface Pop High Short` → `pop`
   - `Interface Arp Reveal Down Long`, `Interface Sci-Fi Ping Down` → `reveal`
   - `UIGlitch_Designed_Glitch_Corrupted_Data Error`, `UIGlitch_User interface_Glitch_High_Electronic` → `glitch`
   - `Encyclopedia Glossy Page Turn Muted` → `swipe`
   - `Impact Cut Sweep`, `Woosh Debris` → `impact`, `whoosh`
   Типы — из уже существующих в manifest, если подходящий есть; новый тип — перечислить в отчёте.
3. `sfx/collect.mjs`: источник `sonniss` — без клонирования, файлы ищутся в `SONNISS_GDC_DIR` рекурсивно по белому списку.
   - `ALLOWED_LICENSES` + `'Sonniss-GDC'`; запись в manifest: `license: "Sonniss-GDC"`, `origName`, `sha256` исходника.
   - Лицензия подтверждается файлом лицензии внутри бандла (найти PDF/TXT; ключевая строка — в отчёт). Нет файла лицензии → источник целиком в отброшенные с причиной.
   - Подстрока белого списка нашла 0 или >1 файла → в отчёт, файл не берётся.
   - Обработка — как у остальных: нормализация, 48 кГц тем же ресемплером, `transientMs`.
   - PRIORITY: после существующих источников.
4. `.gitignore`: ничего из Sonniss в git (library/ и raw/ уже игнорируются — проверить).
5. Прослушка `npm run sfx:lab` показывает источник и лицензию Sonniss-GDC (если показывает лицензии других — так же).

## Проверки
- `npm run sfx:collect` без `SONNISS_GDC_DIR` → прежние 556 звуков, строка «Sonniss пропущен».
- С `SONNISS_GDC_DIR` → +N звуков (ожидается 12), список отброшенных с причинами.
- Позитивный контроль: временно подложить в whitelist имя с лицензией вне списка / несуществующий файл → collector не пускает в library и пишет причину (показать красное).
- `sfx/approved.json` не изменён (гейт 5).

## Вне рамок
Музыка из Sonniss, звуки для MIA (у MIA своя папка `_sfx`, это не библиотека reels-motion), отбор в approved (делает Олег в прослушке).

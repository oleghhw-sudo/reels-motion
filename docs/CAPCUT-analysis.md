# CapCut + Claude Code для кинематографичного монтажа AI-клипов — анализ (2026-10-24)

Автор: архитектор. Запрос Олега: монтаж кино-ролика из готовых генераций (Seedance/Runway) в CapCut силами Claude Code; Reels остаются на Remotion.
Метод: (1) проверка Mac Олега (только чтение, его командами), (2) аудит кода 15 репозиториев (клоны, коммиты закреплены), (3) опыт пользователей (блоги, YouTube, баг-журналы, HN). Reddit/HN/GitHub Issues напрямую были закрыты — пробел данных, не «обсуждений нет».

## 1. Факт с Mac Олега (первичный)
- CapCut International **9.5.0**, macOS arm64. Проекты: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/` (10 шт.).
- Проект «Mias Story»: файл таймлайна **`draft_info.json` — открытый JSON** (не зашифрован), `new_version 187.0.0`, `version 360000`, 30 fps; **нет `draft_content.json`**; есть `Timelines/`, `subdraft/`, `crypto_key_store.dat` (назначение неизвестно, ни один инструмент его не упоминает).
- Следствие: читать и писать можно, но формат новее всех фикстур в открытых инструментах (максимум 171.0.0, Windows). Mac 9.x ни у кого в тестах нет.

## 2. Инструменты (по коду; коммиты на 2026-10-24)
| Инструмент | Лицензия | Работает с `draft_info.json` + `Timelines/` | Вывод |
|---|---|---|---|
| renezander030/capcut-cli 0.31.1 (`9792c17`) | MIT | **да**: `--active-timeline`, `sync-timelines`; атомарная запись, откат, не пишет при открытом CapCut, защита по версии (9.5 = «untested», 10.x — отказ) | **единственный кандидат**; bus factor 1, частые релизы |
| sun-guannan/VectCutAPI (`48f8ff9`) | Apache-2.0 | шаблон 6.5.0, фиктивный `platform`, rmtree, удалённый вызов | нет |
| GuanYixuan/pyCapCut 0.0.4 | **нет LICENSE** | только `draft_content.json` — проекты 9.5 не читает | нет (только справочник имён) |
| pyJianYingDraft, capcut-mate | Apache-2.0 | JianYing | нет |
| duckyman capcut-editor | MIT | пишет корень + Timelines, читает **локальный кэш эффектов** | идея для адаптера, не инструмент |
| capcut-edit, capcut-cli-david, OpenChatCut (AGPL), MCP-обёртки | разные | поверх capcut-cli или устарели | нет |

Официального API/MCP CapCut для Claude нет (есть только CapCut × Codex, PC).

## 3. Что агент реально умеет в CapCut (capcut-cli, по коду)
- **Есть:** обрезка in/out, несколько дорожек, постоянная скорость, ключевые кадры pos/scale/rot/opacity (+ яркость/контраст/насыщенность), кроп 16:9→9:16, переходы (116 ID), эффекты по ID, маски, режимы наложения, текст/шрифты/анимации, SRT, музыка/SFX, фейды и ключевые кадры громкости, хромакей, размытие фона.
- **Нет ни у кого:** **кривая скорости (speed ramp)**, **реверс**, **стоп-кадр**, **бит-маркеры**, температура/LUT, motion blur, экспорт MP4 (только вручную в CapCut).
- **Эффекты/переходы по ID надёжны только если уже в кэше CapCut** на этой машине; неизвестные ID и шрифты **молча выбрасываются**. Встроенные ID фильтров capcut-cli подозрительны (идут подряд) — не использовать без проверки. Многие эффекты VIP (нужен CapCut Pro для экспорта).

## 4. Опыт пользователей (первичные отчёты)
- Работает: черновой монтаж (склейки, субтитры, оверлеи, keyframe-зумы). Richard Ens Jr (Mac, 2026-10-13): «это не идеально».
- **Ни одного публичного отчёта**, где агент поставил в CapCut speed ramp, переходы по долям или цвет; ни одного трейлера из Seedance/Kling/Runway, собранного агентом в CapCut.
- Частые сбои: CapCut перезаписывает проект при закрытии (писать только при закрытом); правка не в тот файл (`Timelines/<id>` против корня) молча игнорируется; медиа «File not accessible» (песочница Mac — класть в контейнер CapCut или `~/Movies`, не Desktop/Documents/Downloads); новые папки проектов отвергаются «unusual path» (9.3) — работает только запись в пустой проект, созданный в приложении; **CapCut 10.x отвергает чужие проекты как «повреждённые»** → обновление ломает всё.
- Консенсус монтажёров: агент — «ассистент монтажёра», финал и вкус — человек. «Монтирует вслепую»: не смотрит футаж.
- Computer use по окну CapCut на Mac сломан (claude-code #103250, codex #55043, 2026-10-18).

## 5. Рекомендуемая схема (гибрид)
1. **Кино-обработку клипов делать до CapCut, кодом** (у нас уже есть: ramp, реверс, стоп-кадр, грейд — ffmpeg/Remotion, `beat-sync` даёт сетку долей): на выходе — готовые «пластины» mp4.
2. **Claude Code + capcut-cli собирает таймлайн в пустом проекте CapCut**: пластины по долям, keyframe-зумы, переходы **из своего кэша** (`harvest-enums` по 10 проектам Олега), музыка, SFX, титры.
3. **Олег в CapCut**: доводка, эффекты на вкус, экспорт.
4. Сохранность: CapCut закрыт при записи; копия папки проекта до записи; версия CapCut закреплена на 9.5 (автообновление выключить); capcut-cli — закреплённая версия локально в проекте, без хука автоустановки, **без `caption --cloud`** (аудио на сервер ByteDance).
5. Риски: ToS CapCut запрещает «automated scripts… to interact with the Services» — серая зона; формат может сломаться при обновлении.

## 6. Пилот (самый дешёвый тест, до любой разработки)
Пустой проект в CapCut → закрыть → бэкап папки → capcut-cli `--active-timeline`: 3 клипа + музыка + 1 переход из кэша + 1 keyframe-зум → открыть в CapCut → проверить, что всё на месте, закрыть/открыть ещё раз, правки живы. Критерий «да»: открылось без ошибок, ничего не потерялось, экспорт проходит. Если 9.5 отвергнет — план Б.

## 7. План Б
- **DaVinci Resolve Studio 21.1** (разово ~$295): нативный MCP от Blackmagic для Claude (сентябрь 2026). Отзыв Team 2 Films: импорт, черновая сборка, вертикальные таймлайны, LUT, рендер — работают; цветовые ноды API не создаёт; «ассистент монтажёра».
- **Resolve Free / Final Cut**: агент генерирует FCPXML/OTIO → импорт одним кликом (practicaly.ai: склейки точны до кадра, но «готового к публикации» не получилось).

## Источники
- capcut-cli: https://github.com/renezander030/capcut-cli (docs/version-support.md, CHANGELOG.md)
- VectCutAPI: https://github.com/sun-guannan/VectCutAPI · pyCapCut: https://github.com/GuanYixuan/pyCapCut · pyJianYingDraft: https://github.com/GuanYixuan/pyJianYingDraft
- Richard Ens Jr: https://richardensjr.substack.com/p/i-used-to-dread-editing-my-videos
- Team 2 Films / Resolve 21.1 MCP: https://moderncreator.app/2026-09-08-team-2-films-davinci-resolve-21-1-s-native-mcp-server-tested-with-claude-and-chatgpt · https://digitalproduction.com/2026/09/08/resolve-21-1-adds-mcp-and-finally-gets-presets/
- practicaly.ai: https://www.practicaly.ai/p/claude-video-editing-tested
- HN «AI music video»: https://zeli.app/en/story/48939524
- computer use баги: https://github.com/anthropics/claude-code/issues/103250 · https://github.com/openai/codex/issues/55043
- ToS CapCut: https://dreamina.capcut.com/clause/terms-of-service

# Отчёт: 002-voice-calibration
Статус: частично, ждёт выбора голосов (часть А + доработка А+ по ревью готовы, часть Б не начата)
Время: ~20 мин (А) + ~15 мин (А+)

## Сделано (часть А: шаги 1–3 до `--list` включительно)
- `voice/fish.mjs` — клиент без SDK:
  - `listVoices({ language, pageSize, page, sortBy })` → `GET https://api.fish.audio/model` (бесплатно). Возвращает `id` (`_id`), `title`, `author` (nickname), `authorId`, `tags`, `languages`, `type`, `taskCount`, `url` = `https://fish.audio/m/<id>/`. Поля сверены с docs.fish.audio (List Models).
  - `tts({ text, voiceId, model, format, sampleRate, normalize, prosody? })` → `POST /v1/tts/stream/with-timestamp` (SSE). Модель без значения по умолчанию: при пустом `model` — исключение; передаётся в HTTP-заголовке `model` (по docs, `/v1/tts`).
    Склейка в чистой функции `assembleTimestampEvents`: `audio_base64` подряд; alignment хранится по `chunk_seq`, новое событие того же `chunk_seq` заменяет снимок; время = `start/end + chunk_audio_offset_sec`. Возвращает `{ audio, words, durationSec }` (длительность — из заголовка WAV).
  - Ошибки: 401 — «ключ не принят», 402 — «нужны кредиты… Не ретраю», 429 — «лимит, повторить позже» (`retryable`). Ретраев нет вообще.
  - Ключ берётся только из `process.env.FISH_API_KEY` (запуск `node --env-file=.env`). В лог — только «задан / НЕ задан». `.env` я не читал и не печатал.
- `voice/phrases.uk.json` — 5 эталонных фраз + 6-я контрольная (фраза 2 цифрами). Апостроф ’ U+2019.
- `voice/calibrate.mjs --list` → до 12 голосов `language=uk`, `sort_by=task_count`, сохраняет `out/voice/candidates.json`. `voice/calibration.json` скрипт не создаёт и не пишет (гейт 5). Без `--list` — подсказка и exit 1; `--run` в части А не реализован.
- `FISH_API_KEY` уже был в `env.manifest.json` (`env.vars`, `required_for: voice`) — манифест не менял.

## Файлы (новые / изменённые)
- новые: `voice/fish.mjs`, `voice/phrases.uk.json`, `voice/calibrate.mjs`, `docs/tasks/002-voice-calibration.report.md`
- производное (в git не идёт, `out/`): `out/voice/candidates.json`

## Проверки (команда → результат)
- `node --env-file=.env voice/calibrate.mjs --list` → `FISH_API_KEY задан`; `Голосов с language=uk в каталоге: 1008; показано: 12 (по task_count)`; exit 0; файл `out/voice/candidates.json`.
- Позитивный контроль отказа: `env -u FISH_API_KEY node voice/calibrate.mjs --list` → `ОШИБКА Fish: FISH_API_KEY не задан…`, exit 1. `node voice/calibrate.mjs` (без флага) → подсказка, exit 1.
- Платные вызовы: ни одного. В части А был только `GET /model`, это каталог, у него нет модели и он не тарифицируется. TTS не вызывался ни разу. В `tts()` модель обязательна и уходит заголовком; в части Б будет `s2.1-pro-free` в каждом запросе.
- Позитивный контроль метрик — в части Б (метрики относятся к `--run`).

## Кандидаты (`--list`, по task_count)
| # | Голос | Автор | Задач | Языки | Ссылка |
|---|---|---|---|---|---|
| 1 | Volodomyr Zelensky | oni | 12208 | uk | https://fish.audio/m/6be22288f35f4e9b964bdbeb099baee1/ |
| 2 | римма сбор | Krutov's Live | 10983 | ru,sr,uk,fi | https://fish.audio/m/2625ff9fcb274801b86e2cbb0bf0bd69/ |
| 3 | рената | tsymbalv9 | 6384 | uk,ru | https://fish.audio/m/fe8ba2d4555d457ba5fec0e86430c7fe/ |
| 4 | рита 5 | Krutov's Live | 5184 | en,pt,ru,uk | https://fish.audio/m/c4b59d5bb654460aa97a17da95ff542b/ |
| 5 | Зеленський | children's world | 4786 | uk | https://fish.audio/m/a46b54294a73455b95d614037277bf46/ |
| 6 | Александр Крапиневич | Записи с СТВ! | 4460 | be,uk,ru | https://fish.audio/m/51bc5982629d4c60ac1c2f04422e5f6f/ |
| 7 | Адам | Евгений Шереметьев | 3706 | uk,ru,en | https://fish.audio/m/3fef666f5cf44077bd00172095cd417b/ |
| 8 | Кутьина | Radomedatask | 3531 | be,kk,ru,uk,en | https://fish.audio/m/54fafc12b07b40c4831de1e62d4bf449/ |
| 9 | рита 2 | Krutov's Live | 3291 | uk,ru,pt | https://fish.audio/m/870ef480fc074017b87c576820f301e1/ |
| 10 | Валера | Maks2015 | 3185 | en,uk,ru | https://fish.audio/m/0a57dca2af5e4651ae3dbe3e6e1437bc/ |
| 11 | SHADOW FIEND DOTA 2 | pharaon Curse | 3163 | uk,bg,ru | https://fish.audio/m/4049151adeb14346a7d26ecad6cb5ac6/ |
| 12 | Кутьина | лифтовой канал | 2849 | ru,kk,uk | https://fish.audio/m/1064b5fbbc764444a11e1de0fefd0767/ |

**Внимание при выборе:** №1 и №5 — клоны голоса реального политика, №6 — по названию реальный человек, №11 — персонаж игры. Для роликов, особенно брендовых, это риск по правам и репутации; я бы их не брал. У №4 и №9 в тегах стоит `Russian`, значит голос может быть обучен на русском — это надо слушать на ’ и ґ.

## Отклонения от задачи и почему
- Формат SSE `with-timestamp` в публичной документации Fish не описан (страница TTS его не упоминает). Парсер написан по описанию в задаче и допускает несколько форм alignment: массив, `words`, `segments`. На реальном ответе он не проверялся — это первое, что надо проверить в части Б (одна фраза, сверить сырые события).
- Возможный подвох для части Б: если каждое SSE-событие несёт свой WAV-заголовок, простая склейка `audio_base64` даст битый WAV. Проверю на первом ответе.
- В `listVoices` добавлен параметр `sortBy` (по умолчанию `task_count`), чтобы список был воспроизводимым.

## Предложения (вне рамок задачи, не сделано)
- Сделать второй `--list`: только голоса с `languages == ["uk"]` или с `sort_by=score`. В топе по task_count много мультиязычных голосов с русским основным.
- Исключать из кандидатов голоса реальных людей и персонажей (по тегам или вручную).

## Доработка А+ (по `002-voice-calibration.review.md` и CLAUDE.md «Голос»)
### Сделано
- `node --env-file=.env voice/calibrate.mjs --list --only-uk` — `sort_by=score`, оставляются только голоса с `languages == ["uk"]`, 15 штук. Каталог обходится страницами по 100 (не больше 20 страниц), пока не наберётся 15. Результат — `out/voice/candidates-uk.json`; в нём же поле `excludedPoliticians`.
- `voice/politicians.mjs` — исключаются **только голоса политиков**. Поиск без регистра по названию, описанию и тегам голоса, шаблон ищется с начала слова. В список входят фамилии украинских, российских, белорусских и мировых политиков в укр., рус. и лат. написании, а также должности: президент, депутат, міністр, премʼєр, сенатор, політик. Известные люди не из политики и персонажи не исключаются.
- Фильтр работает в обоих режимах, и в `--list`, и в `--list --only-uk`. Каждое исключение печатается с шаблоном, который совпал.
- В `listVoices` добавлено поле `description` — его читает фильтр.
- Тест `voice/politicians.test.mjs` проверяет примеры из настоящего `--list`, а также ложные совпадения «Распутин» (≠ путин) и «кличка» (≠ Кличко).

### Проверки (команда → результат)
- `node voice/politicians.test.mjs` → 9 ✓, `OK: politicians`, exit 0.
- `node voice/politicians.test.mjs --negative` → `ПРОВАЛ: 2`, exit 1 (позитивный контроль красный).
- `node --env-file=.env voice/calibrate.mjs --list --only-uk` → `Каталог language=uk: 1000; просмотрено 100 (1 стр., sort_by=score); фильтр languages == ["uk"]; показано 15`; `Исключено как голоса политиков: 4`; exit 0.
- `node --env-file=.env voice/calibrate.mjs --list` (старый режим) → показано 10 из 12, исключено 2 (№1 и №5 из таблицы выше).
- Платных вызовов нет: только `GET /model`.

### Исключены как голоса политиков (`--only-uk`, первые 100 по score)
| Голос | Автор | Совпало | Ссылка |
|---|---|---|---|
| Volodomyr Zelensky | oni | zelensk | https://fish.audio/m/6be22288f35f4e9b964bdbeb099baee1/ |
| Зеленський | children's world | зеленськ | https://fish.audio/m/a46b54294a73455b95d614037277bf46/ |
| Зеленский | artemksksks | зеленск | https://fish.audio/m/b1f9fd46d1cc492a96b603d4143251dc/ |
| Зеленский | ЛукашенкоТоп | зеленск | https://fish.audio/m/59a70a465ef34b7ebb3c9dd01d5b8ea7/ |

### Кандидаты `--list --only-uk` (sort_by=score, languages == ["uk"])
| # | Голос | Автор | Задач | Теги (начало) | Ссылка |
|---|---|---|---|---|---|
| 1 | German S2 | Popghip67890 | 1889 | male, old, character-voice, deep, raspy | https://fish.audio/m/187d4119dce34a7bbec3196b75bff447/ |
| 2 | Український Диктор | DDP | 2056 | male, middle-aged, narration, announcer | https://fish.audio/m/e8f78487bf5a44b6a9bf2a0369e603aa/ |
| 3 | Konder S2 | Popghip67890 | 1420 | male, old, character-voice, deep, raspy | https://fish.audio/m/f9cbb45877b84a14963d571c14fb7484/ |
| 4 | Sultan S2 | popghip67890 | 677 | male, middle-aged, character-voice, conversational | https://fish.audio/m/639c8a6500934a449322b8fca58a6341/ |
| 5 | Офіційний диктор | Михайло Михайло | 658 | male, middle-aged, narration, advertisement | https://fish.audio/m/0e602bef976a4321b2923c44caffaa74/ |
| 6 | Ясна Українська | Аліна Книшова | 1025 | female, young, narration, friendly | https://fish.audio/m/e1cab03f89eb4b7194ae41ed1ef1c9df/ |
| 7 | Гоуст (укр.голос) | alinka | 253 | male, middle-aged, conversational, character-voice | https://fish.audio/m/13a53bfd58244073b8449d87da1fa44d/ |
| 8 | Голос транспортних оголошень | Кruk Syrnyk34 | 441 | male, old, narration, neutral-tone | https://fish.audio/m/76ead97fa5f648f99dc1096eb202a67a/ |
| 9 | Диктор метро Києва | varicalic | 589 | male, middle-aged, announcer | https://fish.audio/m/d8e745f6985a46189cdc7c7da07854ae/ |
| 10 | Kokos nikita | arditaparrish52 | 299 | male, middle-aged, conversational, social-media | https://fish.audio/m/42254c6d80d548779a9cffe94cfc335c/ |
| 11 | Борундуков 2016 | Микола Строна | 742 | male, young, narration, energetic | https://fish.audio/m/47fa339b9a8b42c6b7b912eeabca1da2/ |
| 12 | Real Koko | benjaminemoni18 | 224 | male, middle-aged, narration, Ukrainian Accent | https://fish.audio/m/7c284efb2c094296a8c5e031ca374651/ |
| 13 | Пятно | Полина | 208 | male/female (оба тега), young, social-media | https://fish.audio/m/f7ea954d341048b1a0035323c5cbfe21/ |
| 14 | Припой | Popghip67890 | 238 | male, old, character-voice, dynamic | https://fish.audio/m/991757dbcbc64e17953f7b28069c3211/ |
| 15 | Молодий жіночий голос | SHOOTER TheHitta | 993 | female, young, conversational, social-media | https://fish.audio/m/8221c35c1b524ff5815fa4b9dc65faf8/ |

Женских голосов в списке два: №6 и №15. У №13 стоят оба тега, male и female.

### Ограничения
- Фильтр работает по словарю. Политика, которого нет в списке шаблонов и у которого нет слова-должности в названии или тегах, фильтр пропустит. Поэтому каждое исключение видно в выводе, а Олег при выборе всё равно смотрит название.
- Фамилии «Данилов» и «Медведев» — частые, по ним возможны ложные исключения. Каждое такое исключение будет видно в выводе с совпавшим шаблоном.

## Дальше (часть Б, после Олега)
Олег создаёт `voice/calibration.json` → `{ "voices": ["<id>", "<id>", "<id>"] }`, затем: `--run`, метрики с позитивным контролем, `out/voice/report.md`, `listen.html`.

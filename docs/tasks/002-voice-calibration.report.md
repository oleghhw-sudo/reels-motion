# Отчёт: 002-voice-calibration
Статус: частично, ждёт выбора голосов (часть А готова, часть Б не начата)
Время: ~20 мин

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

## Дальше (часть Б, после Олега)
Олег создаёт `voice/calibration.json` → `{ "voices": ["<id>", "<id>", "<id>"] }`, затем: `--run`, метрики с позитивным контролем, `out/voice/report.md`, `listen.html`.

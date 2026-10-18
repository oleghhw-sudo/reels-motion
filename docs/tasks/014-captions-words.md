# 014 — Субтитры по словам из `words.json`: стили quiet / clean / trailer / hormozi

Статус: blocked (ждёт 007-Б `words.json` и 004 якоря; схема и стили можно делать на фикстуре) · Ориентир: 60 мин · Полный рендер: НЕ нужен
Правила: reel-presentation «Текст» (субтитры), cinematic-fx §3 D4, living-motion §−1 (режим), readcheck (cps 12 главнее). Источники идей (MIT): `@remotion/captions` (пагинация), Fats403/remotion-captions-kit (правила разрыва), AgriciDaniel/claude-shorts (стили Bold/Bounce/Clean), kajisho5/ffmpeg-skill (высота ≥ 4.5 % кадра). Код не копировать — только числа.

## Что сделать
1. `src/captions/pages.ts` — из `words.json` (`[{text, start, end}]`, формат 007) → `Caption[]` для `createTikTokStyleCaptions` (`@remotion/captions` 4.0.534, MIT; env.manifest → package.json): `combineTokensWithinMilliseconds` по стилю (quiet 1200, trailer 900, hormozi 600), `breakOnSilenceAfterMilliseconds: 400`; дополнительно: разрыв на `.!?…`, страница ≤ 42 символов (укр. ≤ 25 для hormozi), ≥ 2 слов и ≥ 300 мс (иначе слить с соседней), откат к границе клаузы. Чистые функции, тесты: фикстура `src/qa/fixtures/words.fixture.json` (укр. фраза с числом и апострофом) → ожидаемые страницы константами; `--negative`.
2. `src/captions/Captions.tsx` — компонент `<Captions pages style position>`:
   - активное слово = `frame/fps*1000 ∈ [fromMs, toMs)` токена; смена страницы на стартовом кадре первого слова;
   - стили (пресеты, сырые числа в сценах запрещены): **quiet** — шрифт пресета ролика, нижний регистр как в тексте, активное слово цветом акцента/весом, без pop; **clean** (по умолчанию для punch, «динамичный минимализм» 2026, docs/STYLES.md §1 субтитры) — Montserrat Bold 700–800, белый с чёрной обводкой 6 px, 60–75 px, один акцентный цвет на 1–2 слова предложения, pop 1.08 за 120 мс без перелёта, без эмодзи; **trailer** — Oswald/Unbounded caps, вес 600–700, обводка 6 px, активное слово цветом, pop 1.08 за 120 мс без перелёта; **hormozi** — Montserrat Black 900 (есть в `public/fonts`, кириллица проверена), caps, обводка 8 px + тень, активное слово жёлтое/зелёное, pop 1.12→1.0 за 150 мс с одним перелётом 115→95→100 (только этот стиль), по брифу — эмодзи ≤ 3 на ролик (из `scenes.yaml`, не автоматически);
   - высота строки ≥ 4.5 % кадра (≥ 86 px при 1920), позиция по умолчанию 60 % высоты, не ниже safe zone 380 px; `white-space: pre`; весь текст страницы — в `<Readable id text>`;
   - тик/pop-звук на подсветке — не здесь (beat-sync cue по `words.json`, ≤ 1/с).
3. `scripts/wordcheck.mjs` (из задачи 004, если не сделан): каждая смена страницы в [start, end] своего первого слова ±1 кадр; страницы ≥ 300 мс; `--self-test` на смещённой фикстуре.
4. Композиция `CaptionsLab` (6 с, 1080×1920 @60): три стиля на фикстуре, фон `BackgroundLab` рецепт; readcheck зелёный или каждое SHORT объяснено (hormozi-страницы 600 мс × 1–2 слова — ожидаемо на грани cps 12: вывести таблицу и предложить калибровку порога для субтитров отдельно от заголовков).

## Проверки
Тесты (+negative), `wordcheck --self-test`, `tsc`, readcheck CaptionsLab, 3 стилла (по стилю) + лист 0…1.5 с через 0.1 с для hormozi (виден pop и смена страницы на слове).

## Вне рамок
Голос и выравнивание (007), якоря событий на слова (004), эмодзи-автоподбор, перевод.

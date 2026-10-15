# 001 — Компонент CountUp по motion-prompt #007

Статус: done (ревью архитектора 2026-10-16: принято) · Ориентир: 25 мин · Полный рендер видео: НЕ нужен

## Цель
Переиспользуемый компонент счётчика для любого ролика, точный перенос движения #007 Count-up.

## Источник
```sh
MOTION_PROMPT_BASE=vendor/motion-prompt/api/v1 node vendor/motion-prompt/skills/motion-prompt/scripts/motion-prompt.mjs get 007
```
Спецификацию переносить без изменений чисел (тайминги, кривые, амплитуды). Canvas-код НЕ переносить — текст должен быть в DOM.

## Что сделать
1. `src/elements/CountUp.tsx` — React-компонент, всё от `useCurrentFrame()` (t = frame/fps − startSec).
   - Пропсы: `target: number`, `from?: number = 0`, `startSec?: number = 0`, `suffix?: string` (например «%», « грн»),
     `theme` (цвета из пресета ролика: text, accent, bar-градиент), `showChip?: boolean = true`, `showBar?: boolean = true`,
     `fontFamily`, `fontSize` (по умолчанию 104 × масштаб под 1080 — подобрать так, чтобы на 1080×1920 читалось).
   - Число: `round(from + (target − from)·(1 − (1 − p)^4))`, p по окну 0.45–2.9 с спецификации.
   - Формат: украинский — разделитель тысяч неразрывный пробел U+00A0 (`2 480`), `font-variant-numeric: tabular-nums`, выравнивание вправо (без дрожания по ширине).
   - Финиш на 2.9 с: цвет text → accent, масштаб `1 + 0.07·e^(−7t)·cos(15t)`.
   - Чип-стрелка (SVG) и полоса — по спецификации (пружина `1 − e^(−7t)·cos(14t)`, дрожь `6px·(1−p)^3·sin(30u)`, заполнение value/target).
   - Fade-in 0.1–0.4 с; fade-out спецификации НЕ делать по умолчанию (проп `exitAtSec?: number` — если задан, уход по спец. 0.4 с).
   - Число обёрнуто в `<Readable id={…} text={итоговое значение}>`.
   - Первая строка файла: `// Motion Prompt #007 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#007`
   - Если кривые совпадают с `src/motion` — использовать их, не дублировать.
2. Плитка в `src/labs/MotionLab.tsx`: CountUp target=2480 и target=97 suffix «%».
3. Тест `src/elements/countup.test.ts`: значение на 0.45 с = from, на 2.9 с = target, монотонность, формат `2 480` (U+00A0), детерминизм; позитивный контроль (заведомо неверное ожидание падает).

## Проверки (в отчёт — команды и вывод)
- `npm run test:motion` и тест CountUp (+ негативный прогон).
- `npm run still -- MotionLab <кадр>` на 1.0 с, 2.9 с, 3.5 с — приложить пути PNG.
- `node scripts/readcheck.mjs --self-test` — зелёный.

## Вне рамок
Звук счёта, другие элементы каталога, правки BeautyStudioReel.

## Ревью архитектора (2026-10-16)
- Принято. Независимо перепроверено: `test:countup` зелёный, `--negative` exit 1; разделитель — U+00A0; гейты не нарушены (нет Date/random/rAF/CSS-анимаций); строка лицензии #007 на месте.
- Отклонения приняты: обязательный `id`, цвета `track/chip/chipInk` в theme, вынос математики в `countup.ts`, `fontSize` по умолчанию 208.
- Открыто на будущее (не задача): калибровка размера 208 на полном кадре — при первом ролике со счётчиком; перенос `spring` в `src/motion` — когда второй элемент каталога её потребует.

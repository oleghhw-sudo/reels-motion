# 015 — Реестр стилей + StyleLab: стиль как грамматика с числами

Статус: open (после 012; «да» Олега) · Ориентир: 2 сессии по ~90 мин · Полный рендер: НЕ нужен · Зависит: 012-А/Б (look, фактуры, эффекты)
Основание: `docs/STYLES.md` (§0 формат, §1 каталог 2025–2026, §2.3 п. 10). Скиллы: reel-director (бриф → `style`), living-motion, cinematic-fx, reel-presentation.

## Что сделать
1. `src/styles/types.ts` — тип `Style` по формату STYLES.md §0 (id, label, intent, mode, palette (PresetId | новый пресет), type (display/body/mono из `fonts.ts`, размеры в % H), layout (сетка, поля), motion (PACE, кривые `E.*`, пружины `SPR.*`, стаггер, фирменное движение), finish (look-пресет, фактуры, рецепт фона), fx (разрешённые приёмы с дозой), captions (quiet|clean|trailer|hormozi), sound, tells[], slop[], refs[]) + zod-схема; сырые числа вне реестра запрещены (как `E`/`SPR`).
2. Четыре стиля с числами из STYLES.md §1 (каждое число — комментарий «источник/гипотеза»):
   - `swiss-editorial` (№ 16): бумажный нейтраль + чёрный + 1 акцент; Inter/Manrope + JetBrains Mono метки 1.6–2 % H (eyebrow-метки — разрешены этим стилем явно, в обход living-motion §12); 12 колонок, gutter 24–32; сдвиги колонками, `E.smooth` 0.4–0.6 с, без перелёта; look `none`; captions quiet.
   - `pop-impact` (№ 15 + № 7): ROOK — Anton/Oswald, плоский цвет + растр `halftone` + `starburst`, обводки; анатомия удара L/M; look `film`; captions trailer.
   - `grainy-aurora` (№ 3): пресет graphite-lime/ink-coral, рецепт `soft-mesh`/`grain-corner` с зерном 6–12 % на двойках; Unbounded/Onest 3–5 % H, много воздуха; дрейф 0.5–2 %/с, без перелёта; look `none` + зерно; captions quiet.
   - `kinetic-punch` (№ 1 + № 2 как акцент): 1 фон + 1 текст + 1 кислотный акцент; Montserrat Black/Unbounded 800–900, hook-слово 12–18 % H, тело 4–6 %; слова на долях, pop 2–4 кадра на ударном слове, стаггер 40–80 мс, контраст размеров ≥ 3×; удар S на сильных долях, M на дропе; look `pop`; captions clean.
3. `src/labs/StyleLab.tsx` — одна сцена 3 с (крючок 2 слова + hero-цифра + подпись + один удар на 1.5 с) × 4 стиля, 1080×1920 @60, плитки как MotionLabKit; `StyleLabGrid` — 1 кадр, 4 плитки на выбор Олегом (как BackgroundPicker). Текст — укр. («Погляд, який говорить більше.», «24»), `<Readable>`.
4. `scenes.yaml` → поле `style: <id>` (поле + читатель вместе, гейт 3): пресет, рецепт фона, look, captions и PACE берутся из стиля; переопределения — явным блоком `overrides` с комментарием «почему».
5. Проверка «tells»: для каждого стиля — 3 признака из реестра видны на стилле (список в отчёте); «slop»-признаки — в чеклист motion-review.

## Проверки (в отчёт)
`npx tsc --noEmit`; readcheck StyleLab (зелёный или каждое SHORT объяснено); стиллы 4 плиток в середине удара и в конце; `StyleLabGrid` PNG для выбора; grep на запрещённое в `src/styles src/labs/StyleLab.tsx`; позитивный контроль схемы — стиль с сырым bezier вне `tokens.ts` обязан упасть на валидации (линт из долга 011-А, минимальный вариант).

## Вне рамок
Вторая волна стилей (`zine-collage`, `film-analog`, `riso-print`, `pixel-ui`) — после выбора Олега; ассеты вырезок; новые шрифты (Bebas Neue, Poppins, TikTok Sans — отдельной задачей с проверкой глифов ґ є і ї ’).

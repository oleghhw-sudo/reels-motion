# Отчёт: 018-outro-sound-budget
Статус: готово, **без рендера** (СТОП: финальный рендер — после A/B Олега на слух)
Время: ≈ 30 мин · Mac (`MIA_SHORT_DIR`, `SFX_EXTERNAL_DIR` из `.env`)

## Сделано
1. **Старый микс сохранён до правок** — копия без перекодирования, sha совпадает с `assets.manifest.json` финального рендера ep01:
   `out/mia-outro/ab/ep01-sfx-v2.wav` (sha256 `19a33655…720964`) + манифест v2 `out/mia-outro/ab/assets.manifest.v2.json`.
2. **Схема `src/videos/mia-outro/model.ts`:**
   - `sfx.whip.on?: string[]` — ссылки «src:from» (формат проверяется регуляркой `^V\d+:\d+$`); `sfx.riser.heroes?: string[]`; `sfx.card` — необязательный.
   - Новая `sfxPlan(outro, episode)` → `{ whip: индексы пунктов timeline, riser: герои, errors }`. Нет `on` / `heroes` — все склейки `in: whip` / все карточки, как в v2.
   - Ошибки: ссылка `whip.on` совпала не ровно с одним пунктом `in: whip` (с перечнем существующих), повтор ссылки, герой `riser.heroes` не среди карточек серии (с перечнем; подсказка «ключи names, не имена в кадре»).
   - `parseOutro` вызывает `sfxPlan` для всех серий: битая ссылка роняет любой разбор — prepare, композицию, `check-zones`, `stills`.
3. **Читатель `videos/mia-outro/prepare-assets.mjs` → 2.1.0:**
   - свист — только на склейках из плана; нарастание — только перед героями из плана; щелчок — только если `card` задан;
   - файл из `pick` назначается по порядковому номеру склейки / карточки среди **всех** (как в v2). Поэтому оставшиеся звуки — те же файлы, что стояли на этих местах в v2, и A/B отличается только убранными слоями;
   - разбор `outro.yaml` перенесён в `try … die()` **до** `rmSync(assets)`: ошибка в yaml больше не стирает готовые ассеты;
   - в `mixes[ep]` пишется `cues` (лист звука) и `plan: {whip, riser, card}`.
4. **`outro.yaml` `episodes.ep01.sfx`** — строки 55–63 заменены дословно на блок архитектора (`git diff` — только эти строки, 6+/6−).
5. **`mia:prepare`** → новый микс: 14 SFX вместо 24; копия `out/mia-outro/ab/ep01-sfx-v3.wav` (sha256 `da645d14…decf90`) + `out/mia-outro/ab/assets.manifest.v3.json`.
6. Позитивный контроль — ниже. 7. Лист звука и громкость — ниже. 8. **Рендер не делался**; `out/mia-outro/final/*-ep01.mp4` (v2) не тронуты.

## Файлы
- **Изменённые:** `src/videos/mia-outro/model.ts`, `videos/mia-outro/prepare-assets.mjs`, `videos/mia-outro/outro.yaml` (только шаг 4), `videos/mia-outro/assets.manifest.json` (перегенерирован prepare), этот отчёт.
- **Вне git (`out/`):** `out/mia-outro/ab/ep01-sfx-v2.wav`, `out/mia-outro/ab/ep01-sfx-v3.wav`, манифесты v2/v3 рядом; `out/mia-outro/license-report.md` перегенерирован (10 внешних звуков ⚠ unknown вместо 13; щелчок CC0 ушёл из микса). `out/mia-outro/final/license-report.md` остался от v2 — он описывает v2-ролики.

## Проверки (команда → результат)
**План до и после правки yaml** (`sfxPlan(outro, 'ep01')`):
```
v2-yaml (без on/heroes): {"whip":[1,2,4,5,7,9,11],"riser":["MIA","DARK","BLOND","OFFICER"],"card":"remotion__shutter-modern","errors":[]}   = поведение v2
v3-yaml:                 {"whip":[2,5,11],"riser":["DARK","OFFICER"],"card":null,"errors":[]}
```

**Позитивный контроль (гейт 4)** — временно `whip.on: ["V3:999"]`:
```
node --env-file=.env --experimental-strip-types --no-warnings videos/mia-outro/prepare-assets.mjs
ОТКАЗ prepare-assets (mia-outro): outro.yaml: ссылки звука не сходятся с timeline (1):
  ✗ ep01.sfx.whip.on[0] «V3:999»: нет пункта с in: whip — ссылка должна указывать ровно на один пункт timeline с in: whip (есть: V1:180, V3:228, V10:97, V10:150, V9:157, V12:1, V12:317)
prepare exit=1
файлов в assets до: 7 · после: 7 · mix.ep01.wav sha256 da645d14… (v3) — не стёрт
```
Блок возвращён из копии; `cmp` с версией шага 4 — побайтно равен, `git diff --stat videos/mia-outro/outro.yaml` → `6 insertions(+), 6 deletions(-)` (только шаг 4).

Второй контроль, в памяти без prepare: `riser.heroes: [ROOK, OFFICER]`, `whip.on: [V10:150, V10:150]` → `parseOutro` exit 1:
```
  ✗ ep01.sfx.whip.on[1] «V10:150»: повтор ссылки
  ✗ ep01.sfx.riser.heroes[0] «ROOK»: такого героя нет среди карточек серии (есть: MIA, DARK, BLOND, OFFICER; ключи names, не имена в кадре)
```

**Регрессия:** `npx tsc --noEmit` → exit 0; `npm run test:motion` → OK: 3 файлов; `check-zones.mjs` → «OK: ни один кадр не задевает запретные зоны». Композиция sfx не читает, картинка не менялась.

**prepare v3:**
```
✓ микс ep01: музыка 42.379–60.72 с + тишина 1.25 с + 14 SFX; до нормализации I -14.87 / TP 0.15 → I -14 LUFS / TP -1.5 dBTP (dynamic)
OK: 84 файлов → videos/mia-outro/assets   (v2: 87 — не копируются неиспользуемые shutter, epic3-03, epic3-08)
```

## Громкость (ffmpeg ebur128=peak=true по готовым WAV)
| Микс | Файл | SFX | До нормализации I / TP | I | LRA | True peak | Длительность |
|---|---|---|---|---|---|---|---|
| v2 | `out/mia-outro/ab/ep01-sfx-v2.wav` | 24 | −14.53 LUFS / +0.15 dBTP | **−14.0 LUFS** | 2.1 LU | **−1.5 dBTP** | 19.591 с |
| v3 | `out/mia-outro/ab/ep01-sfx-v3.wav` | 14 | −14.87 LUFS / +0.15 dBTP | **−14.0 LUFS** | 1.8 LU | **−1.5 dBTP** | 19.591 с |

Оба микса в режиме loudnorm `dynamic`: пик премикса +0.15 dBTP всё ещё выше цели и в v3 — его дают удары `boom` под музыкой, а не убранные слои. `gainVsMusic` не трогал.

## Лист звука (пик в ролике, с; «звучит» — от старта до конца файла / обрезки)
### v2 — 24 SFX
| пик, с | роль | звук | звучит, с |
|---|---|---|---|
| 0.917 | whip→1 (V1) | need-02 | 0.00–1.47 |
| 1.834 | whip→2 (V3) | hook-03 | 0.69–2.28 |
| 2.752 | card MIA | remotion__shutter-modern | 2.65–3.00 |
| 2.752 | impact MIA | epic3-04 | 2.09–4.86 |
| 2.752 | riser MIA | epic4-04 | 0.97–2.75 |
| 2.877 | slam MIA (имя +3 к) | need-10 | 2.64–4.13 |
| 4.128 | whip→4 (V10 взгляд) | epic3-03 | 3.53–4.57 |
| 4.597 | whip→5 (V10 пистолет) | need-02 | 3.56–5.15 |
| 6.432 | card DARK | remotion__shutter-modern | 6.33–6.68 |
| 6.432 | impact DARK | epic3-05 | 5.84–8.16 |
| 6.432 | riser DARK | epic4-06 | 4.18–6.43 |
| 6.557 | slam DARK | need-06 | 6.32–7.42 |
| 7.808 | whip→7 (V9) | hook-03 | 6.67–8.26 |
| 8.277 | card BLOND | remotion__shutter-modern | 8.18–8.52 |
| 8.277 | impact BLOND | epic4-03 | 7.60–10.26 |
| 8.277 | riser BLOND | epic3-08 | 5.00–8.28 |
| 8.402 | slam BLOND | need-10 | 8.16–9.65 |
| 9.653 | whip→9 (V12 профиль) | epic3-03 | 9.05–10.09 |
| 10.112 | card OFFICER | remotion__shutter-modern | 10.01–10.36 |
| 10.112 | impact OFFICER | epic3-04 | 9.45–12.22 |
| 10.112 | riser OFFICER | epic4-04 | 8.33–10.11 |
| 10.237 | slam OFFICER | need-06 | 10.00–11.10 |
| 11.946 | whip→11 (V12 заряд) | need-02 | 10.91–12.50 |
| 15.616 | final (взрыв) | epic4-08 | 15.24–20.83 |

### v3 — 14 SFX
| пик, с | роль | звук | звучит, с |
|---|---|---|---|
| 1.834 | whip→2 (V3 переворот) | hook-03 | 0.69–2.28 |
| 2.752 | impact MIA | epic3-04 | 2.09–4.86 |
| 2.877 | slam MIA (имя +3 к) | need-10 | 2.64–4.13 |
| 4.597 | whip→5 (V10 наводка) | need-02 | 3.56–5.15 |
| 6.432 | impact DARK | epic3-05 | 5.84–8.16 |
| 6.432 | riser DARK | epic4-06 | 4.18–6.43 |
| 6.557 | slam DARK | need-06 | 6.32–7.42 |
| 8.277 | impact BLOND | epic4-03 | 7.60–10.26 |
| 8.402 | slam BLOND | need-10 | 8.16–9.65 |
| 10.112 | impact OFFICER | epic3-04 | 9.45–12.22 |
| 10.112 | riser OFFICER | epic4-04 | 8.33–10.11 |
| 10.237 | slam OFFICER | need-06 | 10.00–11.10 |
| 11.946 | whip→11 (V12 заряд) | need-02 | 10.91–12.50 |
| 15.616 | final (взрыв) | epic4-08 | 15.24–20.83 |

### Сводка (посчитано по `cues` манифестов)
| Метрика | v2 | v3 |
|---|---|---|
| SFX всего | 24 | 14 |
| Окно 0–6.5 с: SFX, которые звучат в окне (старт < 6.5 с) | 13 | **7** |
| Окно 0–6.5 с: пиков в окне | 11 | 6 |
| Слоёв с пиком в [h, h+0.15 с] — h1 · h2 · h3 · h4 · h5 · h6 · h7 · h8 · h9 | 1 · 4 · 1 · 4 · 4 · 4 · 1 · 0 · 1 | 0 · 2 · 1 · 3 · 2 · 3 · 1 · 0 · 1 |
| Макс. одновременно звучащих SFX | 6 (10.01 с) | 4 (9.46 с) |
| Первый SFX стартует | 0.00 с (свист V1) | 0.69 с (свист V3) |

- **Окно 0–6.5 с: 7** — совпадает с расчётом архитектора: свист 1.83; удар и слэм MIA 2.75/2.88; свист 4.60; riser к ROOK; удар и слэм ROOK 6.43/6.56. В v2 фактически **13**, а не 12: в окно попадает ещё начало riser JAX (старт 5.00 с, пик 8.28 с).
- **h4 (ROOK) и h6 (HALE) — 3 слоя по пику**: riser кончается ровно на ударе, плюс удар и слэм через 3 кадра. Если riser считать подводом, а не слоем удара, на ударе 2 слоя. Это задано блоком архитектора, менять не стал.
- **«Начало — одна музыка»** — до 0.69 с. Свист V3 (`hook-03`) начинается за 1.14 с до своего пика 1.83 с: у файла длинный разгон.
- **Максимум одновременно — 4 звука в 9.46 с**: хвосты удара и слэма JAX (`epic4-03` звучит 2.7 с), riser HALE и старт удара HALE. Длинные хвосты `boom` перекрывают следующий подвод.

## Отклонения от задачи и почему
- **Разбор yaml в prepare обёрнут в `try … die()`**. В задаче этого не было. Разбор и раньше стоял до `rmSync(assets)`, но ошибка выходила необработанным исключением со стеком. Теперь отказ — текстом в формате остальных отказов prepare, и видно, что ассеты остаются целы (показано выше).
- **Проверка ссылок — в `parseOutro`**, а не только в prepare: битая ссылка роняет и композицию, и `check-zones`. Так ошибка видна в любом месте, где читается `outro.yaml`.
- **Повтор ссылки** (`whip.on` или `riser.heroes`) — тоже ошибка. Задача этого не требовала, но иначе дубликат молча удвоил бы звук.
- **Файлы из `pick`** назначены по номеру склейки / карточки среди всех (как в v2), а не по порядку внутри `on`. Так на оставшихся местах звучат те же файлы, что в v2, и `pick` не тронут (в v3 `epic3-03` и `epic3-08` просто не используются).
- В `mixes[ep]` добавлено поле `plan` рядом с `cues` — чтобы по манифесту было видно, по какому плану собран микс.

## Предложения (вне рамок, не сделано)
- После A/B на слух: если «качает» — проверить хвосты `boom` (2.3–2.7 с) и подрезать их до следующего riser, а не трогать `gainVsMusic`.
- Если «начало — одна музыка» нужно строже — свист V3 с коротким разгоном (у `hook-03` 1.14 с до пика).
- `out/mia-outro/final/license-report.md` при следующем финальном рендере заменить новым (v3 без щелчка, 10 внешних звуков).

## Рендер v3 (2026-10-19, Mac; Олег: «v3 лучше, рендер»)
Тем же способом, что финальный рендер ep01 (отчёт 008 «Финальный рендер»). Код и картинка — HEAD `d925c95`; звук — `videos/mia-outro/assets/mix.ep01.wav` = `out/mia-outro/ab/ep01-sfx-v3.wav` (sha256 `da645d14…decf90`, prepare 2.1.0, 14 SFX). Старые `out/mia-outro/final/*-ep01.mp4` (v2) не тронуты.

**Перед рендером:**
```
npm run check -- --scope mia-outro                                         → OK: среда готова (MIA_SHORT_DIR, SFX_EXTERNAL_DIR на месте)
node --env-file=.env --experimental-strip-types --no-warnings videos/mia-outro/check-zones.mjs
  OK: ни один кадр не задевает запретные зоны                               → exit 0
node scripts/readcheck.mjs MiaOutro         --props '{"episode":"ep01"}'   → 15 текстов, нарушений 3 {"SHORT":3}, exit 1
node scripts/readcheck.mjs MiaOutroVertical --props '{"episode":"ep01"}'   → 15 текстов, нарушений 3 {"SHORT":3}, exit 1
  SHORT MIA.tagline «THE INVENTOR» 1.00/1.42 · DARK.tagline «THE HUNTER» 1.00/1.25 · BLOND.tagline «FRIEND OR ENEMY?» 1.00/1.67 с
```
Те же 3 SHORT подписей, что при рендере v2, — калиброванное исключение (решение Олега «Динамика v2»). Остальные 12 текстов OK, в т. ч. final.line 3.67 из 3.42 с.

**Рендер** (оба параллельно, ≈ 1.5 мин, exit 0, Encoded 470/470):
```
npx remotion render src/index.ts MiaOutro         out/mia-outro/final/MiaOutro-ep01-v3.mp4         --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=320K --props='{"episode":"ep01"}'
npx remotion render src/index.ts MiaOutroVertical out/mia-outro/final/MiaOutroVertical-ep01-v3.mp4 --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=320K --props='{"episode":"ep01"}'
```

**Готовые файлы** (ffprobe; `ffmpeg -af ebur128=peak=true`):
| Файл | Размер | Видео | Кадры | Аудио | I | LRA | True peak |
|---|---|---|---|---|---|---|---|
| `out/mia-outro/final/MiaOutro-ep01-v3.mp4` | 18 156 833 B | h264 High, 1920×1080, 24/1, ~7.09 Mb/s | 470, 19.584 с | AAC-LC 48 kHz, 317 kb/s | **−14.0 LUFS** | 1.8 LU | **−1.4 dBTP** |
| `out/mia-outro/final/MiaOutroVertical-ep01-v3.mp4` | 15 983 964 B | h264 High, 1080×1920, 24/1, ~6.21 Mb/s | 470, 19.584 с | AAC-LC 48 kHz, 317 kb/s | **−14.0 LUFS** | 1.8 LU | **−1.4 dBTP** |

Цели −14 LUFS ±1 и true peak ≤ −1 dBTP выполнены. LRA 1.8 против 2.1 у v2 — меньше слоёв SFX.

**Лицензии:** `out/mia-outro/final/license-report-v3.md` — копия `out/mia-outro/license-report.md` от prepare 2.1.0. В нём 10 внешних SFX с ⚠ licenseWarning (лицензия unknown, перед Instagram заменить на CC0), музыка Suno с ⚠ «тариф не подтверждён», щелчка затвора нет. `license-report.md` рядом описывает v2-ролики.

**Не проверялось:** на слух готовые mp4 (A/B слушал Олег по WAV); стиллы не снимались — картинка та же, что у v2 (код не менялся с 012-А, регрессия 012-А — 0 px).

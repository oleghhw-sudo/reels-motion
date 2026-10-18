# 017 — Каталог эффектов G–M (бывш. 012-В)

Статус: **по требованию брифа** — не делается целиком; приём из каталога берётся в работу, только когда его требует бриф конкретного ролика (доза cinematic-fx §1: большинство приёмов — ≤ 1 на ролик). Вынесено из 012 по ревью `012-fx-kit.review.md` §2 п. 5 (решение Олега 2026-10-19). · Зависит: 012-А/Б (`src/fx`, FxLab, пакеты Remotion 4.0.534).
Правила: `.claude/skills/cinematic-fx/SKILL.md` §3 G–M, §4.

## Каталог (исходный текст 012-В)
1. **Нативные замены prep-слоёв ROOK**: `starburst({rays, colors, rotation: градусы, smoothness})` (лучи; генератор — на `<Solid>` под фигурой), `halftone`/`halftoneLinearGradient` (растр), `outline({width, edgeSimplification})` + `dropShadow` (обводка/тень вырезки) — сравнить стиллом с prep-версией; если тонкие пряди хуже — оставить prep, записать.
2. **Переходы-эффекты** как презентации/оверлеи: `tear`, `evolve`, `venetianBlinds`, `pixelDissolve`, `pixelate` 40→1 (ввод), `barrelDistortion` импульс 0→0.25→0 (6 кадров), `wave` «жидкий» 0→30→0 (8 кадров) — каждый с номером motion-prompt, если есть (#017/#018/#019/#045).
3. **Свет**: god rays (копия → `levels` порог → `zoomBlur` → screen), bloom по порогу (`glow threshold 0.75`), `shine` (#022), rack focus (`regionBlur`), tilt-shift (`linearProgressiveBlur`).
4. **Цвет**: `LOOK` на `colorCorrection`/`levels`/`vibrance`/`whiteBalance`/`linearGradientTint`; `lut` — один .cube (teal-orange) в `public/luts` через env.manifest; луки bleach/cross/day-for-night/faded как пресеты; «вспышка экспозицией» (`exposure` 3→0).
5. **Плёночные луки**: `LOOK.projector`, `vhs`, `crt`, `mm8`, `oldPhoto`, `riso` по §3 M (gate weave и flicker — по `rand` на двойках).
6. **Композитинг**: text-matte (видео в буквах), double exposure, split screen, perspective flip (#021), PiP с тенью, `colorKey` для генераций на зелёном (лист краёв).
7. **Время**: `<Trail>` эхо, строб/заикание/flicker cut по сетке восьмых (energycheck FLASH_RATE обязан ловить превышение > 3/с — позитивный контроль), реверс — prep в манифест.
8. **Аудиореактивность**: prep `loudness.json` (ffmpeg `astats` по кадрам, полоса 40–120 Гц) + `audioScale(frame)`; тест на синтетическом WAV с ударом на 1.0 с (пик rms в кадре 24 ±1 при 24 fps); позитивный контроль — сдвинутый файл.
9. FxLab: плитки на каждую группу G–M; стиллы; лист перехода (−4…+8).

## Правила для каждого взятого приёма
- Новый пакет/файл (LUT, prep) — сначала `env.manifest.json` (гейт 2), лицензия — в THIRD-PARTY.
- Плитка FxLab + стилл + позитивный контроль проверки (гейт 4); детерминизм и `grep` на запрещённое — как в 012.

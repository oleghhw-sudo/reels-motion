#!/usr/bin/env node
// Задача 019 — пилот CapCut. Генерирует спецификацию для `capcut compile --into` (capcut-cli 0.31.1).
// Пути к медиа — только из CAPCUT_MEDIA_DIR (env.manifest.json, гейт 2: дефолтов нет).
// Запуск: CAPCUT_MEDIA_DIR=… node pilot/capcut/make-spec.mjs > out/capcut-pilot/pilot-spec.json
//
// Времена — секунды (единица спецификации compile). Источник: videos/mia-outro/outro.yaml (ep01):
//   music.hits h1 = 0.917, h2 = 2.752 (стыки клипов), начало = 0; исходники 24 fps.
//   V1 180–201, V3 228–260, V10 150–193 — кадры исходника → sourceStart = кадр/24.
// Длительности клипов задают доли (стыки на h1/h2), скорость 1.0: capcut-cli не умеет speed ramp
// (docs/CAPCUT-analysis.md §3), а keyframe на клипе с изменённой скоростью — предупреждение lint 0.31.
// Поэтому out-кадр V1 = 202 (не 201), V3 = 272 (не 260); V10 — ровно 150–193. См. отчёт, «Отклонения».

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const media = process.env.CAPCUT_MEDIA_DIR;
if (!media) {
  console.error('CAPCUT_MEDIA_DIR не задан (env.manifest.json → data_dirs). Пример: ~/Movies/reels-pilot-media');
  process.exit(1);
}
const FPS_SRC = 24;
const H1 = 0.917;
const H2 = 2.752;
const V10_FRAMES = 193 - 150; // 43 кадра = 1.791667 с
const r6 = (x) => Math.round(x * 1e6) / 1e6; // микросекунды — единица CapCut; убираем шум float
const clip3Dur = r6(V10_FRAMES / FPS_SRC);
const total = r6(H2 + clip3Dur);

const files = {
  v1: 'V1.mp4',
  v3: 'V3.mp4',
  v10: 'V10.mp4',
  music: 'D_preroll_9hits_42.379-60.720.wav',
};
for (const f of Object.values(files)) {
  if (!existsSync(join(media, f))) {
    console.error(`нет файла ${join(media, f)} — скопируй медиа в CAPCUT_MEDIA_DIR (задача 019, шаг 4)`);
    process.exit(1);
  }
}

const spec = {
  // name игнорируется при --into (проект сохраняет имя Pilot); fps/canvas не задаём — остаются как в приложении.
  tracks: [
    {
      type: 'video',
      items: [
        { ref: 'clip1', path: join(media, files.v1), start: 0, duration: H1, sourceStart: 180 / FPS_SRC },
        { ref: 'clip2', path: join(media, files.v3), start: H1, duration: r6(H2 - H1), sourceStart: 228 / FPS_SRC },
        { ref: 'clip3', path: join(media, files.v10), start: H2, duration: clip3Dur, sourceStart: 150 / FPS_SRC },
      ],
    },
    {
      type: 'audio',
      items: [
        // Лицензия: Suno (outro.yaml music.license) — предупреждение по гейту 6, см. отчёт.
        { ref: 'music', path: join(media, files.music), start: 0, duration: total, sourceStart: 0 },
      ],
    },
  ],
  operations: [
    // 1 переход на стыке клипов 2→3 (переход привязывается к сегменту ПЕРЕД склейкой).
    // Отклонение: в проектах и кэше Олега переходов нет — взят базовый встроенный dissolve (см. отчёт).
    { op: 'transition', target: 'clip2', slug: 'dissolve' },
    // 1 keyframe-зум на клипе 2: scale 1.00 → 1.12 от начала до конца клипа (time — от начала сегмента).
    { op: 'keyframe', target: 'clip2', property: 'scale', time: 0, value: 1.0 },
    { op: 'keyframe', target: 'clip2', property: 'scale', time: r6(H2 - H1), value: 1.12 },
    // музыка на всю длину, fade-out 0.3 с в конце
    { op: 'audio-fade', target: 'music', fadeOut: 0.3 },
  ],
};

process.stdout.write(JSON.stringify(spec, null, 2) + '\n');

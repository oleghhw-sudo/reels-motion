// Фикстуры лаборатории FxLab24 — единственный источник путей для лаборатории и генератора (scripts/fxlab.mjs fixtures).
// Файлы — производные (ffmpeg testsrc2 + ImageMagick шум с seed, детерминированно), лежат в public/fixtures (не в git);
// нет файла → <Img>/<OffthreadVideo> падают с ошибкой загрузки — лаборатория не подменяет данные.
export const FX_FIXTURES = {
  dir: 'fixtures',
  /** Синтетическое видео для ramp: testsrc2, 540×384, 24 fps, 2 с. */
  video: { file: 'fixtures/fx-ramp.mp4', w: 540, h: 384, fps: 24, frames: 48 },
  /** Тайлы зерна 512×512 (как в videos/mia-outro/prepare-assets.mjs, seed 1000+k). */
  grain: ['fixtures/grain-0.png', 'fixtures/grain-1.png', 'fixtures/grain-2.png', 'fixtures/grain-3.png'],
  grainSize: 512,
} as const;

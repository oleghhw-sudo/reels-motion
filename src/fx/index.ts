// src/fx — набор приёмов cinematic-fx (задача 012-А), вынесен из финала аутро MIA ep01 (2f3856c).
// Пресеты — presets.ts; чистые функции — core.ts (без remotion), hit.ts, text.ts; компоненты — components.tsx.
// Лаборатория — lab/FxLab24.tsx (композиция FxLab24); тесты — fx.test.ts (npm run test:motion).
export { RAMP, decayAt, frameOf, remapSpeed, sampleProfile, tauFromPerFrame, whipSmear, type Cuts, type Smear, type WhipPreset, type WhipProfile } from './core.ts';
export { BLAST, F24, HIT, LEAD, LOOK, RECOIL, SLAM, STAMP, TAG, WHIP, type HitPreset, type LeadPreset, type LookPreset, type Shake, type SlamPreset, type StampPreset, type TagPreset } from './presets.ts';
export { hitEnvelope, leadFlash, leadIn, shakeAt, type HitEnv, type HitPhase, type Lead } from './hit.ts';
export { slam, stamp, tagReveal, type SlamState } from './text.ts';
export { Filters, Grain, HitLayer, LeadFlash, LeadIn, Look, Rays, Slam, Stamp, TagPlate, Vignette, WhipCut, White, filterCss, lookFilter, useHit } from './components.tsx';

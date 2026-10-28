// src/fx/talking — эффекты говорящей головы (cinematic-fx §3 O, задача 026-А): каркас окна, план, чистые функции, компоненты.
export { BACK, backEnv, travel, windowOf, type Window, type WindowState } from './window.ts';
export { FX_WINDOW, checkFace, faceRect, intersects, parsePlan, planSchema, type Effect, type Plan, type Rect } from './plan.ts';
export { BIGNUM, FIGMA, LENS, bignum, boxOf, figma, figmaBox, lens, lensBox } from './effects.ts';
export { BigNum, FigmaSelect, Lens, SourceVideo } from './TalkingFx.tsx';

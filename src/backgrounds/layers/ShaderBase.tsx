// ShaderBase — обёртка над Paper Shaders, детерминированная от кадра (гейт 1).
//
// Почему не React-компоненты <MeshGradient/> из @paper-design/shaders-react:
// они инициализируют WebGL асинхронно (await processUniforms, ResizeObserver) и вне delayRender —
// Remotion может снять кадр до первой отрисовки (пустой/чёрный шейдер). Здесь используем тот же
// vanilla ShaderMount и те же fragment-шейдеры той же точной версии, но:
//   • speed = 0 всегда (rAF внутри Paper не запускается);
//   • время = frame / fps * 1000 * tempo (+ offset), выставляется синхронно в useLayoutEffect;
//   • delayRender держит рендер, пока канвас не получил реальный размер и не нарисован первый кадр;
//   • если WebGL недоступен — фоллбек на CSS-градиенты (тоже функция кадра) и data-атрибут-флаг.

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  ShaderMount,
  ShaderFitOptions,
  GrainGradientShapes,
  getShaderNoiseTexture,
  meshGradientFragmentShader,
  grainGradientFragmentShader,
  simplexNoiseFragmentShader,
  neuroNoiseFragmentShader,
  smokeRingFragmentShader,
  staticMeshGradientFragmentShader,
} from '@paper-design/shaders';
import { toShaderRgba } from '../../theme/color.ts';
import type { ShaderKind, ShaderLayerSpec } from '../types.ts';
import { ShaderFallback } from './ShaderFallback.tsx';

type Uniforms = Record<string, number | boolean | number[] | number[][] | HTMLImageElement>;

const FRAGMENT: Record<ShaderKind, string> = {
  mesh: meshGradientFragmentShader,
  grain: grainGradientFragmentShader,
  simplex: simplexNoiseFragmentShader,
  neuro: neuroNoiseFragmentShader,
  smokeRing: smokeRingFragmentShader,
  staticMesh: staticMeshGradientFragmentShader,
};

const NEEDS_NOISE_TEXTURE: Record<ShaderKind, boolean> = {
  mesh: false,
  grain: true,
  simplex: false,
  neuro: false,
  smokeRing: true,
  staticMesh: false,
};

// Сайзинг как в дефолтных пресетах Paper: object — для «объектных» шейдеров, pattern — для паттернов.
const OBJECT_SIZING = { fit: 'contain', scale: 1, rotation: 0, offsetX: 0, offsetY: 0, originX: 0.5, originY: 0.5, worldWidth: 0, worldHeight: 0 };
const PATTERN_SIZING = { ...OBJECT_SIZING, fit: 'none' };

function num(p: Record<string, unknown>, k: string, d: number): number {
  const v = p[k];
  return typeof v === 'number' ? v : d;
}

function buildUniforms(spec: ShaderLayerSpec<string>, noise: HTMLImageElement | null): Uniforms {
  const p = spec.params ?? {};
  const isPattern = spec.shader === 'neuro' || spec.shader === 'simplex';
  const base = isPattern ? PATTERN_SIZING : OBJECT_SIZING;
  const fit = (typeof p.fit === 'string' ? p.fit : spec.shader === 'smokeRing' ? 'contain' : isPattern ? 'none' : 'cover') as keyof typeof ShaderFitOptions;
  const sizing: Uniforms = {
    u_fit: ShaderFitOptions[fit],
    u_scale: num(p, 'scale', base.scale),
    u_rotation: num(p, 'rotation', base.rotation),
    u_offsetX: num(p, 'offsetX', 0),
    u_offsetY: num(p, 'offsetY', 0),
    u_originX: 0.5,
    u_originY: 0.5,
    u_worldWidth: 0,
    u_worldHeight: 0,
  };
  const cols = spec.colors.map((c) => toShaderRgba(c));
  const back = toShaderRgba(spec.colorBack ?? spec.colors[0]);
  switch (spec.shader) {
    case 'mesh':
      return {
        ...sizing,
        u_colors: cols,
        u_colorsCount: cols.length,
        u_distortion: num(p, 'distortion', 0.8),
        u_swirl: num(p, 'swirl', 0.1),
        u_grainMixer: num(p, 'grainMixer', 0),
        u_grainOverlay: num(p, 'grainOverlay', 0),
      };
    case 'staticMesh':
      return {
        ...sizing,
        u_colors: cols,
        u_colorsCount: cols.length,
        u_positions: num(p, 'positions', 2),
        u_waveX: num(p, 'waveX', 1),
        u_waveXShift: num(p, 'waveXShift', 0.6),
        u_waveY: num(p, 'waveY', 1),
        u_waveYShift: num(p, 'waveYShift', 0.21),
        u_mixing: num(p, 'mixing', 0.93),
        u_grainMixer: num(p, 'grainMixer', 0),
        u_grainOverlay: num(p, 'grainOverlay', 0),
      };
    case 'grain':
      return {
        ...sizing,
        u_colorBack: back,
        u_colors: cols,
        u_colorsCount: cols.length,
        u_softness: num(p, 'softness', 0.5),
        u_intensity: num(p, 'intensity', 0.5),
        u_noise: num(p, 'noise', 0.25),
        u_shape: GrainGradientShapes[(typeof p.shape === 'string' ? p.shape : 'corners') as keyof typeof GrainGradientShapes],
        u_noiseTexture: noise as HTMLImageElement,
      };
    case 'smokeRing':
      return {
        ...sizing,
        u_colorBack: back,
        u_colors: cols,
        u_colorsCount: cols.length,
        u_noiseScale: num(p, 'noiseScale', 3),
        u_thickness: num(p, 'thickness', 0.65),
        u_radius: num(p, 'radius', 0.25),
        u_innerShape: num(p, 'innerShape', 0.7),
        u_noiseIterations: num(p, 'noiseIterations', 8),
        u_noiseTexture: noise as HTMLImageElement,
      };
    case 'neuro':
      return {
        ...sizing,
        u_colorBack: toShaderRgba(spec.colors[0]),
        u_colorMid: toShaderRgba(spec.colors[1]),
        u_colorFront: toShaderRgba(spec.colors[2]),
        u_brightness: num(p, 'brightness', 0.05),
        u_contrast: num(p, 'contrast', 0.3),
      };
    case 'simplex':
      return {
        ...sizing,
        u_colors: cols,
        u_colorsCount: cols.length,
        u_stepsPerColor: num(p, 'stepsPerColor', 2),
        u_softness: num(p, 'softness', 0),
      };
  }
}

// Текстура шума Paper — data-URI, грузим один раз на страницу и держим delayRender до decode().
let noisePromise: Promise<HTMLImageElement> | null = null;
function loadNoiseTexture(): Promise<HTMLImageElement> {
  if (!noisePromise) {
    const img = getShaderNoiseTexture() as HTMLImageElement;
    noisePromise = img.decode().then(() => img);
  }
  return noisePromise;
}

/** Время шейдера в мс — единственная точка, где кадр превращается во время (гейт 1). */
export function shaderTimeMs(frame: number, fps: number, tempo: number, offsetMs = 0): number {
  return (frame / fps) * 1000 * tempo + offsetMs;
}

export const ShaderBase: React.FC<{ spec: ShaderLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShaderMount | null>(null);
  const [noise, setNoise] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [sized, setSized] = useState(false);
  const needsNoise = NEEDS_NOISE_TEXTURE[spec.shader];
  const timeMs = shaderTimeMs(frame, fps, spec.tempo, spec.timeOffsetMs);

  // 1. Текстура шума (если нужна)
  const [noiseHandle] = useState(() => (needsNoise ? delayRender(`noise texture ${spec.shader}`) : null));
  useLayoutEffect(() => {
    if (!needsNoise || noiseHandle === null) return;
    loadNoiseTexture()
      .then((img) => setNoise(img))
      .catch((e) => setFailed(`noise texture: ${String(e)}`))
      .finally(() => continueRender(noiseHandle));
  }, [needsNoise, noiseHandle]);

  // 2. Монтирование WebGL — держим delayRender, пока ResizeObserver не отдал размер и кадр не нарисован
  const [mountHandle] = useState(() => delayRender(`shader mount ${spec.shader}`, { timeoutInMilliseconds: 60000 }));
  const fragment = FRAGMENT[spec.shader];
  const uniforms = useMemo(
    () => (needsNoise && !noise ? null : buildUniforms(spec, noise)),
    // spec — данные рецепта; сериализуем для стабильного сравнения
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(spec), noise, needsNoise],
  );

  useLayoutEffect(() => {
    if (failed) {
      continueRender(mountHandle);
      return;
    }
    if (!uniforms || !ref.current || mountRef.current) return;
    const el = ref.current;
    let ro: ResizeObserver | null = null;
    try {
      mountRef.current = new ShaderMount(
        el,
        fragment,
        uniforms,
        { preserveDrawingBuffer: true, premultipliedAlpha: true, antialias: false },
        0, // speed = 0: никакого rAF
        timeMs,
        1, // minPixelRatio: рендерим ровно в пикселях композиции
        1080 * 1920,
      );
    } catch (e) {
      setFailed(String(e));
      continueRender(mountHandle);
      return;
    }
    // Наш ResizeObserver зарегистрирован после внутреннего — его колбэк идёт следом,
    // когда канвас уже получил размер. Тогда рисуем текущий кадр и отпускаем рендер.
    ro = new ResizeObserver(() => {
      const m = mountRef.current;
      if (!m) return;
      if (m.canvasElement.width > 0 && m.canvasElement.height > 0) {
        setSized(true);
        continueRender(mountHandle);
        ro?.disconnect();
      }
    });
    ro.observe(el);
    return () => {
      ro?.disconnect();
      mountRef.current?.dispose();
      mountRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniforms === null, fragment, failed]);

  // 3. Каждый кадр: синхронно обновить униформы и время → синхронный draw
  useLayoutEffect(() => {
    const m = mountRef.current;
    if (!m || !uniforms) return;
    m.setUniforms(uniforms);
    m.setFrame(timeMs);
  }, [timeMs, uniforms, sized]);

  if (failed) {
    return <ShaderFallback spec={spec} reason={failed} />;
  }
  return (
    <div
      ref={ref}
      data-shader={spec.shader}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
};

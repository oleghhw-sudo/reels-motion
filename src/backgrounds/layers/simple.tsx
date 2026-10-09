// Простые слои: Solid, Gradient, Vignette, LightSweep, Glow. Всё — функция кадра (гейт 1).
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { withAlpha } from '../../theme/color.ts';
import type {
  GlowLayerSpec,
  GradientLayerSpec,
  SolidLayerSpec,
  SweepLayerSpec,
  VignetteLayerSpec,
} from '../types.ts';

const fill: React.CSSProperties = { position: 'absolute', inset: 0 };

export const Solid: React.FC<{ spec: SolidLayerSpec<string> }> = ({ spec }) => (
  <div style={{ ...fill, background: spec.color }} />
);

export const Gradient: React.FC<{ spec: GradientLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const angle = spec.angle + (spec.drift ?? 0) * Math.sin((frame / fps) * 0.25);
  return (
    <div
      style={{
        ...fill,
        background: `linear-gradient(${angle.toFixed(3)}deg in oklch, ${spec.from}, ${spec.to})`,
      }}
    />
  );
};

export const Vignette: React.FC<{ spec: VignetteLayerSpec<string> }> = ({ spec }) => {
  const inner = Math.round((1 - spec.strength) * 70);
  return (
    <div
      style={{
        ...fill,
        background: `radial-gradient(120% 85% at 50% 45%, transparent ${inner}%, ${withAlpha(spec.color, 0.55)} 85%, ${withAlpha(spec.color, 0.92)} 100%)`,
      }}
    />
  );
};

export const LightSweep: React.FC<{ spec: SweepLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Фаза 0..1 по периоду; луч уходит за кадр с запасом, чтобы не было «скачка» на стыке.
  const phase = ((frame / fps) % spec.periodSec) / spec.periodSec;
  const pos = -40 + phase * 180; // % вдоль направления
  const w = spec.width * 100;
  return (
    <div
      style={{
        ...fill,
        background: `linear-gradient(${spec.angle}deg, transparent ${(pos - w).toFixed(2)}%, ${withAlpha(spec.color, 0.9)} ${pos.toFixed(2)}%, transparent ${(pos + w).toFixed(2)}%)`,
      }}
    />
  );
};

export const Glow: React.FC<{ spec: GlowLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spec.radius * (1 + (spec.breathe ?? 0) * Math.sin((frame / fps) * 0.9));
  return (
    <div
      style={{
        ...fill,
        background: `radial-gradient(${(r * 100).toFixed(2)}vw ${(r * 100).toFixed(2)}vw at ${spec.x * 100}% ${spec.y * 100}%, ${spec.color} 0%, ${withAlpha(spec.color, 0.35)} 35%, transparent 70%)`,
      }}
    />
  );
};

// Фоллбек для ShaderBase, если WebGL недоступен: CSS-градиенты, тоже функция кадра.
// Помечает DOM атрибутом data-shader-fallback — его видно в DevTools, а Lab выводит плашку.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { withAlpha } from '../../theme/color.ts';
import type { ShaderLayerSpec } from '../types.ts';

export const ShaderFallback: React.FC<{ spec: ShaderLayerSpec<string>; reason: string }> = ({ spec, reason }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * spec.tempo;
  const back = spec.colorBack ?? spec.colors[0];
  const blobs = spec.colors.slice(0, 4).map((c, i) => {
    const a = t * 0.35 + i * 1.7;
    const x = 50 + Math.cos(a) * 28;
    const y = 50 + Math.sin(a * 0.8 + i) * 32;
    return `radial-gradient(60% 45% at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${withAlpha(c, 0.85)} 0%, transparent 70%)`;
  });
  return (
    <div
      data-shader-fallback={spec.shader}
      title={`WebGL недоступен: ${reason}`}
      style={{ position: 'absolute', inset: 0, background: `${blobs.join(', ')}, ${back}` }}
    />
  );
};

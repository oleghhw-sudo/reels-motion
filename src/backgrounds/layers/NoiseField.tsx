// Дрейфующие частицы / линии потока на @remotion/noise. Позиции — чистая функция (seed, i, t).
import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { noise2D, noise3D } from '@remotion/noise';
import type { NoiseFieldLayerSpec } from '../types.ts';

export const NoiseField: React.FC<{ spec: NoiseFieldLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = (frame / fps) * spec.speed;

  // Базовые точки: детерминированно из seed (noise2D как хэш), без случайных чисел
  const seeds = useMemo(
    () =>
      Array.from({ length: spec.count }, (_, i) => ({
        x: (noise2D(spec.seed + 'x', i * 13.37, 0.5) * 0.5 + 0.5) * width,
        y: (noise2D(spec.seed + 'y', i * 7.91, 0.5) * 0.5 + 0.5) * height,
        r: 1 + (noise2D(spec.seed + 'r', i * 3.1, 0.5) * 0.5 + 0.5) * 2.6,
      })),
    [spec.count, spec.seed, width, height],
  );

  if (spec.mode === 'particles') {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
        {seeds.map((p, i) => {
          const dx = noise3D(spec.seed, p.x * 0.002, p.y * 0.002, t) * 120;
          const dy = noise3D(spec.seed + 'b', p.x * 0.002, p.y * 0.002, t) * 120 - ((t * 40) % height);
          const y = (((p.y + dy) % height) + height) % height;
          const a = 0.35 + 0.65 * (noise3D(spec.seed + 'a', i, 0, t * 2) * 0.5 + 0.5);
          return <circle key={i} cx={p.x + dx} cy={y} r={p.r} fill={spec.color} opacity={a} />;
        })}
      </svg>
    );
  }

  // lines: короткие линии потока — интегрируем поле шума на 14 шагов от каждой точки
  const paths = seeds.map((p) => {
    let x = p.x;
    let y = p.y;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let k = 0; k < 14; k++) {
      const ang = noise3D(spec.seed, x * 0.0016, y * 0.0016, t * 0.5) * Math.PI * 2;
      x += Math.cos(ang) * 16;
      y += Math.sin(ang) * 16;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  });
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={spec.color} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
      ))}
    </svg>
  );
};

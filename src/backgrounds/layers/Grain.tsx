// Зерно: SVG feTurbulence. Анимированное — seed = номер кадра (детерминированно), статичное — seed 7.
import React, { useId } from 'react';
import { useCurrentFrame } from 'remotion';
import type { GrainLayerSpec } from '../types.ts';

export const Grain: React.FC<{ spec: GrainLayerSpec; frequency: number; animated: boolean }> = ({
  frequency,
  animated,
}) => {
  const frame = useCurrentFrame();
  const id = useId().replace(/:/g, '');
  const seed = animated ? frame % 997 : 7;
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
      <filter id={`g${id}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={frequency} numOctaves={2} seed={seed} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#g${id})`} />
    </svg>
  );
};

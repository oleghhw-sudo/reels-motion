// Сетка/точки/чертёж с медленным параллаксом: сдвиг = drift * t (px), по модулю шага.
import React, { useId } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { GridLayerSpec } from '../types.ts';

export const GridPattern: React.FC<{ spec: GridLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useId().replace(/:/g, '');
  const t = frame / fps;
  const s = spec.size;
  const big = spec.variant === 'blueprint' ? s * 5 : s;
  const ox = (((spec.drift[0] * t) % big) + big) % big;
  const oy = (((spec.drift[1] * t) % big) + big) % big;
  const maskId = `m${id}`;
  const mask =
    spec.mask === 'radial' ? (
      <radialGradient id={`${maskId}g`} cx="50%" cy="45%" r="70%">
        <stop offset="0%" stopColor="#fff" />
        <stop offset="100%" stopColor="#000" />
      </radialGradient>
    ) : spec.mask === 'fade-bottom' ? (
      <linearGradient id={`${maskId}g`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" />
        <stop offset="100%" stopColor="#000" />
      </linearGradient>
    ) : null;

  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        {spec.variant === 'dots' ? (
          <pattern id={`p${id}`} width={s} height={s} patternUnits="userSpaceOnUse" x={ox} y={oy}>
            <circle cx={s / 2} cy={s / 2} r={Math.max(1.2, s / 28)} fill={spec.color} />
          </pattern>
        ) : spec.variant === 'lines' ? (
          <pattern id={`p${id}`} width={s} height={s} patternUnits="userSpaceOnUse" x={ox} y={oy}>
            <path d={`M ${s} 0 L 0 0 0 ${s}`} fill="none" stroke={spec.color} strokeWidth={1} />
          </pattern>
        ) : (
          <>
            <pattern id={`ps${id}`} width={s} height={s} patternUnits="userSpaceOnUse">
              <path d={`M ${s} 0 L 0 0 0 ${s}`} fill="none" stroke={spec.color} strokeWidth={0.6} strokeOpacity={0.55} />
            </pattern>
            <pattern id={`p${id}`} width={big} height={big} patternUnits="userSpaceOnUse" x={ox} y={oy}>
              <rect width={big} height={big} fill={`url(#ps${id})`} />
              <path d={`M ${big} 0 L 0 0 0 ${big}`} fill="none" stroke={spec.color} strokeWidth={1.6} />
              <path d={`M -6 0 H 6 M 0 -6 V 6`} stroke={spec.color} strokeWidth={2} transform={`translate(${big} ${big})`} />
            </pattern>
          </>
        )}
        {mask}
        {mask ? (
          <mask id={maskId}>
            <rect width="100%" height="100%" fill={`url(#${maskId}g)`} />
          </mask>
        ) : null}
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} mask={mask ? `url(#${maskId})` : undefined} />
    </svg>
  );
};

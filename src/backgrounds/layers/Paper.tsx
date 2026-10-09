// Бумажная текстура для светлых пресетов: волокна (feTurbulence) + рельеф (feDiffuseLighting).
// Статична по построению (бумага не «кипит»), лёгкое смещение света — функция кадра.
import React, { useId } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { PaperLayerSpec } from '../types.ts';

export const Paper: React.FC<{ spec: PaperLayerSpec<string> }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useId().replace(/:/g, '');
  const az = 225 + 10 * Math.sin((frame / fps) * 0.2);
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
      <filter id={`p${id}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04 0.9" numOctaves={4} seed={3} result="fib" />
        <feDiffuseLighting in="fib" lightingColor={spec.color} surfaceScale={spec.relief * 3} result="lit">
          <feDistantLight azimuth={az} elevation={60} />
        </feDiffuseLighting>
      </filter>
      <rect width="100%" height="100%" filter={`url(#p${id})`} />
    </svg>
  );
};

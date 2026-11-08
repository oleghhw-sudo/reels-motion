// Композиции схемы (задача 031): полная 1920×1080@60 на 150 с и черновой аниматик 960×540@30 (отрезок [fromSec, toSec]).
// Время — только из useCurrentFrame() (гейт 1).
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { Scheme } from './Scheme.tsx';
import { DURATION } from './timeline.ts';

loadAllFonts();

export const SCHEMA_FPS = 60;
export const SCHEMA_FRAMES = DURATION * SCHEMA_FPS;

export const YurkonturSchema: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Scheme t={f / fps} />
    </AbsoluteFill>
  );
};

export const animaticSchema = z.object({ fromSec: z.number().min(0), toSec: z.number().positive() });
export type AnimaticProps = z.infer<typeof animaticSchema>;
export const ANIMATIC_FPS = 30;

export const YurkonturAnimatic: React.FC<AnimaticProps> = ({ fromSec }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: 'scale(0.5)' }}>
        <Scheme t={fromSec + f / fps} />
      </div>
    </AbsoluteFill>
  );
};
export const animaticMetadata = ({ props }: { props: AnimaticProps }) => ({ durationInFrames: Math.round((props.toSec - props.fromSec) * ANIMATIC_FPS) });

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

/** subStyle — вариант субтитров Олега (A Source Serif 4 42 / B Inter 38 / C JetBrains Mono 32), tokens.ts SUB_STYLES. */
const subStyleEnum = z.enum(['A', 'B', 'C']);
export const schemaSchema = z.object({ subStyle: subStyleEnum });
export type SchemaProps = z.infer<typeof schemaSchema>;

export const YurkonturSchema: React.FC<SchemaProps> = ({ subStyle }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Scheme t={f / fps} subStyle={subStyle} />
    </AbsoluteFill>
  );
};

export const animaticSchema = z.object({ fromSec: z.number().min(0), toSec: z.number().positive(), subStyle: subStyleEnum });
export type AnimaticProps = z.infer<typeof animaticSchema>;
export const ANIMATIC_FPS = 30;

export const YurkonturAnimatic: React.FC<AnimaticProps> = ({ fromSec, subStyle }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: 'scale(0.5)' }}>
        <Scheme t={fromSec + f / fps} subStyle={subStyle} />
      </div>
    </AbsoluteFill>
  );
};
export const animaticMetadata = ({ props }: { props: AnimaticProps }) => ({ durationInFrames: Math.round((props.toSec - props.fromSec) * ANIMATIC_FPS) });

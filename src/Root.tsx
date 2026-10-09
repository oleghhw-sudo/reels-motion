import React from 'react';
import { Composition } from 'remotion';
import { BackgroundLab, BackgroundLabGrid, SECONDS_PER_RECIPE, labSchema } from './labs/BackgroundLab.tsx';
import { RECIPES } from './backgrounds/recipes.ts';

const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="BackgroundLab"
      component={BackgroundLab}
      schema={labSchema}
      defaultProps={{ presetId: 'graphite-lime' as const, showSafeZones: false }}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={RECIPES.length * SECONDS_PER_RECIPE * FPS}
    />
    <Composition
      id="BackgroundLabGrid"
      component={BackgroundLabGrid}
      schema={labSchema}
      defaultProps={{ presetId: 'graphite-lime' as const, showSafeZones: false }}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={1}
    />
  </>
);

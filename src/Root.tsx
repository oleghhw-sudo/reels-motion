import React from 'react';
import { Composition } from 'remotion';
import { BackgroundLab, BackgroundLabGrid, SECONDS_PER_RECIPE, labSchema } from './labs/BackgroundLab.tsx';
import { RECIPES } from './backgrounds/recipes.ts';
import { BEAUTY_FPS, BEAUTY_FRAMES, BeautyStudioReel, beautySchema } from './videos/beauty-studio/BeautyStudioReel.tsx';
import { BackgroundPicker } from './labs/BackgroundPicker.tsx';
import { FIXTURE_FRAMES, ReadcheckFixture } from './qa/ReadcheckFixture.tsx';
import { MOTION_LAB_FRAMES, MotionLab } from './labs/MotionLab.tsx';

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
    <Composition
      id="BeautyStudioReel"
      component={BeautyStudioReel}
      schema={beautySchema}
      defaultProps={{ showSafeZones: false }}
      width={1080}
      height={1920}
      fps={BEAUTY_FPS}
      durationInFrames={BEAUTY_FRAMES}
    />
    <Composition id="BackgroundPicker" component={BackgroundPicker} width={1080} height={1920} fps={FPS} durationInFrames={1} />
    {/* позитивный контроль scripts/readcheck.mjs --self-test */}
    <Composition id="ReadcheckFixture" component={ReadcheckFixture} width={1080} height={1920} fps={FPS} durationInFrames={FIXTURE_FRAMES} />
    {/* лаборатория функций src/motion */}
    <Composition id="MotionLab" component={MotionLab} width={1080} height={1920} fps={FPS} durationInFrames={MOTION_LAB_FRAMES} />
  </>
);

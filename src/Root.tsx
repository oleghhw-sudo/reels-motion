import React from 'react';
import { Composition } from 'remotion';
import { BackgroundLab, BackgroundLabGrid, SECONDS_PER_RECIPE, labSchema } from './labs/BackgroundLab.tsx';
import { RECIPES } from './backgrounds/recipes.ts';
import { BEAUTY_FPS, BEAUTY_FRAMES, BeautyStudioReel, beautySchema } from './videos/beauty-studio/BeautyStudioReel.tsx';
import { BackgroundPicker } from './labs/BackgroundPicker.tsx';
import { FIXTURE_FRAMES, ReadcheckFixture } from './qa/ReadcheckFixture.tsx';
import { LATIN_FIXTURE_FRAMES, LatinOnlyFixture } from './qa/LatinOnlyFixture.tsx';
import { MIA_FPS, MiaOutro, MiaOutroVertical, miaOutroMetadata, miaOutroSchema } from './videos/mia-outro/MiaOutro.tsx';
import { OUTRO } from './videos/mia-outro/script.ts';
import { MOTION_LAB_FRAMES, MotionLab } from './labs/MotionLab.tsx';
import { MOTION_LAB_KIT_FPS, MOTION_LAB_KIT_FRAMES, MotionLabKit } from './labs/MotionLabKit.tsx';
import { FX_LAB_FPS, FX_LAB_FRAMES, FxLab24 } from './fx/lab/FxLab24.tsx';
import { AGENT_FPS, AGENT_FRAMES, AgentTerminal } from './videos/agent-terminal/AgentTerminal.tsx';

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
    <Composition id="LatinOnlyFixture" component={LatinOnlyFixture} width={1080} height={1920} fps={FPS} durationInFrames={LATIN_FIXTURE_FRAMES} />
    <Composition
      id="MiaOutro"
      component={MiaOutro}
      schema={miaOutroSchema}
      defaultProps={{ episode: 'ep01' }}
      calculateMetadata={miaOutroMetadata}
      width={OUTRO.format.landscape.w}
      height={OUTRO.format.landscape.h}
      fps={MIA_FPS}
      durationInFrames={1}
    />
    <Composition
      id="MiaOutroVertical"
      component={MiaOutroVertical}
      schema={miaOutroSchema}
      defaultProps={{ episode: 'ep01' }}
      calculateMetadata={miaOutroMetadata}
      width={OUTRO.format.portrait.w}
      height={OUTRO.format.portrait.h}
      fps={MIA_FPS}
      durationInFrames={1}
    />
    {/* лаборатория функций src/motion */}
    <Composition id="MotionLab" component={MotionLab} width={1080} height={1920} fps={FPS} durationInFrames={MOTION_LAB_FRAMES} />
    <Composition id="MotionLabKit" component={MotionLabKit} width={1080} height={1920} fps={MOTION_LAB_KIT_FPS} durationInFrames={MOTION_LAB_KIT_FRAMES} />
    {/* лаборатория приёмов src/fx (задача 012-А): плитки S/M/L, слэм, штамп, плашка, хлёст, ramp, look */}
    <Composition id="FxLab24" component={FxLab24} width={1080} height={1920} fps={FX_LAB_FPS} durationInFrames={FX_LAB_FRAMES} />
    {/* «Термінал помічника кресляра» (задача 020): 1920×1080, 30 fps, 32 с, петля */}
    <Composition id="AgentTerminal" component={AgentTerminal} width={1920} height={1080} fps={AGENT_FPS} durationInFrames={AGENT_FRAMES} />
  </>
);

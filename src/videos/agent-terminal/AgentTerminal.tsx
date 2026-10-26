// Ролик «Термінал помічника кресляра» (задача 020): 1920×1080, 30 fps, 960 кадров, бесшовная петля (кадр 959 ≈ кадр 0).
// Всё — функция useCurrentFrame() (гейт 1). Данные — только из ./data/*.json через data.ts; тайминги — только timeline.ts.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { seg } from '../../motion/index.ts';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { Finale } from './Finale.tsx';
import { Header } from './Header.tsx';
import { LogStream } from './LogStream.tsx';
import { ModuleRail } from './ModuleRail.tsx';
import { QueueStrip } from './QueueStrip.tsx';
import { ScanCanvas } from './ScanCanvas.tsx';
import { ZonePlan } from './ZonePlan.tsx';
import { C } from './theme.ts';
import { FPS, FRAMES, T } from './timeline.ts';

loadAllFonts();

export const AGENT_FPS = FPS;
export const AGENT_FRAMES = FRAMES;

export const AgentTerminal: React.FC = () => {
  const f = useCurrentFrame();
  // откат к петле: всё содержимое гаснет к кадру reset + 26 (< 959), остаётся только пустой дашборд = кадр 0
  const fade = 1 - seg(f, T.reset, T.reset + 26);
  const toPlan = seg(f, T.sumy.plan, T.sumy.plan + 12);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, color: C.text }}>
      <Img src={staticFile('videos/agent-terminal/bg.png')} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} />
      <ScanCanvas opacity={(1 - toPlan) * fade} />
      <ZonePlan opacity={toPlan * fade} />
      <Finale fade={fade} />
      <Header fade={fade} />
      <ModuleRail />
      <LogStream fade={fade} />
      <QueueStrip fade={fade} />
    </AbsoluteFill>
  );
};

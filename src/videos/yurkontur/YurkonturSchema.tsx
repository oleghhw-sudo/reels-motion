// Композиции схемы (задача 031): полная 1920×1080@60 на длину озвучки и черновой аниматик 960×540@30 (отрезок [fromSec, toSec]).
// Время — только из useCurrentFrame() (гейт 1).
import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { Scheme } from './Scheme.tsx';
import { DURATION } from './timeline.ts';
import APPROVED from '../../../videos/yurkontur/voice/approved.json';

loadAllFonts();

/** Одобренная озвучка: копия в public/ кладёт videos/yurkontur/voice-approved.mjs после сверки версии вне репо. */
const VOICE_WAV = staticFile('videos/yurkontur/voice.wav');
const VOICE_SHA = APPROVED.files.find((f) => f.name === 'full.wav')?.sha256;

/** Рендер и студия падают, если voice.wav в public/ — не одобренная версия (решение Олега 09.11). */
async function checkVoice(): Promise<void> {
  const buf = await (await fetch(VOICE_WAV)).arrayBuffer();
  const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!VOICE_SHA || hex !== VOICE_SHA)
    throw new Error(`voice.wav не совпадает с одобренной озвучкой ${APPROVED.version} (videos/yurkontur/voice/approved.json) — запустите: node videos/yurkontur/voice-approved.mjs`);
}
export const schemaMetadata = async () => {
  await checkVoice();
  return {};
};

export const SCHEMA_FPS = 60;
export const SCHEMA_FRAMES = Math.ceil(DURATION * SCHEMA_FPS);

export const YurkonturSchema: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Audio src={VOICE_WAV} />
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
      <Audio src={VOICE_WAV} trimBefore={Math.round(fromSec * fps)} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: 'scale(0.5)' }}>
        <Scheme t={fromSec + f / fps} />
      </div>
    </AbsoluteFill>
  );
};
export const animaticMetadata = async ({ props }: { props: AnimaticProps }) => {
  await checkVoice();
  return { durationInFrames: Math.round((props.toSec - props.fromSec) * ANIMATIC_FPS) };
};

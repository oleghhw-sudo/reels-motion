// Reels-презентация beautystudiozp.com под музыку. Тайминги, тексты, фоны, музыка, звук — из videos/beauty-studio/scenes.yaml.
// Границы сцен — сильные доли трека (проверяется в script.ts при сборке).
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { BEAUTY_COLORS, BEAUTY_FONTS } from '../../theme/brands/beauty-studio.ts';
import { SafeZones } from '../../labs/SafeZones.tsx';
import { SceneEnter } from './primitives.tsx';
import { SCRIPT, sfxInfo, type BeautyScene } from './script.ts';
import { ApproachScene, HookScene, ServicesScene, WorksScene } from './scenes-a.tsx';
import { ContactsScene, DetailsScene, LogoScene, StudioScene } from './scenes-b.tsx';

loadAllFonts();

export const beautySchema = z.object({ showSafeZones: z.boolean() });
export type BeautyProps = z.infer<typeof beautySchema>;

export const BEAUTY_FPS = SCRIPT.format.fps;
export const BEAUTY_FRAMES = SCRIPT.format.durationInFrames;

const COMPONENTS: Record<BeautyScene['id'], React.FC> = {
  hook: HookScene,
  approach: ApproachScene,
  works: WorksScene,
  services: ServicesScene,
  details: DetailsScene,
  studio: StudioScene,
  contacts: ContactsScene,
  logo: LogoScene,
};

/** Абсолютное время пика звука (сек) по якорю из scenes.yaml: scene.<id> — доля входа сцены. */
export function anchorSec(anchor: string): number {
  const m = anchor.match(/^scene\.([a-z]+)$/);
  const sc = m ? SCRIPT.scenes.find((x) => x.id === m[1]) : undefined;
  if (!sc) throw new Error(`scenes.yaml sfx: неизвестный якорь "${anchor}". Есть: ${SCRIPT.scenes.map((x) => `scene.${x.id}`).join(', ')}`);
  return sc.from;
}

/** Музыка — основа ролика: отрезок без фейдов (prepare-assets), здесь gain + фейды. */
const Music: React.FC = () => {
  const { fps } = useVideoConfig();
  const m = SCRIPT.music;
  const total = BEAUTY_FRAMES;
  const fi = Math.max(1, Math.round(m.fadeInSec * fps));
  const fo = Math.max(1, Math.round(m.fadeOutSec * fps));
  return (
    <Audio
      src={staticFile(m.file)}
      trimBefore={Math.round(m.startInFile * fps)}
      volume={(f) => m.gain * interpolate(f, [0, fi, total - fo, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
    />
  );
};

export const BeautyStudioReel: React.FC<BeautyProps> = ({ showSafeZones }) => {
  const { fps } = useVideoConfig();
  const scenes = SCRIPT.scenes;
  return (
    <AbsoluteFill style={{ backgroundColor: BEAUTY_COLORS.dark }}>
      {scenes.map((sc, i) => {
        const C = COMPONENTS[sc.id];
        const next = scenes[i + 1];
        // сцена живёт, пока следующая входит поверх неё
        const tail = next ? Math.round((next.enter.ms / 1000) * fps) : 0;
        const from = Math.round(sc.from * fps);
        const dur = Math.round(sc.to * fps) - from + tail;
        return (
          <Sequence key={sc.id} from={from} durationInFrames={dur} name={sc.id}>
            <SceneEnter type={sc.enter.type} ms={sc.enter.ms}>
              <C />
            </SceneEnter>
          </Sequence>
        );
      })}
      {SCRIPT.sfx.cues.map((c, i) => {
        const info = sfxInfo(c.sound);
        const start = Math.max(0, Math.round((anchorSec(c.anchor) - info.transientMs / 1000) * fps));
        return (
          <Sequence key={`sfx-${i}`} from={start} durationInFrames={fps} name={`sfx ${c.sound} @${c.anchor}`}>
            <Audio src={staticFile(info.path)} volume={c.volume} />
          </Sequence>
        );
      })}
      <Music />
      {showSafeZones ? <SafeZones color="#ff2d6f" fontFamily={BEAUTY_FONTS.body} /> : null}
    </AbsoluteFill>
  );
};

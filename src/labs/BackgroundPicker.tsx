// BackgroundPicker: постер 1080×1920 — 2×2 кандидата фона ролика с РЕАЛЬНЫМ текстом хука
// (из scenes.yaml → background.candidates). Выбор фиксирует Олег в scenes.yaml → background.perScene.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BrandSurface, isLightSurface } from '../backgrounds/BrandSurface.tsx';
import { loadAllFonts } from '../theme/loadFonts.ts';
import { BEAUTY_COLORS, BEAUTY_FONTS, type BeautySurfaceId } from '../theme/brands/beauty-studio.ts';
import { SCRIPT } from '../videos/beauty-studio/script.ts';
import { HeroVideoLayer, HookText } from '../videos/beauty-studio/scenes-a.tsx';

loadAllFonts();

const CELL_W = 1080;
const CELL_H = 1920;
const SCALE = 0.44;

const Candidate: React.FC<{ id: BeautySurfaceId }> = ({ id }) => {
  const light = isLightSurface(id);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {id === 'hero-video' ? (
        // кадр хука на 2.7 с сцены: крупный план глаза (тот же pan/zoom, что в ролике)
        <HeroVideoLayer t={0} offsetSec={2.7} />
      ) : (
        <BrandSurface id={id} />
      )}
      {/* t = 10 c: все появления хука завершены */}
      <HookText t={10} color={light ? BEAUTY_COLORS.ink : BEAUTY_COLORS.white} shadow={id === 'hero-video'} />
    </AbsoluteFill>
  );
};

export const BackgroundPicker: React.FC = () => {
  const cands = SCRIPT.background.candidates;
  const gap = (1080 - 2 * CELL_W * SCALE) / 3;
  return (
    <AbsoluteFill style={{ backgroundColor: '#2a2725' }}>
      {cands.map((c, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const left = gap + col * (CELL_W * SCALE + gap);
        const top = 30 + row * (CELL_H * SCALE + 100);
        return (
          <React.Fragment key={c.id}>
            <div style={{ position: 'absolute', left, top, width: CELL_W, height: CELL_H, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
              <Candidate id={c.id} />
            </div>
            <div
              style={{
                position: 'absolute',
                left,
                top: top + CELL_H * SCALE + 10,
                width: CELL_W * SCALE,
                fontFamily: BEAUTY_FONTS.body,
                fontSize: 21,
                lineHeight: 1.25,
                color: '#f2e9e4',
              }}
            >
              <b style={{ fontWeight: 500 }}>{c.id}</b> — {c.why}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

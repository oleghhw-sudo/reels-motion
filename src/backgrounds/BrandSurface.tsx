// Поверхности бренда, снятые с CSS сайта (ARCHITECTURE: brandSurface). Статичны по замыслу сайта:
// «бумага» §3.1 не анимируется; тёмные секции плоские (§3.1, последняя строка).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BEAUTY_COLORS, PAPER_LAYERS, PAPER_TILE_PX, type BeautySurfaceId } from '../theme/brands/beauty-studio.ts';

const paper = (pigment: string): React.CSSProperties => ({
  backgroundColor: pigment,
  backgroundImage: PAPER_LAYERS.join(', '),
  backgroundRepeat: 'no-repeat, no-repeat, repeat',
  backgroundSize: `auto, auto, ${PAPER_TILE_PX}px ${PAPER_TILE_PX}px`,
});

export const surfaceStyle = (id: Exclude<BeautySurfaceId, 'hero-video'>): React.CSSProperties => {
  switch (id) {
    case 'milk-paper':
      return paper(BEAUTY_COLORS.milk);
    case 'blush-paper':
      return paper(BEAUTY_COLORS.blush);
    case 'about-paper':
      return paper(BEAUTY_COLORS.aboutSurface);
    case 'dark':
      return { backgroundColor: BEAUTY_COLORS.dark };
    case 'logo-milk':
      return { backgroundColor: BEAUTY_COLORS.loader };
  }
};

export const BrandSurface: React.FC<{ id: Exclude<BeautySurfaceId, 'hero-video'> }> = ({ id }) => (
  <AbsoluteFill style={surfaceStyle(id)} />
);

/** true — светлая поверхность (текст ink, линии rule-*), false — тёмная. */
export const isLightSurface = (id: BeautySurfaceId) => id !== 'dark' && id !== 'hero-video';

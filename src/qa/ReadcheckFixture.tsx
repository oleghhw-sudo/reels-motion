// Позитивный контроль для scripts/readcheck.mjs (--self-test): 60 кадров с ЗАВЕДОМЫМИ нарушениями.
// Ожидание (readcheck.mjs, EXPECTED_SELF_TEST):
//   fx.short  → SHORT        (видна 9 кадров = 0.3 с через opacity, нужно ≥ 1.0 с)
//   fx.edge   → OUT_OF_FRAME (правый край строки за пределом 1080)
//   fx.bottom → UNSAFE       (лежит в нижней safe zone; входит шторкой clip-path inset)
//   fx.behind → OCCLUDED     (непрозрачный слой data-occluder поверх ~половины строки)
//   fx.front  → без нарушений (тот же слой под строкой)
//   fx.ok     → без нарушений (входит из маски overflow:hidden за 6 кадров, держится до конца)
// Всё — функция кадра; маска и шторка нарочно проверяют обработку overflow и clip-path.
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { loadAllFonts, fontStack } from '../theme/loadFonts.ts';
import { SAFE } from '../labs/safe-zones.ts';
import { OCCLUDER_ATTR, Readable } from './Readable.tsx';

/** Непрозрачная картинка 4×4 (data URI — без файла и без сети). */
const OPAQUE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVQI12O0ylv6nwEJMDGgAcICAJaDAlR+MXR5AAAAAElFTkSuQmCC';

loadAllFonts();

export const FIXTURE_FRAMES = 60;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const ReadcheckFixture: React.FC = () => {
  const f = useCurrentFrame();
  const font: React.CSSProperties = { fontFamily: fontStack('Onest'), fontSize: 72, lineHeight: 1.3, color: '#f2efe8', whiteSpace: 'nowrap' };
  // fx.short: видна только кадры 15..23 (9 кадров = 0.3 с)
  const shortOpacity = f >= 15 && f < 24 ? 1 : 0;
  // fx.ok: строка выезжает из-под маски overflow:hidden за кадры 0..6
  const okShift = interpolate(f, [0, 6], [110, 0], clamp);
  // fx.bottom: шторка clip-path снизу вверх за кадры 0..6
  const curtain = interpolate(f, [0, 6], [100, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: '#1d1b19' }}>
      <div style={{ ...font, position: 'absolute', left: SAFE.left, top: 400, opacity: shortOpacity }}>
        <Readable id="fx.short" text="Мигнуло">
          Мигнуло
        </Readable>
      </div>
      <div style={{ ...font, position: 'absolute', left: 820, top: 700 }}>
        <Readable id="fx.edge" text="За правим краєм">
          За правим краєм
        </Readable>
      </div>
      <div style={{ ...font, position: 'absolute', left: SAFE.left, top: 1920 - SAFE.bottom + 120, clipPath: `inset(${curtain}% 0 0 0)` }}>
        <Readable id="fx.bottom" text="Під підписом">
          Під підписом
        </Readable>
      </div>
      {/* fx.behind: непрозрачный слой data-occluder ПОСЛЕ текста закрывает ~половину строки → OCCLUDED;
          fx.front: тот же слой ДО текста (текст поверх) → без нарушений */}
      <div style={{ ...font, position: 'absolute', left: SAFE.left, top: 1250 }}>
        <Readable id="fx.behind" text="За фігурою">
          За фігурою
        </Readable>
      </div>
      <Img {...OCCLUDER_ATTR} src={OPAQUE_PNG} style={{ position: 'absolute', left: SAFE.left + 160, top: 1230, width: 400, height: 140 }} />
      <Img {...OCCLUDER_ATTR} src={OPAQUE_PNG} style={{ position: 'absolute', left: SAFE.left + 160, top: 1380, width: 400, height: 140 }} />
      <div style={{ ...font, position: 'absolute', left: SAFE.left, top: 1400 }}>
        <Readable id="fx.front" text="Перед фігурою">
          Перед фігурою
        </Readable>
      </div>
      <div style={{ ...font, position: 'absolute', left: SAFE.left, top: 1000, overflow: 'hidden' }}>
        <div style={{ transform: `translateY(${okShift}%)` }}>
          <Readable id="fx.ok" text="Читається">
            Читається
          </Readable>
        </div>
      </div>
    </AbsoluteFill>
  );
};

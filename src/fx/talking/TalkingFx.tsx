// src/fx/talking/TalkingFx.tsx — тонкие компоненты трёх эффектов пилота поверх чистых функций effects.ts (задача 026-А).
// Всё — функция useCurrentFrame() (гейт 1). Без backdrop-filter, mask-image, backgroundImage-картинок (/docs/flickering):
// линза — копия кадра (видео + человек) в круглом overflow:hidden + SVG feDisplacementMap по встроенной карте (data URI)
// с хроматикой по каналам; filter и transform — на разных обёртках.
import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { Readable } from '../../qa/Readable.tsx';
import { FONTS } from '../../theme/fonts.ts';
import { BIGNUM, FIGMA, LENS, bignum, figma, lens, type BignumFx, type FigmaFx, type LensFx } from './effects.ts';
import { LENS_MAP } from './lensMap.ts';
import { windowOf } from './window.ts';

export type Crop = { x: number; y: number; w: number; h: number };
/** Исходник под кроп 9:16 из matte.json (cover по центру): размер исходника = кроп + поля с двух сторон. */
export const SourceVideo: React.FC<{ src: string; crop: Crop; srcFps: number }> = ({ src, crop }) => {
  const scale = Math.max(1080 / crop.w, 1920 / crop.h);
  const srcW = crop.w + 2 * crop.x, srcH = crop.h + 2 * crop.y;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, overflow: 'hidden' }}>
      <OffthreadVideo src={src} muted style={{ position: 'absolute', left: -crop.x * scale, top: -crop.y * scale, width: srcW * scale, height: srcH * scale }} />
    </div>
  );
};

const useT = () => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return f / fps; };

// ---------------------------------------------------------------- O9
export const BigNum: React.FC<{ e: BignumFx }> = ({ e }) => {
  const t = useT();
  const { u, d, inside } = windowOf(t, e);
  if (!inside) return null;
  const s = bignum(u, d, e.back);
  if (s.opacity <= 0.001) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: e.y - BIGNUM.size / 2, width: 1080, height: BIGNUM.size, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: s.opacity, filter: s.blur > 0.2 ? `blur(${s.blur}px)` : 'none' }}>
      <div style={{ transform: `translateY(${s.dy}px) scale(${s.scale})`, fontFamily: FONTS.Unbounded.family, fontWeight: 800, fontSize: BIGNUM.size, lineHeight: 1, color: 'transparent', WebkitTextStroke: `${BIGNUM.stroke}px ${BIGNUM.color}`, letterSpacing: '-0.04em' }}>
        {e.text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- O8
export const FigmaSelect: React.FC<{ e: FigmaFx }> = ({ e }) => {
  const t = useT();
  const { u, d, inside } = windowOf(t, e);
  if (!inside) return null;
  const s = figma(u, d, e, e.back);
  if (s.env <= 0.001) return null;
  const fw = s.w * s.stretch * s.frame, fh = s.h * s.frame;
  const fx = s.x, fy = s.y + s.h - fh; // рамка растёт из левого нижнего угла
  const H = FIGMA.handle;
  const handle = (x: number, y: number) => <div key={`${x},${y}`} style={{ position: 'absolute', left: x - H / 2, top: y - H / 2, width: H, height: H, background: '#fff', border: `2px solid ${FIGMA.blue}`, boxSizing: 'border-box' }} />;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: s.env }}>
      <Readable id={`figma-${e.t0}`} text={e.word}>
        <div style={{ position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, display: 'flex', alignItems: 'center', transform: `scaleX(${s.stretch})`, transformOrigin: 'left center', fontSize: s.fontSize, lineHeight: 1, whiteSpace: 'pre', color: '#fff', textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
          {s.letters.map((l, i) => (
            <span key={i} style={{ display: 'inline-block', width: FIGMA.charW * s.fontSize, textAlign: 'center', opacity: l.opacity, filter: l.blur > 0.2 ? `blur(${l.blur}px)` : 'none', transform: `translateY(${l.dy}px)`, fontFamily: l.italic ? FONTS.PlayfairDisplay.family : FONTS.Unbounded.family, fontStyle: l.italic ? 'italic' : 'normal', fontWeight: l.italic ? 500 : 700 }}>
              {l.ch}
            </span>
          ))}
        </div>
      </Readable>
      {s.frame > 0.001 ? (
        <>
          <div style={{ position: 'absolute', left: fx, top: fy, width: fw, height: fh, border: `3px solid ${FIGMA.blue}`, boxSizing: 'border-box' }} />
          {[[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]].map(([x, y]) => handle(x, y))}
          <div style={{ position: 'absolute', left: fx + fw / 2, top: fy + fh + 10, transform: 'translateX(-50%)', background: FIGMA.blue, color: '#fff', fontFamily: FONTS.Inter.family, fontSize: 22, fontWeight: 600, padding: '4px 10px', borderRadius: 4, whiteSpace: 'nowrap' }}>
            {s.sizeBadge}
          </div>
        </>
      ) : null}
      {s.cursor.opacity > 0.001 ? (
        <div style={{ position: 'absolute', left: s.cursor.x, top: s.cursor.y, opacity: s.cursor.opacity }}>
          <svg width={28} height={34} viewBox="0 0 28 34" style={{ display: 'block' }}>
            <path d="M2 2 L2 26 L8.5 20.5 L13 31 L18 29 L13.5 18.5 L22 18 Z" fill="#fff" stroke="#111" strokeWidth={2} strokeLinejoin="round" />
          </svg>
          <div style={{ position: 'absolute', ...(s.cursor.x > FIGMA.badgeFlipX ? { right: 22 } : { left: 22 }), top: 26, background: FIGMA.blue, color: '#fff', fontFamily: FONTS.Inter.family, fontSize: 24, fontWeight: 600, padding: '5px 12px', borderRadius: 6, whiteSpace: 'nowrap' }}>
            {e.badge}
          </div>
        </div>
      ) : null}
      {s.under.map((w, i) => (
        <Readable key={i} id={`figma-under-${e.t0}-${i}`} text={w.text}>
          <div style={{ position: 'absolute', left: s.x, top: s.y + s.h + FIGMA.underGap + 24 + i * 40, fontFamily: FONTS.Onest.family, fontSize: 32, fontWeight: 500, color: 'rgba(255,255,255,0.85)', opacity: w.opacity }}>
            {w.text}
          </div>
        </Readable>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- O7
/** Линза: внутри — копия кадра (children: видео + человек) с увеличением mag вокруг центра линзы и преломлением к краю. */
export const Lens: React.FC<{ e: LensFx; children: React.ReactNode }> = ({ e, children }) => {
  const t = useT();
  const { u, d, inside } = windowOf(t, e);
  if (!inside) return null;
  const s = lens(u, d, e, e.back);
  if (s.opacity <= 0.001) return null;
  const R = s.r, id = `lens-${Math.round(e.t0 * 1000)}`;
  const disp = R * 0.5 * LENS.edgeMag; // масштаб смещения карты (px) при ρ = 1
  return (
    <div style={{ position: 'absolute', left: s.cx - R, top: s.cy - R, width: 2 * R, height: 2 * R, opacity: s.opacity }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse">
            <feImage href={LENS_MAP} x={0} y={0} width={2 * R} height={2 * R} preserveAspectRatio="none" result="map" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feDisplacementMap in="r" in2="map" scale={disp + LENS.caPx} xChannelSelector="R" yChannelSelector="G" result="rd" />
            <feDisplacementMap in="g" in2="map" scale={disp} xChannelSelector="R" yChannelSelector="G" result="gd" />
            <feDisplacementMap in="b" in2="map" scale={disp - LENS.caPx} xChannelSelector="R" yChannelSelector="G" result="bd" />
            <feComposite in="rd" in2="gd" operator="arithmetic" k2={1} k3={1} result="rg" />
            <feComposite in="rg" in2="bd" operator="arithmetic" k2={1} k3={1} />
          </filter>
        </defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', boxShadow: LENS.shadow }}>
        <div style={{ position: 'absolute', inset: 0, filter: `url(#${id})` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, transform: `translate(${R - s.cx}px, ${R - s.cy}px) scale(${s.mag})`, transformOrigin: `${s.cx}px ${s.cy}px` }}>
            {children}
          </div>
        </div>
        {/* блик сверху-слева и ободок */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 32% 24%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 18%, rgba(255,255,255,0) 40%)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `${LENS.rim}px solid rgba(255,255,255,0.75)`, boxSizing: 'border-box', boxShadow: 'inset 0 0 24px rgba(255,255,255,0.25)' }} />
      </div>
    </div>
  );
};

export const Blank: React.FC = () => <AbsoluteFill />;

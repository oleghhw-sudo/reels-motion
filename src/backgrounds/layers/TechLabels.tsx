// Мелкие моно-подписи по краям: таймкод из кадра, номер кадра, опционально координаты.
// Размещаются ВНЕ safe-zone ключевого текста (по краям) — это декор, не контент.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { TechLabelsLayerSpec } from '../types.ts';

const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, '0');

export const TechLabels: React.FC<{ spec: TechLabelsLayerSpec<string>; fontFamily: string }> = ({ spec, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const sec = frame / fps;
  const tc = `${pad(sec / 60)}:${pad(sec % 60)}:${pad(frame % fps)}`;
  const s: React.CSSProperties = {
    position: 'absolute',
    fontFamily,
    fontSize: 22,
    letterSpacing: '0.08em',
    color: spec.color,
    whiteSpace: 'nowrap',
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ ...s, left: 56, top: 120 }}>REC ● {tc}</div>
      <div style={{ ...s, right: 56, top: 120 }}>F{pad(frame, 5)} / {fps}FPS</div>
      {spec.coords ? (
        <>
          <div style={{ ...s, left: 56, bottom: 300 }}>X 0.{pad((frame * 7) % 100)} · Y 0.{pad((frame * 3) % 100)}</div>
          <div style={{ ...s, right: 56, bottom: 300 }}>{width}×{height}</div>
        </>
      ) : null}
    </div>
  );
};

// Оверлей safe zones 9:16 (ARCHITECTURE.md): верх 220, низ 380, правый край 140.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { SAFE } from './safe-zones.ts';

export { SAFE };

export const SafeZones: React.FC<{ color: string; fontFamily: string }> = ({ color, fontFamily }) => {
  const zone: React.CSSProperties = {
    position: 'absolute',
    background: 'repeating-linear-gradient(45deg, transparent 0 14px, rgb(255 0 80 / 0.10) 14px 16px)',
    border: `1px dashed ${color}`,
  };
  const lbl: React.CSSProperties = { position: 'absolute', fontFamily, fontSize: 20, color, padding: 8 };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ ...zone, left: 0, right: 0, top: 0, height: SAFE.top }}>
        <span style={{ ...lbl, bottom: 0, left: 0 }}>UI top · 220</span>
      </div>
      <div style={{ ...zone, left: 0, right: 0, bottom: 0, height: SAFE.bottom }}>
        <span style={{ ...lbl, top: 0, left: 0 }}>caption / UI bottom · 380</span>
      </div>
      <div style={{ ...zone, right: 0, top: SAFE.top, bottom: SAFE.bottom, width: SAFE.right }}>
        <span style={{ ...lbl, top: 0, right: 0, writingMode: 'vertical-rl' }}>actions · 140</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          right: SAFE.right,
          top: SAFE.top,
          bottom: SAFE.bottom,
          border: `2px solid ${color}`,
        }}
      />
    </AbsoluteFill>
  );
};

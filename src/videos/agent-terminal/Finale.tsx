// Финал: по центру внизу полотна строка итога (числа из results.json через реестр) и мелкая пометка об эксперименте.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { seg } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { screenNumbers } from './data.ts';
import { C, CANVAS, FONT } from './theme.ts';
import { T } from './timeline.ts';

const NOTE = 'Експеримент на тестових сторінках, жовтень 2026. Модуль у розробці.';

export const Finale: React.FC<{ fade: number }> = ({ fade }) => {
  const f = useCurrentFrame();
  if (f < T.finale) return null;
  const S = screenNumbers();
  const a = seg(f, T.finale, T.finale + 18) * fade;
  const b = seg(f, T.finale + 14, T.finale + 32) * fade;
  return (
    <div style={{ position: 'absolute', left: CANVAS.x, top: CANVAS.y + CANVAS.h - 170, width: CANVAS.w, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '0 80px', boxSizing: 'border-box', textAlign: 'center' }}>
      <div style={{ fontFamily: FONT.ui, fontSize: 28, fontWeight: 600, lineHeight: 1.3, color: C.text, opacity: a, transform: `translateY(${(1 - a) * 12}px)`, textWrap: 'balance' }}>
        <Readable id="final.line" text={S['final']}>
          {S['final']}
        </Readable>
      </div>
      <div style={{ fontFamily: FONT.ui, fontSize: 15, color: C.muted, opacity: b, transform: `translateY(${(1 - b) * 8}px)` }}>
        <Readable id="final.note" text={NOTE}>
          {NOTE}
        </Readable>
      </div>
    </div>
  );
};

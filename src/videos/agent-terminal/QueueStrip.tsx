// Нижняя полоса 150 px: очередь из миниатюр страниц (thumbs/OXX.png) с чипами результата: «✓ +0,3 %» бирюзой / «до людини» бурштином.
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { kick, seg } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { PACK, PAGE_FAIL, PAGE_FULL, screenNumbers } from './data.ts';
import { C, FONT, L } from './theme.ts';
import { FPS, T, doneFrame, startFrame } from './timeline.ts';

const THUMB = { w: 120, h: 84, gap: 28 };

export const QueueStrip: React.FC<{ fade: number }> = ({ fade }) => {
  const f = useCurrentFrame();
  const S = screenNumbers();
  const ids = PACK.results.map((r) => r.id);
  const total = ids.length * THUMB.w + (ids.length - 1) * THUMB.gap;
  const x0 = (L.W - total) / 2;
  return (
    <div style={{ position: 'absolute', left: 0, top: L.H - L.queue, width: L.W, height: L.queue, borderTop: `1px solid ${C.line}` }}>
      {ids.map((id, i) => {
        const start = startFrame(id);
        const done = doneFrame(id);
        const end = id === PAGE_FULL ? T.pass.from : id === PAGE_FAIL ? T.sumy.plan : start + T.pass.step;
        const lit = f >= start && f < end && f < T.reset;
        const chipP = f >= done ? seg(f, done, done + 6) * fade : 0;
        const pop = f >= done ? kick((f - done) / FPS, 0.14) : 1;
        const ok = PACK.results[i].route === 'чернетка';
        const chip = S[`chip.${id}`];
        return (
          <div key={id} style={{ position: 'absolute', left: x0 + i * (THUMB.w + THUMB.gap), top: 16, width: THUMB.w }}>
            <div style={{ width: THUMB.w, height: THUMB.h, borderRadius: 6, overflow: 'hidden', border: `2px solid ${lit ? C.teal : C.line}`, boxSizing: 'border-box', background: C.panel, opacity: lit ? 1 : 0.78 }}>
              <Img src={staticFile(`videos/agent-terminal/thumbs/${id}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <div style={{ position: 'absolute', left: 6, top: 4, fontFamily: FONT.mono, fontSize: 10, color: C.muted, background: 'rgba(11,15,20,0.7)', padding: '1px 4px', borderRadius: 3 }}>{id}</div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', opacity: chipP, transform: `scale(${pop})` }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: ok ? C.teal : C.amber, border: `1px solid ${ok ? C.teal : C.amber}`, borderRadius: 6, padding: '2px 7px 3px', whiteSpace: 'nowrap' }}>
                <Readable id={`chip.${id}`} text={chip}>
                  {chip}
                </Readable>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

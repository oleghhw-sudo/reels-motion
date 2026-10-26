// Правая колонка 420 px: поток логов моноширинным, новые снизу, старые тускнеют. Меток времени нет (решение Олега 7).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { seg } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { screenNumbers } from './data.ts';
import { C, FONT, L } from './theme.ts';
import { T, logEvents, type Tone } from './timeline.ts';

const TONE: Record<Tone, string> = { text: C.text, teal: C.teal, amber: C.amber, muted: C.muted };
const ENTER = 6; // кадров на появление строки
const LINE_MAX = 110; // px: предел высоты строки при раскрытии (3 строки моно 16 px)

export const LogStream: React.FC<{ fade: number }> = ({ fade }) => {
  const f = useCurrentFrame();
  const events = logEvents(screenNumbers()).filter((e) => e.at <= f);
  const quiet = 1 - 0.65 * seg(f, T.finale, T.finale + 30); // финал: логи затихают
  return (
    <div style={{ position: 'absolute', left: L.W - L.log, top: L.header, width: L.log, height: L.H - L.header - L.queue, borderLeft: `1px solid ${C.line}`, boxSizing: 'border-box', padding: L.pad, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', opacity: quiet * fade }}>
      {events.map((e, i) => {
        const p = seg(f, e.at, e.at + ENTER);
        const k = events.length - 1 - i; // 0 — новейшая
        const dim = k <= 1 ? 1 - 0.08 * k : Math.max(0.3, 0.9 - 0.1 * k); // две свежие строки читаемы (≥ 0.9), дальше тускнеют
        return (
          <div key={e.key} style={{ flexShrink: 0, maxHeight: p * LINE_MAX, overflow: 'hidden', opacity: p * dim, transform: `translateY(${(1 - p) * 8}px)` }}>
            <div style={{ display: 'flex', gap: 10, padding: '4px 0', fontFamily: FONT.mono, fontSize: 16, lineHeight: 1.4, color: TONE[e.tone] }}>
              <span style={{ color: C.muted, flex: 'none' }}>›</span>
              <span style={{ wordBreak: 'break-word' }}>
                <Readable id={`log.${e.key}`} text={e.text}>
                  {e.text}
                </Readable>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

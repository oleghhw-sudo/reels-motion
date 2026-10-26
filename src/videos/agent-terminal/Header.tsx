// Шапка 90 px: пауза, название, бейдж, «сторінка N / 11», справа счётчики Чернетка / До людини / Зони: збіг.
// Всё от useCurrentFrame() (гейт 1); числа — из реестра screenNumbers() и счёта маршрутов results.json (timeline.routeCount).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { kick, seg } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { screenNumbers } from './data.ts';
import { int } from './format.ts';
import { C, FONT, L } from './theme.ts';
import { FPS, T, pageAt, routeCount, zonesShown } from './timeline.ts';

const Counter: React.FC<{ id: string; label: string; value: string; color: string; pop: number; note?: string; noteA?: number }> = ({ id, label, value, color, pop, note, noteA = 0 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 150 }}>
    <div style={{ fontFamily: FONT.ui, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>
      <Readable id={`${id}.label`} text={label}>
        {label}
      </Readable>
    </div>
    <div style={{ fontFamily: FONT.mono, fontSize: 30, fontWeight: 600, lineHeight: 1.1, color, fontVariantNumeric: 'tabular-nums', transform: `scale(${pop})`, transformOrigin: '100% 50%' }}>
      <Readable id={`${id}.value`} text={value}>
        {value}
      </Readable>
    </div>
    {note ? (
      <div style={{ fontFamily: FONT.ui, fontSize: 11, color: C.muted, opacity: noteA, marginTop: 2, whiteSpace: 'nowrap' }}>
        <Readable id={`${id}.note`} text={note}>
          {note}
        </Readable>
      </div>
    ) : null}
  </div>
);

export const Header: React.FC<{ fade: number }> = ({ fade }) => {
  const f = useCurrentFrame();
  const S = screenNumbers();
  const page = pageAt(f);
  const pageText = page === null ? S['page.none'] : page === 'sumy' ? 'зони · Суми' : S[`page.${page.n}`];
  const draft = routeCount(f, 'чернетка');
  const human = routeCount(f, 'до людини');
  const popOf = (last: number | null) => (last === null ? 1 : kick((f - last) / FPS, 0.16));
  const scaled = (n: number) => int(Math.round(n * fade)); // откат: к 0
  const zones = zonesShown(f);
  const title = 'Помічник кресляра · термінал';
  const badge = 'експеримент v0';
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: L.W, height: L.header, display: 'flex', alignItems: 'center', padding: `0 ${L.pad + 8}px`, boxSizing: 'border-box', borderBottom: `1px solid ${C.line}` }}>
      {/* кнопка «пауза» */}
      <div style={{ width: 34, height: 34, borderRadius: 17, border: `1.5px solid ${C.lineStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginRight: 18 }}>
        <div style={{ width: 3, height: 12, background: C.text, borderRadius: 1 }} />
        <div style={{ width: 3, height: 12, background: C.text, borderRadius: 1 }} />
      </div>
      <div style={{ fontFamily: FONT.title, fontSize: 21, fontWeight: 600, color: C.text, letterSpacing: '0.01em' }}>
        <Readable id="header.title" text={title}>
          {title}
        </Readable>
      </div>
      <div style={{ marginLeft: 18, fontFamily: FONT.ui, fontSize: 12, letterSpacing: '0.08em', color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 6, padding: '3px 9px 4px', opacity: 0.9 }}>
        <Readable id="header.badge" text={badge}>
          {badge}
        </Readable>
      </div>
      <div style={{ marginLeft: 22, fontFamily: FONT.mono, fontSize: 15, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
        <Readable id="header.page" text={pageText}>
          {pageText}
        </Readable>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 44 }}>
        <Counter id="counter.draft" label="Чернетка" value={scaled(draft.n)} color={C.teal} pop={popOf(draft.last)} />
        <Counter id="counter.human" label="До людини" value={scaled(human.n)} color={C.amber} pop={popOf(human.last)} />
        <Counter
          id="counter.zones"
          label="Зони: збіг"
          value={zones && fade > 0.5 ? S['zones.median'] : '—'}
          color={C.text}
          pop={zones ? kick((f - T.sumy.truthLog) / FPS, 0.16) : 1}
          note={S['zones.note']}
          noteA={zones ? seg(f, T.sumy.truthLog, T.sumy.truthLog + 10) * fade : 0}
        />
      </div>
    </div>
  );
};

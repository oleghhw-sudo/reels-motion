// Левая колонка 300 px: 8 модулей — имя, однострочный статус, иконка; активный в бирюзовой рамке, ПЕРЕВІРКА при провале мигает бурштином.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Readable } from '../../qa/Readable.tsx';
import { C, FONT, L } from './theme.ts';
import { MODULES, activeModule, checkFailing, moduleStatus, type ModuleId } from './timeline.ts';

const ICON: Record<ModuleId, string> = {
  accept: 'M3 6h18v12H3z M3 13h5l2 3h4l2-3h5',
  marks: 'M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z M12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  walls: 'M3 5h18 M3 10h18 M3 15h18 M3 20h18',
  outline: 'M4 4h11l5 5v11H4z M15 4v5h5',
  scale: 'M3 12h18 M6 9v6 M10 10v4 M14 10v4 M18 9v6',
  check: 'M4 12l5 5L20 6',
  zones: 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
  drafter: 'M4 20l4-1 11-11-3-3L5 16z M14 5l3 3',
};
const STATUS: Record<ReturnType<typeof moduleStatus>, { text: string; color: string }> = {
  wait: { text: 'очікує', color: C.muted },
  run: { text: 'працює', color: C.teal },
  done: { text: 'готово', color: C.muted },
  fail: { text: 'провал', color: C.amber },
};

export const ModuleRail: React.FC = () => {
  const f = useCurrentFrame();
  const rowH = (L.H - L.header - L.queue - L.pad * 2) / MODULES.length;
  const blink = Math.floor(f / 6) % 2 === 0;
  return (
    <div style={{ position: 'absolute', left: 0, top: L.header, width: L.rail, height: L.H - L.header - L.queue, borderRight: `1px solid ${C.line}`, padding: `${L.pad}px ${L.pad - 6}px`, boxSizing: 'border-box' }}>
      {MODULES.map((m) => {
        const st = moduleStatus(f, m.id);
        const active = activeModule(f) === m.id; // рамка только у активного; статус «провал» после штампа — текстом
        const failing = m.id === 'check' && checkFailing(f);
        const frame = failing ? (blink ? C.amber : 'rgba(224,163,68,0.25)') : active ? C.teal : 'transparent';
        const glyph = active ? (st === 'fail' ? C.amber : C.teal) : st === 'done' ? C.text : C.muted;
        return (
          <div key={m.id} style={{ height: rowH - 8, marginBottom: 8, borderRadius: 10, border: `1.5px solid ${frame}`, background: active ? C.panel : 'transparent', display: 'flex', alignItems: 'center', padding: '0 14px', boxSizing: 'border-box', gap: 14 }}>
            <svg width={26} height={26} style={{ flex: 'none' }} viewBox="0 0 24 24" fill="none" stroke={glyph} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON[m.id]} />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ fontFamily: FONT.ui, fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', color: active ? C.text : st === 'done' ? C.text : C.muted }}>
                <Readable id={`module.${m.id}`} text={m.name}>
                  {m.name}
                </Readable>
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, color: STATUS[st].color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: STATUS[st].color }}>{STATUS[st].text}</span>
                <span style={{ color: C.muted, opacity: 0.8 }}> · {m.hint}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

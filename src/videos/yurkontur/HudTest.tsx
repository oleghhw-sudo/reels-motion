// Задача 031, шаг 0 — дешёвый тест рендера: 5 с блока 5 «Увесь механізм» в полной плотности режима hud.
// 1920×1080@60, 300 кадров. Поле + частицы (canvas), схема (DOM/SVG), одна охровая нитка «поле картки → скан».
// Черновая композиция для замера времени кадра; не финальная сцена. Всё — функция useCurrentFrame() (гейт 1).
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { pathUpTo, seg, smoother, svgPath, through, type Pt } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { Field } from './Field.tsx';
import { CARD_FIELDS, EDGES, FLOW, LOOP_PATH, LOOP_STEPS, NODES, nodeById, type Node } from './schema.ts';
import { C, FONT, TEXTURE_ATTR } from './tokens.ts';

loadAllFonts();

export const HUD_TEST_FPS = 60;
export const HUD_TEST_FRAMES = 300;
export const hudTestSchema = z.object({ density: z.number().min(0.1).max(1) });
export type HudTestProps = z.infer<typeof hudTestSchema>;

/** Отрезок ребра между границами двух прямоугольных узлов (по центрам, обрезка по рамке). */
function edgeSegment(a: Node, b: Node): [Pt, Pt] {
  const clip = (n: Node, tx: number, ty: number): Pt => {
    const dx = tx - n.x;
    const dy = ty - n.y;
    const sx = dx ? n.w / 2 / Math.abs(dx) : Infinity;
    const sy = dy ? n.h / 2 / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return [n.x + dx * s, n.y + dy * s];
  };
  return [clip(a, b.x, b.y), clip(b, a.x, a.y)];
}

const NodeBox: React.FC<{ n: Node; active: boolean; t: number }> = ({ n, active, t }) => {
  const human = n.kind === 'human';
  const stroke = human ? C.accent : active ? C.ink : C.line2;
  const fill = active ? C.accentSoft : human ? 'rgba(39,81,74,0.06)' : 'rgba(249,243,232,0.82)';
  // лёгкое «дыхание» рамок активного узла — живой прибор, не статика
  const breathe = active ? 1 + 0.006 * Math.sin(t * 2.1) : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: n.x - n.w / 2,
        top: n.y - n.h / 2,
        width: n.w,
        height: n.h,
        transform: `scale(${breathe})`,
        border: `${active || human ? 1.5 : 1}px solid ${stroke}`,
        borderRadius: 6,
        background: fill,
        boxSizing: 'border-box',
        padding: '8px 10px',
        overflow: 'hidden',
      }}
    >
      {active ? (
        <div style={{ fontFamily: FONT.ui, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1.1, whiteSpace: 'nowrap' }} {...TEXTURE_ATTR}>
          {n.label}
        </div>
      ) : (
        <div style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, color: human ? C.accent : C.muted, opacity: human ? 0.9 : 0.75, whiteSpace: 'nowrap' }} {...TEXTURE_ATTR}>
          {n.label.toUpperCase()}
        </div>
      )}
      <div style={{ marginTop: 5, fontFamily: FONT.mono, fontSize: 11, color: C.muted, opacity: 0.6, lineHeight: 1.25 }} {...TEXTURE_ATTR}>
        {n.id === 'card' ? CARD_FIELDS.join(' · ') : n.detail}
      </div>
    </div>
  );
};

export const HudTest: React.FC<HudTestProps> = ({ density }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;

  // камера: один непрерывный кадр, медленный наезд к картке за 5 с
  const cam = smoother(seg(t, 0, 5));
  const camScale = 1 + 0.05 * cam;
  const card = nodeById('card');
  const camX = (960 - card.x) * 0.25 * cam;
  const camY = (540 - card.y) * 0.25 * cam;

  // нитка №1: поле «Ставка» картки тянется к своему источнику в узле «Скани» (прорисовка 1.0–2.6 с, бусина до 3.2 с)
  const scans = nodeById('scans');
  const fieldPt: Pt = [card.x - card.w / 2 + 14, card.y + 22];
  const threadPts = through(
    [fieldPt, [card.x - 160, card.y + 150], [960, 330], [scans.x + 140, scans.y - 120], [scans.x, scans.y - scans.h / 2]],
    14,
  );
  const draw = smoother(seg(t, 1.0, 2.6));
  const visible = pathUpTo(threadPts, draw);
  const head = visible[visible.length - 1];
  const bead = seg(t, 2.6, 3.2);

  const loopCurve = through(LOOP_PATH, 12);
  const loopDraw = smoother(seg(t, 0.2, 1.6));
  const loopVisible = pathUpTo(loopCurve, loopDraw);

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, color: C.ink, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `translate(${camX}px, ${camY}px) scale(${camScale})`, transformOrigin: '960px 540px' }}>
        <Field density={density} />
        {/* оболочка: ALI · модуль «Юр.контур» (фактура) */}
        <div style={{ position: 'absolute', left: 116, top: 64, right: 116, bottom: 64, border: `1px solid ${C.line}`, borderRadius: 10 }} />
        <div style={{ position: 'absolute', left: 134, top: 52, padding: '0 8px', background: C.paper, fontFamily: FONT.mono, fontSize: 12, letterSpacing: 1.2, color: C.muted, opacity: 0.7 }} {...TEXTURE_ATTR}>
          ALI · МОДУЛЬ «ЮР.КОНТУР» · КАРТКА АПТЕКИ
        </div>
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
          {EDGES.map(([a, b]) => {
            const [p, q] = edgeSegment(nodeById(a), nodeById(b));
            const human = a.startsWith('human') || b.startsWith('human');
            return <line key={`${a}-${b}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={human ? C.accent : C.ink} strokeWidth={human ? 1.2 : 1.4} opacity={human ? 0.6 : 0.5} strokeDasharray={human ? '4 5' : undefined} />;
          })}
          {/* петля навчання — пунктиром («так працюватиме»), прорисовывается */}
          <path d={svgPath(loopCurve)} fill="none" stroke={C.accent} strokeWidth={1} opacity={0.18} />
          <path d={svgPath(loopVisible)} fill="none" stroke={C.accent} strokeWidth={1.6} strokeDasharray="6 6" opacity={0.75} />
          {/* нитка №1: ставка → скан */}
          <path d={svgPath(visible)} fill="none" stroke={C.tight} strokeWidth={2.2} strokeLinecap="round" opacity={0.95} />
          {draw > 0.01 ? <circle cx={head[0]} cy={head[1]} r={4 + 2 * bead} fill={C.tight} opacity={1 - 0.4 * bead} /> : null}
          {bead >= 1 ? <rect x={scans.x - 34} y={scans.y - scans.h / 2 - 2} width={68} height={16} fill="none" stroke={C.tight} strokeWidth={1.6} rx={2} /> : null}
          <circle cx={fieldPt[0]} cy={fieldPt[1]} r={3.2} fill={C.tight} />
        </svg>
        {NODES.map((n) => (
          <NodeBox key={n.id} n={n} active={false} t={t} />
        ))}
        {/* подписи шагов петли — фактура */}
        {LOOP_STEPS.map((s, i) => {
          const k = (i + 0.5) / LOOP_STEPS.length;
          const idx = Math.round((1 - k) * (loopCurve.length - 1));
          const p = loopCurve[idx];
          const on = loopDraw >= 1 - k;
          return (
            <div key={s} style={{ position: 'absolute', left: p[0], top: p[1] + 10, transform: 'translate(-50%, 0)', fontFamily: FONT.mono, fontSize: 12, color: C.accent, opacity: on ? 0.75 : 0, whiteSpace: 'nowrap' }} {...TEXTURE_ATTR}>
              {s}
            </div>
          );
        })}
        {/* единственный читаемый текст кадра: подпись активного узла */}
        <div style={{ position: 'absolute', left: card.x, top: card.y + card.h / 2 + 18, transform: 'translate(-50%, 0)', fontFamily: FONT.ui, fontSize: 36, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', opacity: seg(t, 0.4, 0.9) }}>
          <Readable id="b5.card" text="Картка чинних умов">
            Картка чинних умов
          </Readable>
        </div>
        {/* индекс узлов потока у нижней кромки (фактура, как ряд меток на кольце референса) */}
        <div style={{ position: 'absolute', left: 140, bottom: 78, fontFamily: FONT.mono, fontSize: 11, letterSpacing: 1, color: C.muted, opacity: 0.55, whiteSpace: 'nowrap' }} {...TEXTURE_ATTR}>
          {FLOW.map((n, i) => `${String(i + 1).padStart(2, '0')} ${n.label.toUpperCase()}`).join('   ')}
        </div>
      </div>
    </AbsoluteFill>
  );
};

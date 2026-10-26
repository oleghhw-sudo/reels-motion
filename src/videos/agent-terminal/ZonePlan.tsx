// План Сум (real_examples.json → sumy): контур, вход, обвод С/У (stats.sumy.san_polygon_m), зоны g2 по очереди, поверх — контуры truth.
// Метры → экран: planMap (поворот + равномерный масштаб, без зеркала; вход снизу). Линейка «1 м» — тот же масштаб.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { seg, smooth } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { PACK, SUMY_KEY, ZONE_ORDER, planMap, screenNumbers, zoneRings, type Ring } from './data.ts';
import { NBSP, int } from './format.ts';
import { C, CANVAS, FONT, ZONE_LABEL } from './theme.ts';
import { T, zoneFrame } from './timeline.ts';

const BOX = { x: CANVAS.x + 130, y: CANVAS.y + 84, w: CANVAS.w - 260, h: CANVAS.h - 170 } as const;
const RULER_M = 1;
const M = planMap(BOX);
const SUMY = PACK.real[SUMY_KEY];
const SAN = PACK.stats[SUMY_KEY].san_polygon_m;

const pathOf = (rings: readonly Ring[]): string => rings.map((r) => `M${r.map((p) => M.map(p).join(',')).join('L')}Z`).join(' ');
const ringLen = (r: Ring): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = M.map(r[i]);
    const b = M.map(r[(i + 1) % r.length]);
    s += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return s;
};
const centroidPx = (r: Ring): [number, number] => {
  const pts = r.map(M.map);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const contourPath = pathOf(SUMY.contour);
const contourLen = SUMY.contour.reduce((s, r) => s + ringLen(r), 0);
const sanPath = pathOf(SAN);
const sanLen = SAN.reduce((s, r) => s + ringLen(r), 0);
const sanCaption = 'вхідні дані: обвід С/У';
const entLabel = 'вхід';
const rulerLabel = `${int(RULER_M)}${NBSP}м`;

export const ZonePlan: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  if (f < T.sumy.plan || opacity <= 0.001) return null;
  const S = screenNumbers();
  const drawP = smooth(seg(f, T.sumy.plan, T.sumy.plan + 20));
  const titleA = seg(f, T.sumy.plan + 4, T.sumy.plan + 16);
  const entA = seg(f, T.sumy.san, T.sumy.san + 8);
  const sanP = smooth(seg(f, T.sumy.san, T.sumy.san + 18));
  const sanCapA = seg(f, T.sumy.san + 10, T.sumy.san + 18);
  const truthP = smooth(seg(f, T.sumy.truth, T.sumy.truth + 24));
  const dimmed = 1 - 0.75 * seg(f, T.finale, T.finale + 24);
  const entVis = entA * (1 - seg(f, T.finale, T.finale + 12)); // под итоговой строкой вход не нужен // финал: план приглушён под итоговую строку
  const sanPts = SAN[0].map(M.map);
  const sanBox = { x0: Math.min(...sanPts.map((q) => q[0])), y1: Math.max(...sanPts.map((q) => q[1])) };
  const ruler = { x: BOX.x, y: BOX.y + BOX.h + 30 };
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: opacity * dimmed }}>
      <div style={{ position: 'absolute', left: CANVAS.x + 40, top: CANVAS.y + 24, fontFamily: FONT.ui, fontSize: 22, fontWeight: 600, color: C.text, opacity: titleA }}>
        <Readable id="sumy.title" text={S['sumy.title']}>
          {S['sumy.title']}
        </Readable>
      </div>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={CANVAS.x + CANVAS.w} height={CANVAS.y + CANVAS.h}>
        {/* зоны g2 по очереди: зал — от фасада вглубь (clip снизу вверх), остальные — проявление */}
        <defs>
          <clipPath id="zone-hall-clip">
            <rect x={M.bbox.x0 - 10} y={M.facadeY - (M.facadeY - M.bbox.y0 + 10) * smooth(seg(f, zoneFrame('trade_hall'), zoneFrame('trade_hall') + 20))} width={M.bbox.x1 - M.bbox.x0 + 20} height={(M.facadeY - M.bbox.y0 + 10) * smooth(seg(f, zoneFrame('trade_hall'), zoneFrame('trade_hall') + 20)) + 10} />
          </clipPath>
        </defs>
        {ZONE_ORDER.map((z) => {
          const at = zoneFrame(z);
          if (f < at) return null;
          const a = z === 'trade_hall' ? 1 : smooth(seg(f, at, at + 14));
          const rings = zoneRings(SUMY.g2, z);
          const c = centroidPx(rings[0]);
          return (
            <g key={z} clipPath={z === 'trade_hall' ? 'url(#zone-hall-clip)' : undefined} opacity={a}>
              <path d={pathOf(rings)} fill={C.zone[z]} fillOpacity={0.3} stroke={C.zone[z]} strokeWidth={1.8} strokeLinejoin="round" />
              <text x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT.ui} fontSize={17} fontWeight={600} fill={C.text}>
                {ZONE_LABEL[z]}
              </text>
            </g>
          );
        })}
        {/* контур приміщення */}
        <path d={contourPath} fill="none" stroke={C.text} strokeWidth={2.2} strokeLinejoin="round" strokeDasharray={contourLen} strokeDashoffset={contourLen * (1 - drawP)} opacity={0.9} />
        {/* фасад = стена с входом; вход */}
        <line x1={M.bbox.x0} y1={M.facadeY} x2={M.bbox.x1} y2={M.facadeY} stroke={C.teal} strokeWidth={4} opacity={entA * 0.8} />
        <circle cx={M.ent[0]} cy={M.ent[1]} r={8} fill={C.teal} opacity={entVis} />
        <text x={M.ent[0]} y={M.ent[1] + 30} textAnchor="middle" fontFamily={FONT.ui} fontSize={15} fill={C.teal} opacity={entVis}>
          {entLabel}
        </text>
        {/* обвод С/У — входные данные, пунктир бурштином */}
        {f >= T.sumy.san ? <path d={sanPath} fill="none" stroke={C.amber} strokeWidth={2.5} strokeDasharray={`${sanLen} ${sanLen}`} strokeDashoffset={sanLen * (1 - sanP)} style={{ strokeDasharray: sanP >= 1 ? '8 6' : `${sanLen} ${sanLen}` }} /> : null}
        {/* контуры зон креслярки (truth) поверх, тонко */}
        {f >= T.sumy.truth
          ? ZONE_ORDER.map((z) => {
              const rings = zoneRings(SUMY.truth, z);
              const len = rings.reduce((s, r) => s + ringLen(r), 0);
              return <path key={`truth-${z}`} d={pathOf(rings)} fill="none" stroke={C.text} strokeWidth={1.2} strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - truthP)} opacity={0.85} />;
            })
          : null}
        {/* линейка 1 м */}
        <g opacity={drawP}>
          <line x1={ruler.x} y1={ruler.y} x2={ruler.x + M.s * RULER_M} y2={ruler.y} stroke={C.muted} strokeWidth={2} />
          <line x1={ruler.x} y1={ruler.y - 6} x2={ruler.x} y2={ruler.y + 6} stroke={C.muted} strokeWidth={2} />
          <line x1={ruler.x + M.s * RULER_M} y1={ruler.y - 6} x2={ruler.x + M.s * RULER_M} y2={ruler.y + 6} stroke={C.muted} strokeWidth={2} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: ruler.x + (M.s * RULER_M) / 2, top: ruler.y + 10, transform: 'translateX(-50%)', fontFamily: FONT.mono, fontSize: 13, color: C.muted, opacity: drawP }}>
        <Readable id="sumy.ruler" text={rulerLabel}>
          {rulerLabel}
        </Readable>
      </div>
      <div style={{ position: 'absolute', left: sanBox.x0, top: sanBox.y1 + 10, fontFamily: FONT.ui, fontSize: 15, color: C.amber, opacity: sanCapA, whiteSpace: 'nowrap', background: 'rgba(11,15,20,0.7)', padding: '3px 8px', borderRadius: 5 }}>
        <Readable id="sumy.san.caption" text={sanCaption}>
          {sanCaption}
        </Readable>
      </div>
      {f >= T.sumy.truth + 6 ? (
        <div style={{ position: 'absolute', left: CANVAS.x + 40, top: CANVAS.y + 60, fontFamily: FONT.mono, fontSize: 15, color: C.teal, opacity: seg(f, T.sumy.truthLog, T.sumy.truthLog + 10) }}>
          <Readable id="sumy.truth.caption" text={S['sumy.truth']}>
            {S['sumy.truth']}
          </Readable>
        </div>
      ) : null}
    </div>
  );
};

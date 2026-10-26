// Центр: полотно со сканом страницы и накладками шагов (кадры frames/OXX/0N_*.png), сканер, контур, линии масштаба/проверки,
// плашки результатов, штамп «ДО ЛЮДИНИ». Координаты линий и контура — из geometry.json минус crop (data.ts).
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { Stamp } from '../../fx/index.ts';
import { seg, smooth } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { PAGE_FAIL, PAGE_FULL, frameSize, outlineOnFrame, sanRoomOnFrame, screenNumbers, segOnFrame } from './data.ts';
import { C, CANVAS, FONT } from './theme.ts';
import { FPS, PASS_ORDER, T, passFrame } from './timeline.ts';

/** Коробка кадра внутри полотна: сверху отступ, снизу полоса плашек. */
const BOX = { x: CANVAS.x + 40, y: CANVAS.y + 24, w: CANVAS.w - 80, h: CANVAS.h - 128 } as const;
const BAND_Y = BOX.y + BOX.h + 14;
const src = (id: string, img: string) => staticFile(`videos/agent-terminal/frames/${id}/${img}.png`);

type Shot = { from: number; id: string; img: string; fadeIn: number };
const SHOTS: Shot[] = [
  { from: T.o02.accept, id: PAGE_FULL, img: '01_input', fadeIn: 12 },
  { from: T.o02.outline, id: PAGE_FULL, img: '04_outline', fadeIn: 8 },
  { from: T.o02.area, id: PAGE_FULL, img: '05_rooms', fadeIn: 8 },
  ...PASS_ORDER.map((id, i) => ({ from: passFrame(i), id, img: '01_input', fadeIn: 4 })),
  { from: T.o07.mark, id: PAGE_FAIL, img: '02_mark', fadeIn: 8 },
  { from: T.o07.outline, id: PAGE_FAIL, img: '04_outline', fadeIn: 8 },
];

/** Положение кадра страницы в коробке: O02/O07 — натуральный размер по центру (под накладки); остальные — вписать. */
const place = (id: string): { left: number; top: number; w: number; h: number; natural: boolean } => {
  if (id === PAGE_FULL || id === PAGE_FAIL) {
    const { w, h } = frameSize(id);
    return { left: BOX.x + (BOX.w - w) / 2, top: BOX.y + (BOX.h - h) / 2, w, h, natural: true };
  }
  return { left: BOX.x, top: BOX.y, w: BOX.w, h: BOX.h, natural: false };
};

const Frame: React.FC<{ id: string; img: string; opacity: number; clip?: string }> = ({ id, img, opacity, clip }) => {
  const p = place(id);
  return (
    <Img src={src(id, img)} style={{ position: 'absolute', left: p.left, top: p.top, width: p.w, height: p.h, objectFit: 'contain', opacity, clipPath: clip, borderRadius: 4 }} />
  );
};

const polyLen = (pts: [number, number][], closed: boolean): number => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return s;
};

/** Линия с засечками и подписью; p — прорисовка 0..1; label появляется после прорисовки. */
const DimLine: React.FC<{ id: string; seg: [[number, number], [number, number]]; p: number; label: string; color: string; labelA: number }> = ({ id, seg: sg, p, label, color, labelA }) => {
  const [[x0, y0], [x1, y1]] = sg;
  const vertical = Math.abs(x1 - x0) < Math.abs(y1 - y0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const tick = 9;
  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
        {p > 0.02 ? <line x1={vertical ? x0 - tick : x0} y1={vertical ? y0 : y0 - tick} x2={vertical ? x0 + tick : x0} y2={vertical ? y0 : y0 + tick} stroke={color} strokeWidth={3} strokeLinecap="round" /> : null}
        {p >= 0.98 ? <line x1={vertical ? x1 - tick : x1} y1={vertical ? y1 : y1 - tick} x2={vertical ? x1 + tick : x1} y2={vertical ? y1 : y1 + tick} stroke={color} strokeWidth={3} strokeLinecap="round" /> : null}
      </svg>
      <div style={{ position: 'absolute', left: vertical ? x0 - 14 : mx, top: vertical ? my : y0 - 14, transform: vertical ? 'translate(-100%, -50%)' : 'translate(-50%, -100%)', opacity: labelA, fontFamily: FONT.mono, fontSize: 19, fontWeight: 600, color, background: 'rgba(11,15,20,0.78)', padding: '3px 9px 4px', borderRadius: 6, whiteSpace: 'nowrap' }}>
        <Readable id={id} text={label}>
          {label}
        </Readable>
      </div>
    </>
  );
};

const Plate: React.FC<{ id: string; text: string; color: string; a: number; row: number }> = ({ id, text, color, a, row }) => (
  <div style={{ position: 'absolute', left: CANVAS.x + CANVAS.w / 2, top: BAND_Y + row * 44, transform: `translate(-50%, ${(1 - a) * 8}px)`, opacity: a, fontFamily: FONT.mono, fontSize: 19, fontWeight: 600, color, background: 'rgba(11,15,20,0.85)', border: `1px solid ${color}`, borderRadius: 8, padding: '6px 16px 7px', whiteSpace: 'nowrap' }}>
    <Readable id={id} text={text}>
      {text}
    </Readable>
  </div>
);

/** Накладки одной страницы (O02 или O07) в координатах кадра; from — кадры событий, until — когда снять. */
const PageOverlays: React.FC<{ id: string; ok: boolean; outlineAt: number; outlineDur: number; scaleAt: number; checkAt: number; areaAt: number; sanAt?: number; until: number }> = ({ id, ok, outlineAt, outlineDur, scaleAt, checkAt, areaAt, sanAt, until }) => {
  const f = useCurrentFrame();
  if (f < outlineAt || f >= until) return null;
  const S = screenNumbers();
  const P = place(id);
  const key = id === PAGE_FULL ? 'o02' : 'o07';
  const outline = outlineOnFrame(id);
  const oLen = polyLen(outline, true);
  const oP = smooth(seg(f, outlineAt, outlineAt + outlineDur));
  const resultColor = ok ? C.teal : C.amber;
  const mark = ok ? '✓' : '✗';
  const lineDur = 12;
  return (
    <div style={{ position: 'absolute', left: P.left, top: P.top, width: P.w, height: P.h }}>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={P.w} height={P.h}>
        <polygon points={outline.map((q) => q.join(',')).join(' ')} fill="none" stroke={C.teal} strokeWidth={3.5} strokeLinejoin="round" strokeDasharray={oLen} strokeDashoffset={oLen * (1 - oP)} opacity={0.95} />
        {sanAt !== undefined && f >= sanAt ? <polygon points={sanRoomOnFrame().map((q) => q.join(',')).join(' ')} fill="rgba(224,163,68,0.18)" stroke={C.amber} strokeWidth={2.5} strokeDasharray="7 6" opacity={seg(f, sanAt, sanAt + 8)} /> : null}
      </svg>
      {f >= scaleAt ? <DimLine id={`${key}.scale.label`} seg={segOnFrame(id, 'primary')} p={smooth(seg(f, scaleAt, scaleAt + lineDur))} label={S[`${key}.scale.label`]} color={C.amber} labelA={seg(f, scaleAt + lineDur, scaleAt + lineDur + 6)} /> : null}
      {f >= checkAt ? <DimLine id={`${key}.check.label`} seg={segOnFrame(id, 'check')} p={smooth(seg(f, checkAt, checkAt + lineDur))} label={S[`${key}.check.label`]} color={C.text} labelA={seg(f, checkAt + lineDur, checkAt + lineDur + 6)} /> : null}
      {/* плашки результатов — в полосе под кадром (координаты полотна, поэтому компенсируем смещение кадра) */}
      <div style={{ position: 'absolute', left: -P.left, top: -P.top }}>
        {f >= checkAt + lineDur + 4 ? <Plate id={`${key}.check.result`} text={`${mark} ${S[`${key}.check.result`]}`} color={resultColor} a={seg(f, checkAt + lineDur + 4, checkAt + lineDur + 12)} row={0} /> : null}
        {f >= areaAt + 4 ? <Plate id={`${key}.area`} text={`${mark} ${S[`${key}.area`]}`} color={resultColor} a={seg(f, areaAt + 4, areaAt + 12)} row={1} /> : null}
      </div>
    </div>
  );
};

export const ScanCanvas: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  if (f < T.o02.accept || opacity <= 0.001) return null;
  // текущий и предыдущий план (кроссфейд)
  let k = -1;
  for (let i = 0; i < SHOTS.length; i++) if (SHOTS[i].from <= f) k = i;
  const cur = SHOTS[k];
  const prev = k > 0 ? SHOTS[k - 1] : null;
  const curA = seg(f, cur.from, cur.from + cur.fadeIn);
  // сканер стен O02: 03_walls раскрывается сверху вниз, линия на границе
  const scanning = f >= T.o02.walls && f < T.o02.outline;
  const scanP = smooth(seg(f, T.o02.walls, T.o02.walls + 30));
  const P2 = place(PAGE_FULL);
  const stampT = (f - T.o07.stamp) / FPS;
  const stampText = 'ДО ЛЮДИНИ';
  const P7 = place(PAGE_FAIL);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity }}>
      {prev && curA < 1 ? <Frame id={prev.id} img={prev.img} opacity={1} /> : null}
      <Frame id={cur.id} img={cur.img} opacity={curA} />
      {scanning ? (
        <>
          <Frame id={PAGE_FULL} img="03_walls" opacity={1} clip={`inset(0 0 ${(1 - scanP) * 100}% 0)`} />
          <div style={{ position: 'absolute', left: P2.left, top: P2.top + scanP * P2.h - 1, width: P2.w, height: 2, background: C.teal, boxShadow: `0 0 18px 4px rgba(47,209,195,0.55)` }} />
        </>
      ) : null}
      <PageOverlays id={PAGE_FULL} ok outlineAt={T.o02.outline} outlineDur={36} scaleAt={T.o02.scale} checkAt={T.o02.check} areaAt={T.o02.area} sanAt={T.o02.san} until={T.pass.from} />
      <PageOverlays id={PAGE_FAIL} ok={false} outlineAt={T.o07.outline} outlineDur={18} scaleAt={T.o07.scale} checkAt={T.o07.check} areaAt={T.o07.area} until={T.sumy.plan + 12} />
      {f >= T.o07.stamp && f < T.sumy.plan + 12 ? (
        <Stamp t={stampT} origin="50% 50%" style={{ left: P7.left + P7.w / 2, top: P7.top + P7.h / 2, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', transform: 'translate(-50%, -50%) rotate(-8deg)', fontFamily: FONT.title, fontWeight: 800, fontSize: 66, letterSpacing: '0.06em', color: C.red, border: `6px solid ${C.red}`, borderRadius: 12, padding: '10px 30px 14px', whiteSpace: 'nowrap', background: 'rgba(11,15,20,0.35)', boxShadow: '0 0 0 2px rgba(11,15,20,0.5) inset' }}>
            <Readable id="o07.stamp" text={stampText}>
              {stampText}
            </Readable>
          </div>
        </Stamp>
      ) : null}
    </div>
  );
};

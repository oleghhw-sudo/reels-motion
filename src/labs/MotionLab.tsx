// Лаборатория функций движения src/motion: по плитке на функцию, всё — функция кадра (5 с, 30 fps).
// События повторяются каждые 1.25 с (4 цикла), чтобы на любом кадре было видно действие.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fontStack, loadAllFonts } from '../theme/loadFonts.ts';
import {
  EASINGS,
  T80,
  arcPt,
  beatN,
  frac,
  gridFromBeat,
  jump,
  kick,
  onTwos,
  pathUpTo,
  pulse,
  ribbon,
  shakeXY,
  squashScale,
  svgPath,
  take,
  through,
  type Pt,
} from '../motion/index.ts';

loadAllFonts();

export const MOTION_LAB_FRAMES = 150;
const CYCLE = 1.25; // с
const BG = '#17161a';
const INK = '#efeae0';
const ACC = '#d9a05b';
const MUTE = '#6f6a63';
const TILE_W = 540;
const TILE_H = 1920 / 5;

const Tile: React.FC<{ i: number; title: string; note: string; children: React.ReactNode }> = ({ i, title, note, children }) => (
  <div
    style={{
      position: 'absolute',
      left: (i % 2) * TILE_W,
      top: Math.floor(i / 2) * TILE_H,
      width: TILE_W,
      height: TILE_H,
      boxSizing: 'border-box',
      borderRight: i % 2 === 0 ? `1px solid ${MUTE}` : undefined,
      borderBottom: `1px solid ${MUTE}`,
      overflow: 'hidden',
    }}
  >
    <div style={{ position: 'absolute', left: 24, top: 18, fontFamily: fontStack('JetBrainsMono'), fontSize: 30, color: INK }}>{title}</div>
    <div style={{ position: 'absolute', left: 24, bottom: 16, fontFamily: fontStack('JetBrainsMono'), fontSize: 20, color: MUTE }}>{note}</div>
    {children}
  </div>
);

const Dot: React.FC<{ x: number; y: number; r?: number; color?: string; sx?: number; sy?: number }> = ({ x, y, r = 34, color = ACC, sx = 1, sy = 1 }) => (
  <div
    style={{
      position: 'absolute',
      left: x - r,
      top: y - r,
      width: 2 * r,
      height: 2 * r,
      borderRadius: '50%',
      background: color,
      transform: `scale(${sx}, ${sy})`,
      transformOrigin: '50% 100%',
    }}
  />
);

export const MotionLab: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tc = frac(t / CYCLE) * CYCLE; // время внутри цикла
  const cx = TILE_W / 2;
  const cy = TILE_H / 2 + 10;

  // jump: отрыв 0.3, посадка 0.8
  const j = jump(tc, 0.3, 0.8, 120);
  const js = squashScale(j.sq);
  // take: пик 0.3
  const tk = take(tc, 0.3, 1);
  const ts = squashScale(tk.sq);
  // pulse: сетка ролика beauty (доля 0.488 с, первая доля 0.065)
  const G = gridFromBeat(0.488, 0.065);
  const pl = pulse(t, G);
  // shake: тот же seed; справа — на двойках
  const [shx, shy] = shakeXY(frame, 1, 18);
  const tw = onTwos(frame, fps);
  const [s2x, s2y] = shakeXY(tw, 1, 18);
  // arc
  const ak = Math.min(1, tc / 0.9);
  const [ax, ay] = arcPt([70, cy + 70], [TILE_W - 70, cy + 70], 160, ak);
  // ribbon / through
  const P: Pt[] = [
    [60, cy + 80],
    [180, cy - 70],
    [330, cy + 60],
    [480, cy - 50],
  ];
  const path = through(P, 12);
  const drawn = pathUpTo(path, Math.min(1, tc / 0.9));
  const rib = ribbon(P, 26, 4, 12);

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Tile i={0} title="ring / kick" note="k=6 w=18, пинок на событии">
        <div
          style={{
            position: 'absolute',
            left: cx - 70,
            top: cy - 70,
            width: 140,
            height: 140,
            background: ACC,
            transform: `scale(${kick(tc - 0.2, 0.35)})`,
            fontFamily: fontStack('Onest'),
            fontSize: 80,
            color: BG,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Math.floor(t / CYCLE) + 1}
        </div>
      </Tile>
      <Tile i={1} title="jump" note="присед → парабола → сплющивание">
        <div style={{ position: 'absolute', left: 60, right: 60, top: cy + 104, height: 2, background: MUTE }} />
        <Dot x={cx} y={cy + 70 + j.dy} sx={js.sx} sy={js.sy} />
      </Tile>
      <Tile i={2} title="take" note="удивление с пиком в 0.3 с">
        <div style={{ position: 'absolute', left: 60, right: 60, top: cy + 104, height: 2, background: MUTE }} />
        <Dot x={cx} y={cy + 70 + tk.dy * 60} sx={ts.sx} sy={ts.sy} />
      </Tile>
      <Tile i={3} title={`pulse · доля ${beatN(t, G)}`} note="сетка 0.488 с, offset 0.065">
        <Dot x={cx} y={cy} r={40 + 50 * pl} color={ACC} />
      </Tile>
      <Tile i={4} title="shakeXY" note="hash(кадр, seed), ±18 px">
        <Dot x={cx + shx} y={cy + shy} r={40} />
      </Tile>
      <Tile i={5} title="onTwos + shakeXY" note={`кадр ${frame} → держим ${tw}`}>
        <Dot x={cx + s2x} y={cy + s2y} r={40} />
      </Tile>
      <Tile i={6} title="arcPt" note="бросок, подъём 160 px">
        <svg width={TILE_W} height={TILE_H} style={{ position: 'absolute', inset: 0 }}>
          <path d={svgPath(Array.from({ length: 41 }, (_, i) => arcPt([70, cy + 70], [TILE_W - 70, cy + 70], 160, i / 40)))} stroke={MUTE} strokeWidth={2} fill="none" strokeDasharray="6 8" />
        </svg>
        <Dot x={ax} y={ay} r={26} />
      </Tile>
      <Tile i={7} title="through / ribbon" note="Catmull-Rom, лента 26→4 px">
        <svg width={TILE_W} height={TILE_H} style={{ position: 'absolute', inset: 0 }}>
          <path d={svgPath(rib, true)} fill={MUTE} opacity={0.5} />
          <path d={svgPath(drawn)} stroke={ACC} strokeWidth={6} fill="none" strokeLinecap="round" />
          {P.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={7} fill={INK} />
          ))}
        </svg>
      </Tile>
      <Tile i={8} title="easing по t80" note="expo .23 quint .28 cubic .42 smoother .67">
        {Object.entries(EASINGS).map(([name, e], k) => {
          const x = 70 + e(Math.min(1, tc / 1.0)) * (TILE_W - 140);
          const y = 92 + k * 58;
          return (
            <React.Fragment key={name}>
              <div style={{ position: 'absolute', left: 70, right: 70, top: y, height: 2, background: MUTE }} />
              <div style={{ position: 'absolute', left: 70 + 0.8 * (TILE_W - 140), top: y - 14, width: 2, height: 30, background: MUTE }} />
              <Dot x={x} y={y} r={14} />
              <div style={{ position: 'absolute', left: 24, top: y - 26, fontFamily: fontStack('JetBrainsMono'), fontSize: 16, color: INK }}>
                {name} {T80[name as keyof typeof T80]}
              </div>
            </React.Fragment>
          );
        })}
      </Tile>
      <Tile i={9} title="таймкод" note="цикл событий 1.25 с">
        <div style={{ position: 'absolute', left: 24, top: cy - 40, fontFamily: fontStack('JetBrainsMono'), fontSize: 56, color: INK }}>
          {t.toFixed(2)} с · f{frame}
        </div>
      </Tile>
    </AbsoluteFill>
  );
};

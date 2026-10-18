// Лаборатория ядра «живой анимации» (задача 011-А): spring/tokens/sync/camera/move из src/motion. 1080×1920, 60 fps, 4.5 с.
// У всех плиток смена состояния в 0.5 / 1.5 / 2.5 / 3.5 с — стиллы f97 (середина движения после 1.5 с) и f144 (конец) покрывают все плитки.
// Только именованные токены SPR.* / E.*; всё — функция кадра.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fontStack, loadAllFonts } from '../theme/loadFonts.ts';
import { seg } from '../motion/index.ts';
import { ctrack, step, track, type Key, type SpringConfig } from '../motion/spring.ts';
import { E, SPR, hitPulse } from '../motion/tokens.ts';
import { at, type Grid } from '../motion/sync.ts';
import { breath, camera, worldTransform, type CameraKey } from '../motion/camera.ts';
import { center, move, swapIn, type Rect } from '../motion/move.ts';

loadAllFonts();

export const MOTION_LAB_KIT_FPS = 60;
export const MOTION_LAB_KIT_FRAMES = 270;
const BG = '#17161a';
const INK = '#efeae0';
const ACC = '#d9a05b';
const MUTE = '#6f6a63';
const TILE_H = 1920 / 5;
const EV = [0.5, 1.5, 2.5, 3.5]; // с — смены цели во всех плитках

const Tile: React.FC<{ i: number; title: string; note: string; children: React.ReactNode }> = ({ i, title, note, children }) => (
  <div style={{ position: 'absolute', left: 0, top: i * TILE_H, width: 1080, height: TILE_H, boxSizing: 'border-box', borderBottom: `1px solid ${MUTE}`, overflow: 'hidden' }}>
    {children}
    <div style={{ position: 'absolute', left: 32, top: 22, fontFamily: fontStack('JetBrainsMono'), fontSize: 30, color: INK }}>{title}</div>
    <div style={{ position: 'absolute', left: 32, bottom: 18, fontFamily: fontStack('JetBrainsMono'), fontSize: 20, color: MUTE }}>{note}</div>
  </div>
);

// Край индикатора на своей пружине: ведущий край (по направлению движения) — на быстрой, отстающий — на медленной.
const edge = (t: number, keys: readonly Key[], side: 'left' | 'right', lead: SpringConfig, lag: SpringConfig): number => {
  let v = keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    const d = keys[k][1] - keys[k - 1][1];
    const leading = side === 'right' ? d > 0 : d < 0;
    v += d * step(t - keys[k][0], leading ? lead : lag);
  }
  return v;
};

export const MotionLabKit: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;

  // 1. track: точка 4 раза меняет цель (SPR.snap — посадка с малым перелётом), цвет — ctrack в OKLab (SPR.firm)
  const dotX = track(t, [[0, 140], [EV[0], 940], [EV[1], 320], [EV[2], 800], [EV[3], 540]], SPR.snap);
  const dotC = ctrack(t, [[0, ACC], [EV[0], '#3b7bff'], [EV[1], '#2edba8'], [EV[2], '#d62828'], [EV[3], ACC]], SPR.firm);

  // 2. пилюля таба: два края на разных пружинах (ведущий SPR.micro, отстающий SPR.firm) — тянется в пути
  const TAB_W = 210;
  const TAB_X = [75, 315, 555, 795];
  const tabKeys = (dx: number): Key[] => [[0, TAB_X[0] + dx], [EV[0], TAB_X[2] + dx], [EV[1], TAB_X[1] + dx], [EV[2], TAB_X[3] + dx], [EV[3], TAB_X[0] + dx]];
  const pl = edge(t, tabKeys(0), 'left', SPR.micro, SPR.firm);
  const pr = edge(t, tabKeys(TAB_W), 'right', SPR.micro, SPR.firm);

  // 3. magic move: квадрат → полоса (1.5 с) → квадрат (3.5 с), SPR.glide; содержимое полосы — блюр-свап
  const SQ: Rect = { x: 120, y: 140, w: 150, h: 150 };
  const STRIP: Rect = { x: 340, y: 190, w: 640, h: 56 };
  const mm = t < EV[3] ? move(t, EV[1], SQ, STRIP) : move(t, EV[3], move(EV[3], EV[1], SQ, STRIP), SQ);
  const radius = Math.min(mm.h / 2, 28 + (mm.w - SQ.w) * 0.02);
  const sw = swapIn(t, EV[1], EV[3]);
  const mc = center(mm);

  // 4. камера: наезд ×2.4 на карточку (1.5 с), возврат (3.5 с), SPR.camera; в паузах — «дыхание» +2.5 %
  const CK: CameraKey[] = [[0, 540, 192, 1], [EV[1], 760, 210, 2.4], [EV[3], 540, 192, 1]];
  const cam = camera(t, CK);
  const holdA = breath(E.dolly(seg(t, 0, EV[1])));
  const holdB = breath(E.dolly(seg(t, EV[1] + 0.9, EV[3])));
  const settleB = 1 - step(t - EV[3], SPR.camera);
  const breathK = t < EV[1] ? 1 + (holdA - 1) * (1 - step(t - EV[1], SPR.camera)) : 1 + (holdB - 1) * settleB;
  const view = { ...cam, zoom: cam.zoom * breathK };

  // 5. hitPulse на доле 120 BPM (сетка тактов), сильная доля — сильнее
  const G: Grid = { bpm: 120, firstBeat: 0, pickupBeats: 0, beatsPerBar: 4 };
  let hp = 0;
  let beatNo = 0;
  for (let bar = 1; bar <= 3; bar++) {
    for (let beat = 1; beat <= 4; beat++) {
      const bt = at(G, bar, beat);
      if (t >= bt) beatNo = (bar - 1) * 4 + beat;
      hp = Math.max(hp, (beat === 1 ? 0.3 : 0.18) * hitPulse(t - bt));
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Tile i={0} title="track + ctrack" note="4 смены цели · SPR.snap · цвет в OKLab (SPR.firm)">
        <div style={{ position: 'absolute', left: 80, right: 80, top: 230, height: 2, background: MUTE }} />
        {[140, 940, 320, 800, 540].map((x, k) => (
          <div key={k} style={{ position: 'absolute', left: x - 1, top: 214, width: 2, height: 34, background: MUTE }} />
        ))}
        <div style={{ position: 'absolute', left: dotX - 42, top: 189, width: 84, height: 84, borderRadius: '50%', background: dotC }} />
      </Tile>
      <Tile i={1} title="пилюля таба" note="края на micro (ведущий) / firm (отстающий)">
        {TAB_X.map((x, k) => (
          <div key={k} style={{ position: 'absolute', left: x, top: 170, width: TAB_W, height: 90, borderRadius: 45, border: `2px solid ${MUTE}`, boxSizing: 'border-box' }} />
        ))}
        <div style={{ position: 'absolute', left: pl, top: 170, width: pr - pl, height: 90, borderRadius: 45, background: ACC }} />
      </Tile>
      <Tile i={2} title="magic move" note="квадрат → полоса · SPR.glide · swapIn">
        <div style={{ position: 'absolute', left: mm.x, top: mm.y, width: mm.w, height: mm.h, borderRadius: radius, background: ACC }} />
        {sw.visible && (
          <div style={{ position: 'absolute', left: mc.x - 150, top: mc.y - 9, width: 300, height: 18, opacity: sw.opacity, filter: sw.filter, display: 'flex', justifyContent: 'space-between' }}>
            {[0, 1, 2, 3, 4].map((k) => (
              <div key={k} style={{ width: 18, height: 18, borderRadius: 9, background: BG }} />
            ))}
          </div>
        )}
      </Tile>
      <Tile i={3} title={`камера · zoom ${view.zoom.toFixed(2)}`} note="ключи на SPR.camera, зум в лог-пространстве + breath">
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: worldTransform(view, { width, height: TILE_H }) }}>
          {Array.from({ length: 13 * 5 }, (_, k) => (
            <div key={k} style={{ position: 'absolute', left: 40 + (k % 13) * 84 - 3, top: 40 + Math.floor(k / 13) * 76 - 3, width: 6, height: 6, borderRadius: 3, background: MUTE }} />
          ))}
          <div style={{ position: 'absolute', left: 700, top: 180, width: 120, height: 60, borderRadius: 12, background: ACC }} />
        </div>
      </Tile>
      <Tile i={4} title={`hitPulse · 120 BPM · доля ${beatNo}`} note="четверть синуса 2 к/60 → exp τ 5 к/60 · сильная доля +30 %">
        <div style={{ position: 'absolute', left: 540 - 60, top: 200 - 60, width: 120, height: 120, borderRadius: '50%', background: ACC, transform: `scale(${1 + hp})` }} />
      </Tile>
    </AbsoluteFill>
  );
};

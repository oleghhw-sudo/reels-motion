// Аутро MIA v4 (задача 030): карточка «Досье / скан», переезд рамки lockCarry, огонёк lightMatch.
// Данные — outro.v4-picks.yaml (card.style: dossier, in: lockCarry | lightMatch) + assets.v4.manifest.json (prepare-v4.mjs).
// Всё — функция useCurrentFrame() (гейт 1). Часы фаз карточки — dossierClock (model.ts), общие с раскладкой звука v4.
//
// Карточка (k — кадр от начала карточки, n — длина):
//   фриз — кадр-источник вырезки поверх последнего кадра предыдущего плана, микс freeze.mixFrames кадров; наезд punchIn в момент остановки;
//   скан — линия сверху вниз за scan.durFrames: выше линии фон уже «досье» (монохром, затемнение, размытие, сетка), ниже — замерший кадр
//          в цвете (так монохром входит без отдельного приёма); фигура из вырезки всё время в цвете;
//   рамка — уголки защёлкиваются на лице за lock.snapFrames (с середины скана; при lockCarry — переезжают с рамки живого плана);
//   label — печатается после защёлкивания по charFrames кадра на символ, подчёркивание цветом героя;
//   имя — огромное, за фигурой; параллакс: фон / имя / фигура наезжают на depth.push · depth.* к концу карточки.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Readable } from '../../qa/Readable.tsx';
import { fontFor } from '../../theme/fonts.ts';
import { seg } from '../../motion/index.ts';
import { E } from '../../motion/tokens.ts';
import { LEAD, leadIn } from '../../fx/index.ts';
import { dossierClock, type CardDossier, type Placed } from './model.ts';
import { MANIFEST_V4, assetV4, type Rect } from './script.ts';

type Orient = 'land' | 'port';
/** Поля под текст (как TXT v3): справа — с запасом под наезд и правую safe zone 9:16 (140 px). */
const MARGIN = { land: { left: 90, right: 200, nameTop: 0.36 }, port: { left: 80, right: 185, nameTop: 0 } } as const;
/** Safe zone сверху (ARCHITECTURE «Правила дизайна»; readcheck применяет её к обеим ориентациям). */
const SAFE_TOP = 220;
/** Моноширинный JetBrains Mono: ширина символа 0.6 em. */
const MONO_EM = 0.6;

const scaleAbout = (r: Rect, o: { x: number; y: number }, s: number): Rect => ({ x: o.x + (r.x - o.x) * s, y: o.y + (r.y - o.y) * s, w: r.w * s, h: r.h * s });
const lerpRect = (a: Rect, b: Rect, q: number): Rect => ({ x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q, w: a.w + (b.w - a.w) * q, h: a.h + (b.h - a.h) * q });
/** Рамка лица: прямоугольник Vision с полями 12 %. */
const pad = (r: Rect, k = 0.12): Rect => ({ x: r.x - r.w * k, y: r.y - r.h * k, w: r.w * (1 + 2 * k), h: r.h * (1 + 2 * k) });

/** Четыре уголка рамки (длина 22 % стороны), обводка strokePx цветом героя. */
export const Corners: React.FC<{ r: Rect; color: string; stroke: number; opacity?: number }> = ({ r, color, stroke, opacity = 1 }) => {
  const l = Math.min(r.w, r.h) * 0.22;
  const { x, y, w, h } = r;
  const d = [
    `M${x},${y + l}V${y}H${x + l}`,
    `M${x + w - l},${y}H${x + w}V${y + l}`,
    `M${x + w},${y + h - l}V${y + h}H${x + w - l}`,
    `M${x + l},${y + h}H${x}V${y + h - l}`,
  ].join('');
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', opacity }}>
      <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="square" />
    </svg>
  );
};

/** Защёлкивание: рамка сжимается от 1.5× к лицу за snap кадров (E.out), проявляется за первый кадр. */
const snapRect = (face: Rect, j: number, snap: number): { r: Rect; o: number } => {
  const q = E.out(seg(j, 0, snap));
  const c = { x: face.x + face.w / 2, y: face.y + face.h / 2 };
  return { r: scaleAbout(face, c, 1.5 - 0.5 * q), o: seg(j, -1, 0.5) };
};

// ---------------------------------------------------------------- lockCarry: рамка на кисти в последних snap кадрах живого плана
/** Рамка кисти (manifest.carry) на кадре pos исходника; в координатах экрана с учётом наезда LeadIn плана (ramp). */
export function carryRectAt(hero: string, orient: Orient, pos: number, leadP: number, W: number, H: number): Rect {
  const rs = MANIFEST_V4.carry[hero][orient];
  let a = rs[0];
  let b = rs[rs.length - 1];
  for (let i = 0; i + 1 < rs.length; i++) if (pos >= rs[i].pos && pos <= rs[i + 1].pos) { a = rs[i]; b = rs[i + 1]; }
  const q = b.pos > a.pos ? Math.min(1, Math.max(0, (pos - a.pos) / (b.pos - a.pos))) : 0;
  const r = pos <= rs[0].pos ? rs[0] : pos >= rs[rs.length - 1].pos ? rs[rs.length - 1] : lerpRect(a, b, q);
  // LeadIn: scale(zoom) от LEAD.origin ('55% 42%')
  const [ox, oy] = LEAD.origin.split(' ').map((v) => parseFloat(v) / 100);
  return pad(scaleAbout(r, { x: ox * W, y: oy * H }, leadIn(leadP, LEAD).zoom), 0.08);
}

/** Уголки на кисти в последних snapFrames кадрах живого плана перед карточкой с in: lockCarry. */
export const CarryOut: React.FC<{ hero: string; orient: Orient; n: number; card: CardDossier; accent: string; posAt: (k: number) => number; ramp: boolean }> = ({ hero, orient, n, card, accent, posAt, ramp }) => {
  const k = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const start = n - card.lock.snapFrames;
  if (k < start) return null;
  const r = carryRectAt(hero, orient, posAt(k), ramp ? (n > 1 ? k / (n - 1) : 1) : 0, W, H);
  const s = snapRect(r, k - start, card.lock.snapFrames);
  return <Corners r={s.r} color={accent} stroke={card.lock.strokePx} opacity={s.o} />;
};

// ---------------------------------------------------------------- lightMatch: огонёк заряда растёт кругом в последнюю долю затишья
/** В последние beatFrames кадров пункта: красный круг из точки огонька (manifest.light, координаты плана заряда) растёт до кадра целиком. */
export const LightGrow: React.FC<{ n: number; beatFrames: number; orient: Orient }> = ({ n, beatFrames, orient }) => {
  const k = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const L = MANIFEST_V4.light.final;
  if (!L) return null;
  const start = n - beatFrames;
  if (k < start) return null;
  const { x, y, r: r0 } = L[orient];
  const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y));
  const q = E.in(seg(k, start, n - 1)); // к последнему кадру затишья круг закрывает кадр, удар h9 — вспышка финала
  const r = r0 + (R - r0) * q;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${x}px ${y}px, rgba(255,40,30,${0.95}) 0px, rgba(255,40,30,0.9) ${r * 0.55}px, rgba(255,60,40,0.35) ${r}px, rgba(255,60,40,0) ${r * 1.6}px)`, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- карточка «досье»
export const DossierCard: React.FC<{
  p: Placed & { kind: 'card' };
  card: CardDossier;
  orient: Orient;
  name: string;
  /** Последний кадр предыдущего плана (под миксом фриза). */
  under: React.ReactNode;
  /** lockCarry: рамка кисти на последнем кадре предыдущего плана (экран). */
  carryFrom: Rect | null;
  /** Текст на выходном смазе — полупрозрачный (как v3). */
  textO: (k: number) => number;
}> = ({ p, card, orient, name, under, carryFrom, textO }) => {
  const k = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const n = p.endFrame - p.startFrame;
  const C = MANIFEST_V4.cards[p.hero];
  const lay = C[orient];
  const accent = card.accent[p.hero];
  const ck = dossierClock(card, !!carryFrom, C.label.length);
  const M = MARGIN[orient];

  // камера: наезд punchIn в момент остановки + параллакс трёх слоёв от центра лица
  const o = { x: lay.face.x + lay.face.w / 2, y: lay.face.y + lay.face.h / 2 };
  const punch = 1 + card.freeze.punchIn * E.out(seg(k, 0, ck.mixEnd + 2));
  const push = card.depth.push * E.dolly(seg(k, 0, n));
  const sc = (depth: number) => punch * (1 + push * depth);
  const tf = (depth: number): React.CSSProperties => ({ position: 'absolute', inset: 0, transform: `scale(${sc(depth)})`, transformOrigin: `${o.x}px ${o.y}px` });

  const mix = Math.min(1, (k + 1) / card.freeze.mixFrames);
  const scanQ = seg(k, ck.scanStart, ck.scanEnd);
  const lineY = scanQ * H;
  const scanning = k >= ck.scanStart && k < ck.scanEnd;

  // имя за фигурой: размер heightFrac·H, но не шире поля (9:16 — по ширине); проявляется после фриза без удара
  const left = p.side === 'left';
  const size = Math.min(card.name.heightFrac * H, (W - M.left - M.right) / C.nameEm);
  // верх имени не выше safe zone (220 px) и при наибольшем наезде слоя имени (масштаб от центра лица тянет верх вверх)
  const maxSc = (1 + card.freeze.punchIn) * (1 + card.depth.push * card.depth.name);
  const safeTop = o.y + (SAFE_TOP + 4 - o.y) / maxSc;
  const nameTop = Math.max(orient === 'land' ? M.nameTop * H - size * 0.55 : SAFE_TOP + 20, safeTop);
  const nameO = E.outSoft(seg(k, ck.mixEnd, ck.mixEnd + 6)) * textO(k);

  // рамка: экранные координаты лица (слой фигуры)
  const faceScr = scaleAbout(pad(lay.face), o, sc(card.depth.figure));
  let lock: { r: Rect; o: number } | null = null;
  if (carryFrom) {
    const q = E.out(seg(k, 0, card.lock.snapFrames));
    lock = { r: lerpRect(carryFrom, faceScr, q), o: 1 };
  } else if (k >= ck.lockStart) lock = snapRect(faceScr, k - ck.lockStart, card.lock.snapFrames);

  // label: над рамкой, в пределах полей и safe zone 9:16
  const full = C.label;
  // размер label — heightFrac·H, но строка не шире поля (9:16, JAX: 35 символов) — тогда по ширине
  const fs = Math.min(card.label.heightFrac * H, (W - M.left - M.right) / (full.length * MONO_EM));
  const shown = card.label.typeOn ? full.slice(0, Math.max(0, Math.min(full.length, Math.floor((k - ck.labelStart + 1) / card.label.charFrames)))) : k >= ck.labelStart ? full : '';
  const lw = full.length * MONO_EM * fs;
  const lx = Math.max(M.left, Math.min(W - M.right - lw, faceScr.x));
  const ly = Math.max(SAFE_TOP + 4, faceScr.y - fs * 2.1);
  const done = shown.length === full.length;

  const img = (src: string, style: React.CSSProperties) => <Img src={staticFile(assetV4(src))} style={{ position: 'absolute', ...style }} />;
  const fade = lay.fadeTop ? `linear-gradient(to bottom, transparent 0px, #000 120px)` : undefined;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {mix < 1 ? under : null}
      <AbsoluteFill style={{ opacity: mix }}>
        {/* фон: замерший кадр в цвете; выше линии скана — «досье» */}
        <div style={tf(card.depth.bg)}>
          {img(lay.bgColor, { left: 0, top: 0, width: W, height: H })}
        </div>
        {k >= ck.scanStart ? (
          <AbsoluteFill style={{ clipPath: scanning ? `inset(0 0 ${H - lineY}px 0)` : undefined }}>
            <div style={tf(card.depth.bg)}>{img(lay.bgDossier, { left: 0, top: 0, width: W, height: H })}</div>
          </AbsoluteFill>
        ) : null}
        {/* имя — за фигурой */}
        {card.name.behindFigure ? (
          <div style={tf(card.depth.name)}>
            <div style={{ position: 'absolute', top: nameTop, ...(left ? { left: M.left } : { right: M.right, textAlign: 'right' }), opacity: nameO, fontFamily: fontFor('Anton', name), fontSize: size, lineHeight: 1.0, // 1.0: Anton — заглавная латиница без выносных; 16:9 — 0.42·H между safe zones 220 и 380 px
                color: '#ffffff', whiteSpace: 'nowrap' }}>
              <Readable id={`${p.hero}.name`} text={name}>{name}</Readable>
            </div>
          </div>
        ) : null}
        {/* фигура в цвете */}
        <div style={tf(card.depth.figure)}>{img(lay.figure, { left: lay.fig.x, top: lay.fig.y, width: lay.fig.w, height: lay.fig.h, maskImage: fade, WebkitMaskImage: fade })}</div>
      </AbsoluteFill>
      {/* линия скана */}
      {scanning ? <div style={{ position: 'absolute', left: 0, width: W, top: lineY - 1, height: 2, background: accent, opacity: card.scan.alpha, boxShadow: `0 0 ${card.scan.glowPx * 4}px ${card.scan.glowPx}px ${accent}` }} /> : null}
      {lock ? <Corners r={lock.r} color={accent} stroke={card.lock.strokePx * (Math.min(W, H) / 1080)} opacity={lock.o} /> : null}
      {shown ? (
        <div style={{ position: 'absolute', left: lx, top: ly, fontFamily: fontFor('JetBrainsMono', full), fontWeight: 500, fontSize: fs, lineHeight: 1.2, color: '#ffffff', whiteSpace: 'pre', opacity: textO(k), textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {done ? <Readable id={`${p.hero}.label`} text={full}>{full}</Readable> : shown}
          <div style={{ height: Math.max(2, fs * 0.08), marginTop: fs * 0.15, width: shown.length * MONO_EM * fs, background: accent }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

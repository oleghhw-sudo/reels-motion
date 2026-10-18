// Аутро MIA «знакомство с героями» — 16:9 (MiaOutro) и 9:16 (MiaOutroVertical), props {episode}.
// Всё — из videos/mia-outro/outro.yaml (таймлайн серии на ударах music.hits) и assets.manifest.json; всё в кадре — функция кадра.
// Движение — только токены src/motion (E.*, SPR.*, hitPulse, step); текст — через <Readable> и fontFor (защита latinOnly).
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { fontFor } from '../../theme/fonts.ts';
import { Readable } from '../../qa/Readable.tsx';
import { clamp, seg } from '../../motion/index.ts';
import { step } from '../../motion/spring.ts';
import { E, SPR, hitPulse } from '../../motion/tokens.ts';
import type { Placed, Zone } from './model.ts';
import { MANIFEST, OUTRO, asset, liveKey, timelineFor } from './script.ts';
import { CROP_VARIANTS, type CropVariant } from './vertical.ts';

loadAllFonts();

export const miaOutroSchema = z.object({
  episode: z.string(),
  /** Вариант кропа живых планов в 9:16 (стиллы для выбора Олегом); по умолчанию A. */
  verticalCrop: z.enum(['A', 'B', 'C']).optional(),
  /** Только для позитивного контроля проверки зон: подложенный запретный интервал обязан уронить сборку. */
  qaInjectForbidden: z.array(z.object({ src: z.string(), from: z.number(), to: z.number() })).optional(),
});
export type MiaOutroProps = z.infer<typeof miaOutroSchema>;
type Orient = 'land' | 'port';

export const MIA_FPS = OUTRO.format.fps;
const injected = (p: MiaOutroProps): Zone[] => (p.qaInjectForbidden ?? []).map((z) => ({ ...z, reason: 'ПОДЛОЖЕНО (props qaInjectForbidden)', origin: 'props' }));
/** Длительность — из данных серии; здесь же проверка зон (нарушение → исключение → сборка падает). */
export const miaOutroMetadata = ({ props }: { props: MiaOutroProps }) => ({ durationInFrames: timelineFor(props.episode, injected(props)).durationInFrames });

const SNAP_TEXT = { ...SPR.snap, clamp: true }; // защёлкивание без перелёта: на тексте перелёта нет никогда
const INK = '#ffffff';

// ---------------------------------------------------------------- зерно (seed-тайлы, смена «на двойках»)
const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const f = useCurrentFrame();
  const tile = MANIFEST.grain[Math.floor(f / 2) % MANIFEST.grain.length];
  return <AbsoluteFill style={{ backgroundImage: `url(${staticFile(asset(tile))})`, backgroundSize: '512px 512px', opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }} />;
};

// ---------------------------------------------------------------- живой план: кадры исходника 1:1, дольше — держится последний
const LiveVideo: React.FC<{ p: Placed; orient: Orient; crop: CropVariant; style?: React.CSSProperties }> = ({ p, orient, crop, style }) => {
  const f = useCurrentFrame();
  const { width: W } = useVideoConfig();
  const key = liveKey(p.srcFrames!);
  const L = MANIFEST.live[key];
  const src = staticFile(asset(orient === 'land' ? L.land : L.port));
  let box: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' };
  if (orient === 'port') {
    const cx = CROP_VARIANTS[key]?.[crop] ?? 0.5;
    const left = clamp(W / 2 - cx * L.portW, W - L.portW, 0);
    box = { position: 'absolute', left, top: 0, width: L.portW, height: L.portH };
  }
  return (
    <Freeze frame={L.frames - 1} active={f >= L.frames}>
      <OffthreadVideo src={src} muted style={{ ...box, ...style }} />
    </Freeze>
  );
};

const Live: React.FC<{ p: Placed; orient: Orient; crop: CropVariant }> = (a) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <LiveVideo {...a} />
    <Grain />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- затишье: дверь ангара, наезд на dolly
const Lull: React.FC<{ p: Placed & { kind: 'lull' }; orient: Orient; crop: CropVariant }> = ({ p, orient, crop }) => {
  const f = useCurrentFrame();
  const n = p.endFrame - p.startFrame;
  const k = 1 + p.push * E.dolly(f / n);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${k})`, transformOrigin: '50% 50%' }}>
        <LiveVideo p={p} orient={orient} crop={crop} />
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- карточка героя (эталон MIA_cards_concept_v2.jpg)
const TXT = {
  land: { left: 90, right: 160, num: { top: 232, size: 48 }, name: { top: 266, size: 240 }, tag: { top: 600, size: 60 } },
  port: { left: 80, right: 160, num: { top: 252, size: 44 }, name: { top: 288, size: 230 }, tag: { top: 610, size: 56 } },
} as const;

const Rays: React.FC<{ cx: number; cy: number; n: number; color: string; alpha: number; deg: number }> = ({ cx, cy, n, color, alpha, deg }) => {
  const R = 4000;
  const tris = Array.from({ length: n }, (_, i) => {
    const a0 = (2 * Math.PI * i) / n + (deg * Math.PI) / 180;
    const a1 = a0 + Math.PI / n;
    return `M${cx},${cy}L${cx + R * Math.cos(a0)},${cy + R * Math.sin(a0)}L${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)}Z`;
  }).join('');
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <path d={tris} fill={color} fillOpacity={alpha} />
    </svg>
  );
};

const Card: React.FC<{ p: Placed & { kind: 'card' }; orient: Orient; num: number }> = ({ p, orient, num }) => {
  const f = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = f / fps;
  const n = p.endFrame - p.startFrame;
  const C = MANIFEST.cards[p.hero];
  const lay = C.layout[orient];
  const T = TXT[orient];
  const name = OUTRO.names[p.hero] ?? p.title;
  const tag = p.tagline.toUpperCase();
  const left = p.side === 'left';
  const dir = -1; // въезд изнутри кадра у правых имён, из-за левого края — у левых: правая safe zone не задевается
  // фигура: вход ударом (hitPulse), наезд 3 % за удержание (dolly); лёгкое обесцвечивание/контраст стоп-кадра
  const figK = (1 + 0.03 * E.dolly(f / n)) * (1 + 0.05 * hitPulse(t));
  // имя: SPR.snap без перелёта; подпись — следом через 0.18 с, плашка раскрывается по E.out
  const sn = step(t - 0.04, SNAP_TEXT);
  const tq = E.out(seg(t, 0.18, 0.18 + 0.22));
  const cx = orient === 'land' ? (left ? W * 0.72 : W * 0.28) : W * 0.5;
  const cy = orient === 'land' ? H * 0.5 : H * 0.66;
  const anchor: React.CSSProperties = left ? { left: T.left } : { right: T.right, textAlign: 'right' };
  const layer = (src: string, extra: React.CSSProperties = {}) => (
    <img src={staticFile(asset(src))} style={{ position: 'absolute', left: 0, top: 0, width: lay.w, height: lay.h, ...extra }} />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden' }}>
      <Rays cx={cx} cy={cy} n={OUTRO.card.bg.rays} color={C.rays} alpha={C.raysAlpha} deg={6 * t} />
      {OUTRO.card.bg.halftone ? (
        <img src={staticFile(asset(C.bgLayer[orient]))} style={{ position: 'absolute', left: -12 + 8 * t, top: 0, width: W, height: H }} />
      ) : null}
      <div
        style={{
          position: 'absolute', left: lay.x, top: lay.y, width: lay.w, height: lay.h, transform: `scale(${figK})`, transformOrigin: '50% 100%',
          // 9:16: верхний срез кадром исходника виден — растворяем его в фон, а не рисуем прямую линию с обводкой
          ...(orient === 'port' && C.touches.top ? { maskImage: `linear-gradient(to bottom, transparent ${lay.pad}px, #000 ${lay.pad + 120}px)`, WebkitMaskImage: `linear-gradient(to bottom, transparent ${lay.pad}px, #000 ${lay.pad + 120}px)` } : {}),
        }}
      >
        {layer(lay.black, { transform: `translate(${lay.shadow[0]}px, ${lay.shadow[1]}px)`, filter: 'brightness(0)' })}
        {layer(lay.black)}
        {layer(lay.white)}
        {layer(lay.figure, { filter: 'saturate(0.92) contrast(1.06)' })}
      </div>
      <Grain opacity={0.05} />
      <div style={{ position: 'absolute', top: T.num.top, ...anchor, opacity: clamp(sn * 2), fontFamily: fontFor('Oswald', `#${num}`), fontSize: T.num.size, color: C.bg === '#1E1E1E' || C.bg.toLowerCase() === '#1e1e1e' ? INK : '#000', lineHeight: 1 }}>
        <Readable id={`${p.hero}.num`} text={`#${num}`}>#{num}</Readable>
      </div>
      <div
        style={{
          position: 'absolute',
          top: T.name.top,
          ...anchor,
          transform: `translateX(${(1 - sn) * dir * 160}px)`,
          opacity: clamp(sn * 2),
          fontFamily: fontFor('Anton', name),
          fontSize: T.name.size,
          lineHeight: 1.1,
          color: INK,
          WebkitTextStroke: '8px #000',
          paintOrder: 'stroke fill',
          textShadow: '14px 14px 0 #000',
          whiteSpace: 'nowrap',
        }}
      >
        <Readable id={`${p.hero}.name`} text={name}>{name}</Readable>
      </div>
      <div
        style={{
          position: 'absolute',
          top: T.tag.top,
          ...anchor,
          clipPath: left ? `inset(0 ${(1 - tq) * 100}% 0 0)` : `inset(0 0 0 ${(1 - tq) * 100}%)`,
          background: '#000',
          padding: '4px 18px 6px',
          fontFamily: fontFor('Oswald', tag),
          fontWeight: 500,
          fontSize: T.tag.size,
          lineHeight: 1.2,
          color: p.tagColor ?? C.bg,
          whiteSpace: 'nowrap',
        }}
      >
        <Readable id={`${p.hero}.tagline`} text={tag}>{tag}</Readable>
      </div>
      {f < 2 ? <AbsoluteFill style={{ backgroundColor: '#fff' }} /> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- финал: удар = взрыв (вспышка), название крупно, строка и хвост в звоне
const Final: React.FC<{ p: Placed & { kind: 'final' }; orient: Orient; crop: CropVariant }> = ({ p, orient, crop }) => {
  const f = useCurrentFrame();
  const { fps, height: H } = useVideoConfig();
  const t = f / fps;
  const n = p.endFrame - p.startFrame;
  const title = p.title;
  const sn = step(t - 0.08, SNAP_TEXT);
  const titleK = 1 + 0.08 * hitPulse(t - 0.08); // ≤ +10 %
  const lineQ = E.outSoft(seg(t, 0.2, 0.2 + 0.5));
  const tailQ = E.outSoft(seg(t, 0.6, 0.6 + 0.5));
  const flash = p.flash ? (f < 2 ? 1 : 1 - E.smooth(seg(t, 2 / fps, 2 / fps + 0.35))) : 0;
  // 16:9: блок целиком выше нижней safe zone (380 px); 9:16: центр левее правой зоны (140 px)
  const S = orient === 'land' ? { title: 240, line: 52, tail: 34, y: 236, w: 1500, right: 0 } : { title: 260, line: 54, tail: 36, y: H * 0.29, w: 760, right: 140 };
  const lineTxt = p.line;
  const tailTxt = p.tail.toUpperCase();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${1 + 0.03 * E.dolly(f / n)})`, filter: 'brightness(0.32) saturate(0.6)' }}>
        <LiveVideo p={p} orient={orient} crop={crop} />
      </AbsoluteFill>
      <Grain />
      <div style={{ position: 'absolute', left: 0, right: S.right, top: S.y, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            opacity: clamp(sn * 2),
            transform: `translateY(${(1 - sn) * 40}px) scale(${titleK})`,
            fontFamily: fontFor('Anton', title),
            fontSize: S.title,
            lineHeight: 1.1,
            color: INK,
            WebkitTextStroke: '8px #000',
            paintOrder: 'stroke fill',
            textShadow: '14px 14px 0 #000',
          }}
        >
          <Readable id="final.title" text={title}>{title}</Readable>
        </div>
        <div style={{ marginTop: 22, maxWidth: S.w, opacity: lineQ, transform: `translateY(${(1 - lineQ) * 18}px)`, fontFamily: fontFor('Oswald', lineTxt), fontWeight: 500, fontSize: S.line, lineHeight: 1.25, color: INK, textWrap: 'balance' }}>
          <Readable id="final.line" text={lineTxt}>{lineTxt}</Readable>
        </div>
        <div style={{ marginTop: 24, opacity: tailQ, transform: `translateY(${(1 - tailQ) * 14}px)`, fontFamily: fontFor('Oswald', tailTxt), fontWeight: 400, fontSize: S.tail, letterSpacing: '0.24em', color: '#F7C600' }}>
          <Readable id="final.tail" text={tailTxt}>{tailTxt}</Readable>
        </div>
      </div>
      {flash > 0 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flash }} /> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- композиции
const MiaOutroBase: React.FC<MiaOutroProps & { orient: Orient }> = (props) => {
  const { orient } = props;
  const crop: CropVariant = props.verticalCrop ?? 'A';
  const tl = useMemo(() => timelineFor(props.episode, injected(props)), [props]);
  let cardNo = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {tl.items.map((p) => {
        const dur = p.endFrame - p.startFrame;
        const name = `${p.index} ${p.kind}${p.kind === 'card' ? ` ${p.hero}` : p.srcFrames ? ` ${liveKey(p.srcFrames)}` : ''}`;
        let body: React.ReactNode;
        if (p.kind === 'card') body = <Card p={p} orient={orient} num={++cardNo} />;
        else if (p.kind === 'lull') body = <Lull p={p} orient={orient} crop={crop} />;
        else if (p.kind === 'final') body = <Final p={p} orient={orient} crop={crop} />;
        else body = <Live p={p} orient={orient} crop={crop} />;
        return (
          <Sequence key={p.index} from={p.startFrame} durationInFrames={dur} name={name}>
            {body}
          </Sequence>
        );
      })}
      <Audio src={staticFile(asset(MANIFEST.music.mixes[props.episode].file))} />
    </AbsoluteFill>
  );
};

export const MiaOutro: React.FC<MiaOutroProps> = (p) => <MiaOutroBase {...p} orient="land" />;
export const MiaOutroVertical: React.FC<MiaOutroProps> = (p) => <MiaOutroBase {...p} orient="port" />;

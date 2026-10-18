// Аутро MIA «знакомство с героями», динамика v2 — 16:9 (MiaOutro) и 9:16 (MiaOutroVertical), props {episode}.
// Данные — videos/mia-outro/outro.yaml (таймлайн на ударах music.hits, in: whip, ramp) и assets.manifest.json.
// Тайминги приёмов — спецификация docs/tasks/data/008-proto-rook-card.py, переписана на src/motion (SPR/E, step) и
// rand(seed); всё в кадре — функция useCurrentFrame() (гейт 1). Текст — <Readable> + fontFor (защита latinOnly).
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Freeze, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { fontFor } from '../../theme/fonts.ts';
import { Readable } from '../../qa/Readable.tsx';
import { clamp, seg } from '../../motion/index.ts';
import { step } from '../../motion/spring.ts';
import { E, SPR, rand } from '../../motion/tokens.ts';
import { livePos, type Placed, type Timeline, type Zone } from './model.ts';
import { MANIFEST, OUTRO, asset, liveKey, timelineFor } from './script.ts';
import { CROP_VARIANTS, cropFor, type CropVariant } from './vertical.ts';
import { Filters, Grain, Vignette, White, filterCss, shake } from './fx.tsx';

loadAllFonts();

export const miaOutroSchema = z.object({
  episode: z.string(),
  /** Вариант кропа ВСЕХ живых планов в 9:16 (стиллы для выбора); без него — outro.yaml vertical.crops, иначе B. */
  verticalCrop: z.enum(['A', 'B', 'C']).optional(),
  /** Только для позитивного контроля проверки зон: подложенный запретный интервал обязан уронить сборку. */
  qaInjectForbidden: z.array(z.object({ src: z.string(), from: z.number(), to: z.number() })).optional(),
});
export type MiaOutroProps = z.infer<typeof miaOutroSchema>;
type Orient = 'land' | 'port';

export const MIA_FPS = OUTRO.format.fps;
const injected = (p: MiaOutroProps): Zone[] => (p.qaInjectForbidden ?? []).map((z) => ({ ...z, reason: 'ПОДЛОЖЕНО (props qaInjectForbidden)', origin: 'props' }));
/** Длительность — из данных серии (музыка + holdAfter); здесь же проверка зон (нарушение → исключение → сборка падает). */
export const miaOutroMetadata = ({ props }: { props: MiaOutroProps }) => ({ durationInFrames: timelineFor(props.episode, injected(props)).durationInFrames });

const INK = '#ffffff';
/** Приём входа пункта (in: whip) — есть не у всех видов пунктов. */
const inOf = (p: Placed): string | undefined => ('in' in p ? p.in : undefined);
const IMPACT_RED = '#E1140A';

type Ctx = { orient: Orient; crop: (key: string) => CropVariant; tl: Timeline };
/** Склейки: направление смаза на входе/выходе пункта (±1, 0 — без смаза). */
type Cuts = { inDir: number; outDir: number; outIsCard: boolean };

// ---------------------------------------------------------------- кадр исходника (Freeze на позиции, межкадровое смешивание #038)
const SrcFrame: React.FC<{ k2: string; orient: Orient; crop: CropVariant; frame: number; opacity?: number }> = ({ k2, orient, crop, frame, opacity = 1 }) => {
  const { width: W } = useVideoConfig();
  const L = MANIFEST.live[k2];
  let box: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' };
  if (orient === 'port') {
    const cx = CROP_VARIANTS[k2]?.[crop] ?? 0.5;
    box = { position: 'absolute', left: clamp(W / 2 - cx * L.portW, W - L.portW, 0), top: 0, width: L.portW, height: L.portH };
  }
  return (
    <Freeze frame={Math.max(0, Math.min(L.frames - 1, frame))} active>
      <OffthreadVideo src={staticFile(asset(orient === 'land' ? L.land : L.port))} muted style={{ ...box, opacity }} />
    </Freeze>
  );
};

/** Кадр исходника на дробной позиции: смешивание двух соседних. */
const SrcAt: React.FC<{ k2: string; orient: Orient; crop: CropVariant; pos: number }> = ({ pos, ...a }) => {
  const i0 = Math.floor(pos + 1e-6);
  const fr = pos - i0;
  return (
    <>
      <SrcFrame {...a} frame={i0} />
      {fr > 0.02 ? <SrcFrame {...a} frame={i0 + 1} opacity={fr} /> : null}
    </>
  );
};

/** Последний показанный кадр пункта (вспышка удара и ч/б-подложка под раскрытием карточки). */
const lastShown = (p: Placed): { key: string; pos: number } | null => {
  if (!p.srcFrames || p.kind === 'card') return null;
  const key = liveKey(p.srcFrames);
  const L = MANIFEST.live[key];
  const n = p.endFrame - p.startFrame;
  return { key, pos: p.kind === 'live' ? livePos(n - 1, n, L.frames, !!p.ramp) : Math.min(n - 1, L.frames - 1) };
};

// ---------------------------------------------------------------- обёртка пункта: смаз-склейки (#043)
const Cut: React.FC<{ id: string; n: number; cuts: Cuts; children: React.ReactNode }> = ({ id, n, cuts, children }) => {
  const f = useCurrentFrame();
  let px = 0;
  let dir = 0;
  let dark = 0;
  if (cuts.inDir && f < 2) {
    px = [120, 60][f];
    dir = cuts.inDir;
  }
  if (cuts.outDir) {
    const tail = cuts.outIsCard ? 3 : 2;
    const k = f - (n - tail); // 0..tail-1
    if (k >= 0) {
      px = cuts.outIsCard ? 90 * (k + 1) : [60, 120][k];
      dir = cuts.outDir;
      if (cuts.outIsCard) dark = 0.22 * (k + 1);
    }
  }
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      <Filters id={`${id}-cut`} ca={0} smear={px} />
      <AbsoluteFill style={{ filter: filterCss(`${id}-cut`, 0, px), transform: px ? `translateX(${dir * px * 0.35}px)` : undefined }}>{children}</AbsoluteFill>
      {dark > 0 ? <AbsoluteFill style={{ backgroundColor: '#000', opacity: dark }} /> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- живой план: ramp-подвод к удару
const Live: React.FC<{ p: Placed & { kind: 'live' }; ctx: Ctx; toHit: boolean }> = ({ p, ctx, toHit }) => {
  const f = useCurrentFrame();
  const n = p.endFrame - p.startFrame;
  const key = liveKey(p.srcFrames!);
  const L = MANIFEST.live[key];
  const pos = livePos(f, n, L.frames, !!p.ramp);
  // подвод (ramp): наезд 1→1.16 ease-in, насыщенность 1→0.4, контраст 1.05→1.3, хроматика до 10 px; засветка 35/70 % за 2 кадра до удара
  const q = p.ramp ? E.in(n > 1 ? f / (n - 1) : 1) : 0;
  const zoom = 1 + 0.16 * q;
  const ca = 10 * q;
  const white = p.ramp && toHit ? (f === n - 2 ? 0.35 : f === n - 1 ? 0.7 : 0) : 0;
  const id = `live${p.index}`;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Filters id={id} ca={ca} smear={0} />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: '55% 42%', filter: filterCss(id, ca, 0, p.ramp ? `saturate(${1 - 0.6 * q}) contrast(${1.05 + 0.25 * q})` : '') }}>
        <SrcAt k2={key} orient={ctx.orient} crop={ctx.crop(key)} pos={pos} />
      </AbsoluteFill>
      <Vignette />
      <Grain />
      <White a={white} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- затишье: дверь, наезд 4 %, к последней доле — вибрация 0→4 px
const Lull: React.FC<{ p: Placed & { kind: 'lull' }; ctx: Ctx }> = ({ p, ctx }) => {
  const f = useCurrentFrame();
  const n = p.endFrame - p.startFrame;
  const key = liveKey(p.srcFrames!);
  const k = 1 + p.push * E.dolly(f / n);
  const amp = 4 * seg(f, n - 11, n);
  const vx = (rand(`lull:${f}:x`) * 2 - 1) * amp;
  const vy = (rand(`lull:${f}:y`) * 2 - 1) * amp;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${vx}px, ${vy}px) scale(${k})` }}>
        <SrcAt k2={key} orient={ctx.orient} crop={ctx.crop(key)} pos={Math.min(f, MANIFEST.live[key].frames - 1)} />
      </AbsoluteFill>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- карточка героя: удар → impact-кадры → раскрытие кругом
const TXT = {
  // right — с запасом под наезд камеры +3.5 % и тряску: правые имена не заходят в правую safe zone (140 px)
  land: { left: 90, right: 200, num: { top: 240, size: 48 }, name: { top: 266, size: 240 }, tag: { top: 600, size: 60 } },
  port: { left: 80, right: 185, num: { top: 252, size: 44 }, name: { top: 288, size: 230 }, tag: { top: 610, size: 56 } },
} as const;

const Rays: React.FC<{ cx: number; cy: number; n: number; color: string; alpha: number; rad: number; half?: number }> = ({ cx, cy, n, color, alpha, rad, half }) => {
  const R = 4000;
  const w = half ?? Math.PI / n / 2;
  const d = Array.from({ length: n }, (_, i) => {
    const a0 = (2 * Math.PI * i) / n + rad;
    return `M${cx},${cy}L${cx + R * Math.cos(a0 - w)},${cy + R * Math.sin(a0 - w)}L${cx + R * Math.cos(a0 + w)},${cy + R * Math.sin(a0 + w)}Z`;
  }).join('');
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <path d={d} fill={color} fillOpacity={alpha} />
    </svg>
  );
};

/** Имя-слэм: 1.9→1 на SPR.slam (перелёт — решение «Динамика v2»), шлейф из 2 копий только первые 2 кадра (#008). */
const Slam: React.FC<{ id: string; text: string; size: number; k: number; align: React.CSSProperties; top: number; origin: string }> = ({ id, text, size, k, align, top, origin }) => {
  const { fps } = useVideoConfig();
  if (k < 0) return null;
  const t = k / fps;
  const sc = 1 + 0.9 * (1 - step(t, SPR.slam));
  const style = (s: number, o: number): React.CSSProperties => ({
    position: 'absolute',
    top,
    ...align,
    transform: `scale(${s})`,
    transformOrigin: origin, // растёт от края якоря — не вылетает за кадр
    opacity: o,
    fontFamily: fontFor('Anton', text),
    fontSize: size,
    lineHeight: 1.1,
    color: INK,
    WebkitTextStroke: '8px #000',
    paintOrder: 'stroke fill',
    textShadow: '14px 14px 0 #000',
    whiteSpace: 'nowrap',
  });
  const trail = t <= 0.09 ? [2, 1] : [];
  return (
    <>
      {trail.map((gi) => (
        <div key={gi} aria-hidden style={style(sc * (1 + 0.18 * gi * Math.max(0, 1 - t * 6)), gi === 2 ? 70 / 255 : 130 / 255)}>
          {text}
        </div>
      ))}
      {/* полётные кадры (масштаб > 1.3, ≈2 кадра) — полупрозрачно, как смазанное: так и видится, readcheck не считает их чтением */}
      <div style={style(sc, sc > 1.3 ? 0.45 : 1)}>
        <Readable id={id} text={text}>{text}</Readable>
      </div>
    </>
  );
};

const Card: React.FC<{ p: Placed & { kind: 'card' }; ctx: Ctx; num: number; prev: { key: string; pos: number } | null; outWhip: boolean }> = ({ p, ctx, num, prev, outWhip }) => {
  const k = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = k / fps;
  const n = p.endFrame - p.startFrame;
  const { orient } = ctx;
  const C = MANIFEST.cards[p.hero];
  const lay = C.layout[orient];
  const T = TXT[orient];
  const name = OUTRO.names[p.hero] ?? p.title;
  const tag = p.tagline.toUpperCase();
  const left = p.side === 'left';
  const anchor: React.CSSProperties = left ? { left: T.left } : { right: T.right, textAlign: 'right' };
  const cx = lay.center.x;
  const cy = lay.center.y;
  const id = `card${p.index}`;
  const under = prev ? <SrcAt k2={prev.key} orient={orient} crop={ctx.crop(prev.key)} pos={prev.pos} /> : null;
  const fade = orient === 'port' && C.touches.top ? `linear-gradient(to bottom, transparent ${lay.pad}px, #000 ${lay.pad + 120}px)` : undefined;
  const layers = (sc: number, dx: number) => (
    <div style={{ position: 'absolute', left: lay.x + dx, top: lay.y, width: lay.w, height: lay.h, transform: `scale(${sc})`, transformOrigin: '50% 60%', maskImage: fade, WebkitMaskImage: fade }}>
      {[lay.black, lay.black, lay.white, lay.figure].map((src, i) => (
        <Img
          key={i}
          src={staticFile(asset(src))}
          style={{ position: 'absolute', left: 0, top: 0, width: lay.w, height: lay.h, ...(i === 0 ? { transform: `translate(${lay.shadow[0]}px, ${lay.shadow[1]}px)` } : {}), ...(i === 3 ? { filter: 'saturate(0.94) contrast(1.06)' } : {}) }}
        />
      ))}
    </div>
  );

  // кадр удара: последний кадр предыдущего плана + вспышка 90 %
  if (k === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {under}
        <White a={0.9} />
      </AbsoluteFill>
    );
  }
  // 2 impact-кадра: красный, затем цвет карточки; линии скорости из центра героя, фигура ч/б-постером с белым контуром; тряска 30 px
  if (k <= 2) {
    const [sx, sy] = shake(k, 30, 0.72, `${id}:impact`);
    return (
      <AbsoluteFill style={{ backgroundColor: k === 1 ? IMPACT_RED : C.bg, overflow: 'hidden' }}>
        <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(1.06)`, transformOrigin: `${(cx / W) * 100}% ${(cy / H) * 100}%` }}>
          <Rays cx={cx} cy={cy} n={40} color="#000" alpha={1} rad={0.05} half={0.012} />
          <Img src={staticFile(asset(lay.ring))} style={{ position: 'absolute', left: lay.x, top: lay.y, width: lay.w, height: lay.h }} />
          <Img src={staticFile(asset(lay.poster))} style={{ position: 'absolute', left: lay.x, top: lay.y, width: lay.w, height: lay.h }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  // карточка: фон раскрывается кругом из центра героя за 4 кадра (под ним — ч/б стоп-кадр), фигура выпрыгивает 1.14→1 на SPR.pop,
  // рост +0.12 %/кадр и дрейф 0.6 px/кадр; удар камеры 22 px ×0.72/кадр + 12 px на посадке имени (#024); хроматика 14 px ×0.7/кадр
  const R = Math.hypot(W, H) * 1.2;
  const r = R * E.out((k - 1) / 4);
  const figSc = 1 + 0.14 * (1 - step(t - 0.04, SPR.pop)) + 0.0012 * k;
  const [s1x, s1y] = shake(k - 1, 22, 0.72, `${id}:a`);
  const [s2x, s2y] = shake(k - 3, 12, 0.72, `${id}:b`);
  const ca = 14 * 0.7 ** Math.max(0, k - 1);
  const camK = 1 + 0.035 * E.out(k / n);
  const tagP = E.out((k - 3) / 7); // подпись — маской из плашки слева (#005), одновременно с именем
  const nk = k - 5;
  const numSc = nk >= 0 ? 1 + 1.2 * (1 - step(nk / fps, SPR.stamp)) : 0;
  // выходной смаз (3 последних кадра): текст смазан вместе с кадром — полупрозрачный
  const textO = outWhip && k >= n - 3 ? 0.35 : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Filters id={id} ca={ca} smear={0} />
      <AbsoluteFill style={{ transform: `translate(${s1x + s2x}px, ${s1y + s2y}px) scale(${camK})`, transformOrigin: '40% 50%', filter: filterCss(id, ca, 0) }}>
        {r < R * 0.98 ? <AbsoluteFill style={{ filter: 'grayscale(1) contrast(1.4)' }}>{under}</AbsoluteFill> : null}
        <AbsoluteFill style={{ clipPath: `circle(${r}px at ${cx}px ${cy}px)`, backgroundColor: C.bg }}>
          <Rays cx={cx} cy={cy} n={OUTRO.card.bg.rays} color={C.rays} alpha={C.raysAlpha} rad={0.004 * k} />
          {OUTRO.card.bg.halftone ? <Img src={staticFile(asset(C.bgLayer[orient]))} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} /> : null}
        </AbsoluteFill>
        {layers(figSc, 0.6 * k)}
        {nk >= 0 ? (
          <div style={{ position: 'absolute', top: T.num.top, ...anchor, opacity: textO, transform: `scale(${numSc})`, transformOrigin: left ? '0% 0%' : '100% 0%', fontFamily: fontFor('Oswald', `#${num}`), fontSize: T.num.size, color: C.bg.toLowerCase() === '#1e1e1e' ? INK : '#000', lineHeight: 1 }}>
            <Readable id={`${p.hero}.num`} text={`#${num}`}>#{num}</Readable>
          </div>
        ) : null}
        <div style={{ position: 'absolute', inset: 0, opacity: textO }}>
          <Slam id={`${p.hero}.name`} text={name} size={T.name.size} k={k - 3} align={anchor} top={T.name.top} origin={left ? '0% 50%' : '100% 50%'} />
        </div>
        {k >= 3 ? (
          <div style={{ position: 'absolute', top: T.tag.top, ...anchor, opacity: textO, clipPath: `inset(0 ${(1 - tagP) * 100}% 0 0)`, background: '#000', padding: '4px 18px 6px', fontFamily: fontFor('Oswald', tag), fontWeight: 500, fontSize: T.tag.size, lineHeight: 1.2, color: p.tagColor ?? C.bg, whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-block', transform: `translateX(${-(1 - tagP) * 60}px)` }}>
              <Readable id={`${p.hero}.tagline`} text={tag}>{tag}</Readable>
            </span>
          </div>
        ) : null}
      </AbsoluteFill>
      <Vignette />
      <Grain opacity={0.06} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- финал: удар = взрыв (3 белых кадра, тряска 40 px), MIA — слэм, строка и хвост крупно, holdAfter
const Final: React.FC<{ p: Placed & { kind: 'final' }; ctx: Ctx }> = ({ p, ctx }) => {
  const k = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const n = p.endFrame - p.startFrame;
  const key = liveKey(p.srcFrames!);
  const musicLocal = ctx.tl.musicEndFrame - p.startFrame; // дальше — тишина holdAfter, кадр держится, зерно затухает
  const [sx, sy] = shake(k - 3, 40, 0.72, 'final', 14);
  const lineQ = E.outSoft(seg(k, 3, 3 + 7));
  const tailQ = E.outSoft(seg(k, 15, 15 + 10));
  const grain = 0.07 * (1 - seg(k, musicLocal, n));
  const S = ctx.orient === 'land' ? { title: 240, line: 56, tail: 36, y: 250, w: 1500, right: 0 } : { title: 260, line: 54, tail: 36, y: H * 0.28, w: 760, right: 140 };
  const line = p.line;
  const tail = p.tail.toUpperCase();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${1 + 0.03 * E.dolly(k / n)})`, filter: 'brightness(0.32) saturate(0.6)' }}>
        <SrcAt k2={key} orient={ctx.orient} crop={ctx.crop(key)} pos={Math.min(k, MANIFEST.live[key].frames - 1)} />
      </AbsoluteFill>
      <Vignette />
      <Grain opacity={grain} />
      <div style={{ position: 'absolute', left: 0, right: S.right, top: S.y, height: S.title * 1.2, transform: `translate(${sx}px, ${sy}px)` }}>
        <Slam id="final.title" text={p.title} size={S.title} k={k - 3} align={{ left: 0, right: 0, textAlign: 'center' }} top={0} origin="50% 50%" />
      </div>
      <div style={{ position: 'absolute', left: 0, right: S.right, top: S.y + S.title * 1.2 + 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: S.w, opacity: lineQ, transform: `translateY(${(1 - lineQ) * 18}px)`, fontFamily: fontFor('Oswald', line), fontWeight: 500, fontSize: S.line, lineHeight: 1.25, color: INK, textWrap: 'balance' }}>
          <Readable id="final.line" text={line}>{line}</Readable>
        </div>
        <div style={{ marginTop: 24, opacity: tailQ, transform: `translateY(${(1 - tailQ) * 14}px)`, fontFamily: fontFor('Oswald', tail), fontWeight: 400, fontSize: S.tail, letterSpacing: '0.24em', color: '#F7C600' }}>
          <Readable id="final.tail" text={tail}>{tail}</Readable>
        </div>
      </div>
      <White a={p.flash && k < 3 ? 1 : 0} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- композиции
const MiaOutroBase: React.FC<MiaOutroProps & { orient: Orient }> = (props) => {
  const { orient } = props;
  const tl = useMemo(() => timelineFor(props.episode, injected(props)), [props]);
  const chosen = OUTRO.episodes[props.episode].vertical.crops;
  const ctx: Ctx = { orient, tl, crop: (key) => cropFor(key, chosen, props.verticalCrop) };
  // направление смаза — у склейки (вход следующего = выход предыдущего), чередуется по склейкам in: whip;
  // после карточки следующая склейка идёт в сторону, противоположную предыдущей, т. е. против входа в карточку
  const cuts = useMemo(() => {
    const dirs = new Map<number, number>();
    let w = 0;
    for (const p of tl.items) if (inOf(p) === 'whip') dirs.set(p.index, w++ % 2 === 0 ? 1 : -1);
    return tl.items.map((p, i): Cuts => {
      const next = tl.items[i + 1];
      return { inDir: dirs.get(p.index) ?? 0, outDir: next ? dirs.get(next.index) ?? 0 : 0, outIsCard: p.kind === 'card' };
    });
  }, [tl]);
  let cardNo = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {tl.items.map((p, i) => {
        const dur = p.endFrame - p.startFrame;
        const label = `${p.index} ${p.kind}${p.kind === 'card' ? ` ${p.hero}` : p.srcFrames ? ` ${liveKey(p.srcFrames)}` : ''}${inOf(p) ? ` in:${inOf(p)}` : ''}${p.kind === 'live' && p.ramp ? ' ramp' : ''}`;
        const next = tl.items[i + 1];
        let body: React.ReactNode;
        if (p.kind === 'card') body = <Card p={p} ctx={ctx} num={++cardNo} prev={i > 0 ? lastShown(tl.items[i - 1]) : null} outWhip={cuts[i].outDir !== 0} />;
        else if (p.kind === 'lull') body = <Lull p={p} ctx={ctx} />;
        else if (p.kind === 'final') body = <Final p={p} ctx={ctx} />;
        else body = <Live p={p} ctx={ctx} toHit={!!next && next.kind === 'card'} />;
        return (
          <Sequence key={p.index} from={p.startFrame} durationInFrames={dur} name={label}>
            <Cut id={`i${p.index}`} n={dur} cuts={cuts[i]}>
              {body}
            </Cut>
          </Sequence>
        );
      })}
      <Audio src={staticFile(asset(MANIFEST.music.mixes[props.episode].file))} />
    </AbsoluteFill>
  );
};

export const MiaOutro: React.FC<MiaOutroProps> = (p) => <MiaOutroBase {...p} orient="land" />;
export const MiaOutroVertical: React.FC<MiaOutroProps> = (p) => <MiaOutroBase {...p} orient="port" />;

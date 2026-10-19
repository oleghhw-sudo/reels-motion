// Аутро MIA «знакомство с героями», динамика v2 — 16:9 (MiaOutro) и 9:16 (MiaOutroVertical), props {episode}.
// Данные — videos/mia-outro/outro.yaml (таймлайн на ударах music.hits, in: whip, ramp) и assets.manifest.json.
// Приёмы (удар, подвод, смаз-склейка, слэм/штамп/плашка, look) — src/fx (задача 012-А): пресеты HIT.L / BLAST / LEAD /
// RECOIL / WHIP / LOOK с числами прототипа docs/tasks/data/008-proto-rook-card.py; сырых чисел приёмов в сцене нет.
// Всё в кадре — функция useCurrentFrame() (гейт 1). Текст — <Readable> + fontFor (защита latinOnly).
import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Freeze, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { fontFor } from '../../theme/fonts.ts';
import { Readable } from '../../qa/Readable.tsx';
import { clamp, seg } from '../../motion/index.ts';
import { step } from '../../motion/spring.ts';
import { E, rand } from '../../motion/tokens.ts';
import { BLAST, Filters, HIT, HitLayer, LOOK, LeadFlash, LeadIn, Look, RECOIL, Rays, Slam, Stamp, TagPlate, WHIP, White, WhipCut, filterCss, lookFilter, shakeAt, useHit, type Cuts } from '../../fx/index.ts';
import { livePos, type Placed, type Timeline, type Zone } from './model.ts';
import { MANIFEST, OUTRO, asset, liveKey, timelineFor } from './script.ts';
import { CROP_VARIANTS, cropFor, type CropVariant } from './vertical.ts';

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
/** Тайлы зерна серии (prepare-assets) для <Look>. */
const grainTiles = () => MANIFEST.grain.map((g) => staticFile(asset(g)));

type Ctx = { orient: Orient; crop: (key: string) => CropVariant; tl: Timeline };

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
const lastShown = (p: Placed, fps: number): { key: string; pos: number } | null => {
  if (!p.srcFrames || p.kind === 'card') return null;
  const key = liveKey(p.srcFrames);
  const L = MANIFEST.live[key];
  const n = p.endFrame - p.startFrame;
  return { key, pos: p.kind === 'live' ? livePos(n - 1, n, L.frames, !!p.ramp, fps) : Math.min(n - 1, L.frames - 1) };
};

// ---------------------------------------------------------------- живой план: ramp-подвод к удару (LEAD)
const Live: React.FC<{ p: Placed & { kind: 'live' }; ctx: Ctx; toHit: boolean }> = ({ p, ctx, toHit }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = p.endFrame - p.startFrame;
  const key = liveKey(p.srcFrames!);
  const L = MANIFEST.live[key];
  const pos = livePos(f, n, L.frames, !!p.ramp, fps);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <LeadIn id={`live${p.index}`} active={!!p.ramp} dur={(n - 1) / fps}>
        <SrcAt k2={key} orient={ctx.orient} crop={ctx.crop(key)} pos={pos} />
      </LeadIn>
      <Look preset={LOOK.film} tiles={grainTiles()} />
      {p.ramp && toHit ? <LeadFlash hitAt={n / fps} /> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- затишье: дверь, наезд push (outro.yaml), к последней доле — вибрация 0→4 px
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
      <Look preset={LOOK.film} tiles={grainTiles()} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- карточка героя: удар L (HitLayer) → отдача (RECOIL)
const TXT = {
  // right — с запасом под наезд камеры +3.5 % и тряску: правые имена не заходят в правую safe zone (140 px)
  land: { left: 90, right: 200, num: { top: 240, size: 48 }, name: { top: 266, size: 240 }, tag: { top: 600, size: 60 } },
  port: { left: 80, right: 185, num: { top: 252, size: 44 }, name: { top: 288, size: 230 }, tag: { top: 610, size: 56 } },
} as const;

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

  // удар L: кадр удара (последний кадр предыдущего плана + вспышка) и 2 impact-кадра — HitLayer; дальше отдача
  const env = useHit(HIT.L, id);
  if (env.phase !== 'recoil') {
    return (
      <HitLayer
        env={env}
        preset={HIT.L}
        under={under}
        bg={C.bg}
        center={{ x: cx, y: cy }}
        impact={
          <>
            <Img src={staticFile(asset(lay.ring))} style={{ position: 'absolute', left: lay.x, top: lay.y, width: lay.w, height: lay.h }} />
            <Img src={staticFile(asset(lay.poster))} style={{ position: 'absolute', left: lay.x, top: lay.y, width: lay.w, height: lay.h }} />
          </>
        }
      />
    );
  }
  // отдача (RECOIL): фон раскрывается кругом из центра героя (под ним — ч/б стоп-кадр, LOOK.monoHit), фигура выпрыгивает на SPR.pop,
  // растёт и дрейфует; тряска и хроматика — из env удара; камера наезжает за удержание; имя — слэм, номер — штамп, подпись — плашка
  const R = Math.hypot(W, H) * 1.2;
  const r = R * env.reveal;
  const fig = RECOIL.figure;
  const figSc = 1 + fig.pop * (1 - step(t - fig.delay, fig.spring)) + fig.grow * t;
  const [sx, sy] = env.shake;
  const ca = env.ca;
  const camK = 1 + RECOIL.push * RECOIL.pushEase(k / n);
  // выходной смаз (WHIP.outCard): текст смазан вместе с кадром — полупрозрачный
  const textO = outWhip && k >= n - Math.round(WHIP.outCard.dur * fps) ? RECOIL.textOnSmear : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Filters id={id} ca={ca} smear={0} />
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${camK})`, transformOrigin: '40% 50%', filter: filterCss(id, ca, 0) }}>
        {r < R * 0.98 ? <AbsoluteFill style={{ filter: lookFilter(LOOK.monoHit) }}>{under}</AbsoluteFill> : null}
        <AbsoluteFill style={{ clipPath: `circle(${r}px at ${cx}px ${cy}px)`, backgroundColor: C.bg }}>
          <Rays cx={cx} cy={cy} n={OUTRO.card.bg.rays} color={C.rays} alpha={C.raysAlpha} rad={RECOIL.raysSpin * t} />
          {OUTRO.card.bg.halftone ? <Img src={staticFile(asset(C.bgLayer[orient]))} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} /> : null}
        </AbsoluteFill>
        {layers(figSc, fig.drift * t)}
        <Stamp t={t - RECOIL.stampAt} origin={left ? '0% 0%' : '100% 0%'} style={{ top: T.num.top, ...anchor, opacity: textO, fontFamily: fontFor('Oswald', `#${num}`), fontSize: T.num.size, color: C.bg.toLowerCase() === '#1e1e1e' ? INK : '#000', lineHeight: 1 }}>
          <Readable id={`${p.hero}.num`} text={`#${num}`}>#{num}</Readable>
        </Stamp>
        <div style={{ position: 'absolute', inset: 0, opacity: textO }}>
          <Slam id={`${p.hero}.name`} text={name} size={T.name.size} t={t - RECOIL.nameAt} align={anchor} top={T.name.top} origin={left ? '0% 50%' : '100% 50%'} fontFamily={fontFor('Anton', name)} />
        </div>
        <TagPlate t={t - RECOIL.tagAt} style={{ top: T.tag.top, ...anchor, opacity: textO, fontFamily: fontFor('Oswald', tag), fontWeight: 500, fontSize: T.tag.size, lineHeight: 1.2, color: p.tagColor ?? C.bg }}>
          <Readable id={`${p.hero}.tagline`} text={tag}>{tag}</Readable>
        </TagPlate>
      </AbsoluteFill>
      <Look preset={LOOK.film} grain={0.06} tiles={grainTiles()} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- финал: удар = взрыв (BLAST: 3 белых кадра, тряска 40 px), MIA — слэм, строка и хвост крупно, holdAfter
const Final: React.FC<{ p: Placed & { kind: 'final' }; ctx: Ctx }> = ({ p, ctx }) => {
  const k = useCurrentFrame();
  const { fps, height: H } = useVideoConfig();
  const t = k / fps;
  const n = p.endFrame - p.startFrame;
  const key = liveKey(p.srcFrames!);
  const musicLocal = ctx.tl.musicEndFrame - p.startFrame; // дальше — тишина holdAfter, кадр держится, зерно затухает
  const env = useHit(BLAST, 'final');
  const [sx, sy] = shakeAt(t, fps, BLAST.shake, 'final'); // тряска взрыва тем же seed, что в финале ep01
  const lineQ = E.outSoft(seg(k, 3, 3 + 7));
  const tailQ = E.outSoft(seg(k, 15, 15 + 10));
  const grain = LOOK.film.grain * (1 - seg(k, musicLocal, n));
  const S = ctx.orient === 'land' ? { title: 240, line: 56, tail: 36, y: 250, w: 1500, right: 0 } : { title: 260, line: 54, tail: 36, y: H * 0.28, w: 760, right: 140 };
  const line = p.line;
  const tail = p.tail.toUpperCase();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${1 + 0.03 * E.dolly(k / n)})`, filter: 'brightness(0.32) saturate(0.6)' }}>
        <SrcAt k2={key} orient={ctx.orient} crop={ctx.crop(key)} pos={Math.min(k, MANIFEST.live[key].frames - 1)} />
      </AbsoluteFill>
      <Look preset={LOOK.film} grain={grain} tiles={grainTiles()} />
      <div style={{ position: 'absolute', left: 0, right: S.right, top: S.y, height: S.title * 1.2, transform: `translate(${sx}px, ${sy}px)` }}>
        <Slam id="final.title" text={p.title} size={S.title} t={t - RECOIL.nameAt} align={{ left: 0, right: 0, textAlign: 'center' }} top={0} origin="50% 50%" fontFamily={fontFor('Anton', p.title)} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: S.right, top: S.y + S.title * 1.2 + 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: S.w, opacity: lineQ, transform: `translateY(${(1 - lineQ) * 18}px)`, fontFamily: fontFor('Oswald', line), fontWeight: 500, fontSize: S.line, lineHeight: 1.25, color: INK, textWrap: 'balance' }}>
          <Readable id="final.line" text={line}>{line}</Readable>
        </div>
        <div style={{ marginTop: 24, opacity: tailQ, transform: `translateY(${(1 - tailQ) * 14}px)`, fontFamily: fontFor('Oswald', tail), fontWeight: 400, fontSize: S.tail, letterSpacing: '0.24em', color: '#F7C600' }}>
          <Readable id="final.tail" text={tail}>{tail}</Readable>
        </div>
      </div>
      <White a={p.flash ? env.flash : 0} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- композиции
const MiaOutroBase: React.FC<MiaOutroProps & { orient: Orient }> = (props) => {
  const { orient } = props;
  const { fps } = useVideoConfig();
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
        if (p.kind === 'card') body = <Card p={p} ctx={ctx} num={++cardNo} prev={i > 0 ? lastShown(tl.items[i - 1], fps) : null} outWhip={cuts[i].outDir !== 0} />;
        else if (p.kind === 'lull') body = <Lull p={p} ctx={ctx} />;
        else if (p.kind === 'final') body = <Final p={p} ctx={ctx} />;
        else body = <Live p={p} ctx={ctx} toHit={!!next && next.kind === 'card'} />;
        return (
          <Sequence key={p.index} from={p.startFrame} durationInFrames={dur} name={label}>
            <WhipCut id={`i${p.index}`} dur={dur / fps} cuts={cuts[i]}>
              {body}
            </WhipCut>
          </Sequence>
        );
      })}
      <Audio src={staticFile(asset(MANIFEST.music.mixes[props.episode].file))} />
    </AbsoluteFill>
  );
};

export const MiaOutro: React.FC<MiaOutroProps> = (p) => <MiaOutroBase {...p} orient="land" />;
export const MiaOutroVertical: React.FC<MiaOutroProps> = (p) => <MiaOutroBase {...p} orient="port" />;

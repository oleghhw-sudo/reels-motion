// src/fx/components.tsx — тонкие компоненты приёмов поверх чистых функций (hit.ts, text.ts, core.ts).
// Всё — функция useCurrentFrame() (гейт 1); реализация DOM/SVG — та же, что в финале ep01 (2f3856c):
//   #111 хроматика — SVG-фильтр (R вправо, B влево); #043 смаз — горизонтальный feGaussianBlur + сдвиг;
//   #024 тряска — rand(seed) с затуханием; #118 зерно — <Img>-тайлы по seed «на двойках» (не фон CSS: /docs/flickering).
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { Readable } from '../qa/Readable.tsx';
import { whipSmear, type Cuts, type WhipPreset } from './core.ts';
import { hitEnvelope, leadFlash, leadIn, type HitEnv } from './hit.ts';
import { slam, stamp, tagReveal } from './text.ts';
import { HIT, LEAD, LOOK, SLAM, STAMP, TAG, WHIP, type HitPreset, type LeadPreset, type LookPreset, type SlamPreset, type StampPreset, type TagPreset } from './presets.ts';

// ---------------------------------------------------------------- фильтры слоя
/** SVG-фильтры одного слоя: хроматика (px) и горизонтальный смаз (px, ширина «размыва»). id уникален в кадре. */
export const Filters: React.FC<{ id: string; ca: number; smear: number }> = ({ id, ca, smear }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      {ca >= 0.5 ? (
        <filter id={`${id}-ca`} x="-2%" y="0" width="104%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={ca} dy={0} result="r2" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx={-ca} dy={0} result="b2" />
          <feComposite in="r2" in2="g" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} result="rg" />
          <feComposite in="rg" in2="b2" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
        </filter>
      ) : null}
      {smear >= 1 ? (
        <filter id={`${id}-sm`} x="-10%" y="0" width="120%" height="100%">
          <feGaussianBlur stdDeviation={`${smear / 3} 0`} edgeMode="duplicate" />
        </filter>
      ) : null}
    </defs>
  </svg>
);
/** CSS filter слоя под <Filters id>: url(#id-ca) url(#id-sm) + свои фильтры; без ничего — 'none'. */
export const filterCss = (id: string, ca: number, smear: number, extra = ''): string =>
  [ca >= 0.5 ? `url(#${id}-ca)` : '', smear >= 1 ? `url(#${id}-sm)` : '', extra].filter(Boolean).join(' ') || 'none';

/** Белая заливка кадра с прозрачностью a (вспышка, засветка). */
export const White: React.FC<{ a: number }> = ({ a }) => (a > 0.001 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: Math.min(1, a) }} /> : null);

/** Лучи из точки (cx, cy): n клиньев полушириной half (рад), повёрнутых на rad. */
export const Rays: React.FC<{ cx: number; cy: number; n: number; color: string; alpha: number; rad: number; half?: number }> = ({ cx, cy, n, color, alpha, rad, half }) => {
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

// ---------------------------------------------------------------- look: зерно и виньетка
/** Зерно (#118): тайл выбирается по номеру кадра «на двойках», кадр замощён <Img> размера size (ждут загрузки — без мерцания). */
export const Grain: React.FC<{ tiles: readonly string[]; opacity?: number; size?: number }> = ({ tiles, opacity = LOOK.film.grain, size = 512 }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (opacity <= 0.001 || tiles.length === 0) return null;
  const src = tiles[Math.floor(f / 2) % tiles.length];
  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <Img key={i} src={src} style={{ position: 'absolute', left: (i % cols) * size, top: Math.floor(i / cols) * size, width: size, height: size }} />
      ))}
    </AbsoluteFill>
  );
};

/** Виньетка: к краям темнее до amount, начиная с from (доля радиуса). */
export const Vignette: React.FC<{ amount?: number; from?: number }> = ({ amount = LOOK.film.vignette, from = LOOK.film.vignetteFrom }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) ${from * 100}%, rgba(0,0,0,${amount}) 100%)`, pointerEvents: 'none' }} />
);

/** Финишная обработка поверх слоя: виньетка + зерно по пресету; grain — переопределение (например затухание к концу). */
export const Look: React.FC<{ preset?: LookPreset; grain?: number; tiles?: readonly string[] }> = ({ preset = LOOK.film, grain, tiles = [] }) => (
  <>
    {preset.vignette > 0 ? <Vignette amount={preset.vignette} from={preset.vignetteFrom} /> : null}
    <Grain tiles={tiles} opacity={grain ?? preset.grain} />
  </>
);
/** CSS filter пресета на содержимое (monoHit — ч/б с контрастом); 'none', если пресет его не задаёт. */
export const lookFilter = (preset: LookPreset): string => preset.filter ?? 'none';

// ---------------------------------------------------------------- удар
/** Состояние удара для текущего кадра: удар — в кадре at (с) от начала <Sequence>, по умолчанию 0. */
export function useHit(preset: HitPreset = HIT.L, seed = 'hit', at = 0): HitEnv {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return hitEnvelope(f / fps - at, fps, preset, seed);
}

/**
 * Кадр удара и impact-кадры (cinematic-fx §2 «Удар»): flash — under (последний кадр предыдущего плана) + белая вспышка;
 * impact — плоский цвет (красный → bg), лучи из центра героя, impact (фигура ч/б-постером) с тряской и увеличением.
 * В отдаче возвращает null — отдачу рисует сцена по env (shake, ca, reveal, zoom).
 */
export const HitLayer: React.FC<{ env: HitEnv; preset?: HitPreset; under?: React.ReactNode; bg?: string; center?: { x: number; y: number }; impact?: React.ReactNode; size?: { w: number; h: number } }> = ({
  env,
  preset = HIT.L,
  under,
  bg = '#000',
  center,
  impact,
  size,
}) => {
  const vc = useVideoConfig();
  const W = size?.w ?? vc.width; // размер слоя (плитка лаборатории меньше кадра) — для центра увеличения
  const H = size?.h ?? vc.height;
  if (env.phase === 'flash') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {under}
        <White a={env.flash} />
      </AbsoluteFill>
    );
  }
  if (env.phase === 'impact') {
    const cx = center?.x ?? W / 2;
    const cy = center?.y ?? H / 2;
    const [sx, sy] = env.shake;
    return (
      <AbsoluteFill style={{ backgroundColor: env.impactFirst ? preset.impactRed : bg, overflow: 'hidden' }}>
        <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${preset.impactScale})`, transformOrigin: `${(cx / W) * 100}% ${(cy / H) * 100}%` }}>
          <Rays cx={cx} cy={cy} n={preset.impactRays.n} color="#000" alpha={1} rad={preset.impactRays.rot} half={preset.impactRays.half} />
          {impact}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return null;
};

// ---------------------------------------------------------------- подвод
/**
 * Подвод к удару (cinematic-fx §2): наезд, обесцвечивание, контраст и хроматика растут по кривой пресета
 * от начала <Sequence> до dur (с, обычно (n − 1)/fps — последний кадр перед ударом). active=false — слой без обработки.
 */
export const LeadIn: React.FC<{ id: string; dur: number; active?: boolean; preset?: LeadPreset; children: React.ReactNode }> = ({ id, dur, active = true, preset = LEAD, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const L = leadIn(active ? (dur > 0 ? t / dur : 1) : 0, preset);
  return (
    <>
      <Filters id={id} ca={L.ca} smear={0} />
      <AbsoluteFill style={{ transform: `scale(${L.zoom})`, transformOrigin: preset.origin, filter: filterCss(id, L.ca, 0, active ? `saturate(${L.saturate}) contrast(${L.contrast})` : '') }}>{children}</AbsoluteFill>
    </>
  );
};

/** Засветка в белое на последних кадрах перед ударом в hitAt (с от начала <Sequence>). */
export const LeadFlash: React.FC<{ hitAt: number; preset?: LeadPreset }> = ({ hitAt, preset = LEAD }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <White a={leadFlash(hitAt - f / fps, fps, preset)} />;
};

// ---------------------------------------------------------------- смаз-склейка
/** Обёртка пункта длиной dur (с): смаз на входе/выходе по cuts (#043); выход из карточки — с затемнением. */
export const WhipCut: React.FC<{ id: string; dur: number; cuts: Cuts; preset?: WhipPreset; children: React.ReactNode }> = ({ id, dur, cuts, preset = WHIP, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px, dir, dark } = whipSmear(f / fps, dur, cuts, fps, preset);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      <Filters id={`${id}-cut`} ca={0} smear={px} />
      <AbsoluteFill style={{ filter: filterCss(`${id}-cut`, 0, px), transform: px ? `translateX(${dir * px * preset.shift}px)` : undefined }}>{children}</AbsoluteFill>
      {dark > 0 ? <AbsoluteFill style={{ backgroundColor: '#000', opacity: dark }} /> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- display-текст карточки
/**
 * Имя-слэм (#008): from→1 на пружине с перелётом (решение «Динамика v2»), шлейф из копий первые кадры, полёт полупрозрачен.
 * t — секунды с момента входа (< 0 — ещё нет). Вид по умолчанию — ROOK: белый, обводка 8 px, жёсткая тень.
 */
export const Slam: React.FC<{
  id: string;
  text: string;
  size: number;
  t: number;
  align: React.CSSProperties;
  top: number;
  origin: string;
  fontFamily: string;
  preset?: SlamPreset;
  color?: string;
  stroke?: string;
  shadow?: string;
}> = ({ id, text, size, t, align, top, origin, fontFamily, preset = SLAM, color = '#ffffff', stroke = '8px #000', shadow = '14px 14px 0 #000' }) => {
  const s = slam(t, preset);
  if (!s) return null;
  const style = (sc: number, o: number): React.CSSProperties => ({
    position: 'absolute',
    top,
    ...align,
    transform: `scale(${sc})`,
    transformOrigin: origin, // растёт от края якоря — не вылетает за кадр
    opacity: o,
    fontFamily,
    fontSize: size,
    lineHeight: 1.1,
    color,
    WebkitTextStroke: stroke,
    paintOrder: 'stroke fill',
    textShadow: shadow,
    whiteSpace: 'nowrap',
  });
  return (
    <>
      {s.trail.map((c, i) => (
        <div key={i} aria-hidden style={style(c.scale, c.alpha)}>
          {text}
        </div>
      ))}
      <div style={style(s.scale, s.opacity)}>
        <Readable id={id} text={text}>
          {text}
        </Readable>
      </div>
    </>
  );
};

/** Штамп (номер): from→1 на пружине; t — секунды с момента входа (< 0 — ещё нет). style — положение, шрифт, цвет. */
export const Stamp: React.FC<{ t: number; origin: string; style: React.CSSProperties; preset?: StampPreset; children: React.ReactNode }> = ({ t, origin, style, preset = STAMP, children }) => {
  const sc = stamp(t, preset);
  if (sc === null) return null;
  return <div style={{ position: 'absolute', ...style, transform: `scale(${sc})`, transformOrigin: origin }}>{children}</div>;
};

/** Плашка подписи (#005): раскрывается маской слева, текст въезжает; t — секунды с момента входа (< 0 — ещё нет). */
export const TagPlate: React.FC<{ t: number; style: React.CSSProperties; preset?: TagPreset; children: React.ReactNode }> = ({ t, style, preset = TAG, children }) => {
  const r = tagReveal(t, preset);
  if (!r) return null;
  return (
    <div style={{ position: 'absolute', background: '#000', padding: '4px 18px 6px', whiteSpace: 'nowrap', ...style, clipPath: `inset(0 ${(1 - r.p) * 100}% 0 0)` }}>
      <span style={{ display: 'inline-block', transform: `translateX(${r.slide}px)` }}>{children}</span>
    </div>
  );
};

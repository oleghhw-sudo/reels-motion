// Примитивы моушна сайта (§5.3), переведённые в функции кадра. Никаких CSS-transition/animation.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAUTY_COLORS, BEAUTY_EASE, BEAUTY_FONTS, BEAUTY_PAD, BEAUTY_TYPE, s, type BeautySurfaceId } from '../../theme/brands/beauty-studio.ts';
import { BrandSurface, isLightSurface } from '../../backgrounds/BrandSurface.tsx';
import { SCRIPT, type BeautyScene } from './script.ts';
import { SAFE } from '../../labs/SafeZones.tsx';
import { Readable } from '../../qa/Readable.tsx';

export type EaseFn = (t: number) => number;

/** Время внутри текущей Sequence, секунды. */
export const useT = (): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

/** Прогресс 0→1 анимации, начинающейся в startSec длительностью ms, с кривой. */
export const prog = (t: number, startSec: number, ms: number, ease: EaseFn = BEAUTY_EASE.ease): number => {
  if (ms <= 0) return t >= startSec ? 1 : 0;
  return ease(interpolate(t, [startSec, startSec + ms / 1000], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
};

/** Строка заголовка в маске (§2.4 .line-mask): выезжает translateY(110%) → 0. */
export const MaskLine: React.FC<{ t: number; at: number; ms?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  t,
  at,
  ms = 1000,
  children,
  style,
}) => {
  const p = prog(t, at, ms);
  return (
    <span style={{ display: 'block', overflow: 'hidden', marginBlock: '-.14em -.18em', paddingBlock: '.14em .18em', ...style }}>
      <span style={{ display: 'block', transform: `translateY(${(1 - p) * 110}%)` }}>{children}</span>
    </span>
  );
};

/**
 * .rise (§5.3): opacity 0→1, blur(14px)→0, translateY(28px)→0, 900ms ease.
 * Расстояния сайта (колонка 390) масштабированы ×SITE_TO_REELS, как и вся типографика.
 */
export const riseStyle = (t: number, at: number, ms = 900): React.CSSProperties => {
  const p = prog(t, at, ms);
  return {
    opacity: p,
    filter: p >= 1 ? undefined : `blur(${(1 - p) * s(14)}px)`,
    transform: `translateY(${(1 - p) * s(28)}px)`,
  };
};

export const Rise: React.FC<{ t: number; at: number; ms?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  t,
  at,
  ms,
  style,
  children,
}) => <div style={{ ...style, ...riseStyle(t, at, ms) }}>{children}</div>;

/** Текст без разметки «*курсив*» — то, что читает зритель (для Readable). */
export const richPlain = (text: string): string => text.replace(/\*/g, '');

/** «*курсив*» → Playfair italic бронзой (§2.5). Остальной текст — как есть. */
export const Rich: React.FC<{ text: string; accent?: string }> = ({ text, accent = BEAUTY_COLORS.bronze }) => {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') ? (
          <em key={i} style={{ fontStyle: 'italic', fontWeight: 400, color: accent }}>
            {p.slice(1, -1)}
          </em>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
};

/** Ширина рабочей колонки текста: от левого поля до правой safe-зоны. */
export const TEXT_LEFT = BEAUTY_PAD;
export const TEXT_RIGHT = SAFE.right; // правые 140px — без текста
export const TEXT_WIDTH = 1080 - TEXT_LEFT - TEXT_RIGHT;
/** §3.3: волосяная линия. 1px сайта на 1080 после H.264 пропадает; 2px = как на скриншотах @2x. */
export const RULE_PX = 2;

const labelText = (color: string): React.CSSProperties => ({
  fontFamily: BEAUTY_FONTS.body,
  fontWeight: 400,
  fontSize: BEAUTY_TYPE.label.size,
  letterSpacing: BEAUTY_TYPE.label.tracking,
  lineHeight: BEAUTY_TYPE.label.lineHeight,
  textTransform: 'uppercase',
  color,
  whiteSpace: 'nowrap',
});

/** Строка-метка во всю ширину (§6 п.1): слева подпись, справа «NN / Розділ», ниже линия scaleX 0→1. */
export const LabelRow: React.FC<{
  t: number;
  at: number;
  top: number;
  left: string;
  right: string;
  dark: boolean;
  ruleMs?: number;
  /** id для readcheck: метки получают `<qaId>.label` и `<qaId>.section` */
  qaId: string;
  children?: React.ReactNode;
}> = ({ t, at, top, left, right, dark, ruleMs = 900, qaId, children }) => {
  const color = dark ? BEAUTY_COLORS.white : BEAUTY_COLORS.ink;
  const rule = dark ? BEAUTY_COLORS.ruleDarkStructural : BEAUTY_COLORS.ruleStructural;
  const pr = prog(t, at, ruleMs);
  return (
    <div style={{ position: 'absolute', top, left: TEXT_LEFT, width: TEXT_WIDTH }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: s(14), ...riseStyle(t, at + 0.05) }}>
        <span style={labelText(color)}>
          <Readable id={`${qaId}.label`} text={left}>
            {left}
          </Readable>
        </span>
        <span style={labelText(color)}>
          <Readable id={`${qaId}.section`} text={right}>
            {right}
          </Readable>
        </span>
      </div>
      <div style={{ height: RULE_PX, background: rule, transform: `scaleX(${pr})`, transformOrigin: 'left center' }} />
      {children}
    </div>
  );
};

export const labelStyle = labelText;

/**
 * Вход сцены поверх предыдущей: шторка снизу вверх (clip-path) / растворение / склейка.
 * Монтаж под музыку: граница сцены = сильная доля, поэтому вход ВИДЕН уже на кадре доли —
 * прогресс берётся на конце кадра ((frame + 1) / fps), а кривая --ease (резкий старт, мягкая
 * остановка, §5.2) даёт заметный первый шаг. Растворение — тоже --ease (а не material), по той же причине.
 */
export const SceneEnter: React.FC<{ type: 'cut' | 'curtain' | 'dissolve'; ms: number; children: React.ReactNode }> = ({ type, ms, children }) => {
  const { fps } = useVideoConfig();
  const t = useT() + 1 / fps;
  if (type === 'cut' || ms <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = prog(t, 0, ms, BEAUTY_EASE.ease);
  if (type === 'curtain') {
    return <AbsoluteFill style={{ clipPath: p >= 1 ? undefined : `inset(${(1 - p) * 100}% 0 0 0)` }}>{children}</AbsoluteFill>;
  }
  return <AbsoluteFill style={{ opacity: p }}>{children}</AbsoluteFill>;
};

/** Фон сцены — из scenes.yaml background.perScene (выбор под ролик). hero-video рисует сама сцена хука. */
export const sceneSurface = (id: BeautyScene['id']): Exclude<BeautySurfaceId, 'hero-video'> => {
  const v = SCRIPT.background.perScene[id];
  if (!v || v === 'hero-video') throw new Error(`scenes.yaml background.perScene.${id} = ${v}: для этой сцены нужна поверхность бренда`);
  return v;
};
export const SceneSurface: React.FC<{ id: BeautyScene['id'] }> = ({ id }) => <BrandSurface id={sceneSurface(id)} />;
/** Светлая ли поверхность сцены (цвет текста и линий). */
export const sceneIsLight = (id: BeautyScene['id']) => isLightSurface(sceneSurface(id));

/** Картинка cover — как на сайте везде (§4.1). */
export const coverImg = (objectPosition = '50% 50%'): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition,
  display: 'block',
});

export const display = (size: number, lineHeight: number, tracking: string, color: string): React.CSSProperties => ({
  fontFamily: BEAUTY_FONTS.display,
  fontWeight: 400,
  fontSize: size,
  lineHeight,
  letterSpacing: tracking,
  color,
  margin: 0,
  hyphens: 'none',
});

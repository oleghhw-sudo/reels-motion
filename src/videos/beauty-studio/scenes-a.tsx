// Сцены 1–4: хук, 01 Підхід, 02 Наші роботи, 03 Послуги. Всё — функции времени сцены useT().
// Появления стоят на долях музыки: времена — из scenes.yaml (кратные доле 0.488 с от начала сцены).
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useVideoConfig } from 'remotion';
import { BEAUTY_COLORS, BEAUTY_EASE, BEAUTY_FONTS, BEAUTY_TYPE, s } from '../../theme/brands/beauty-studio.ts';
import { SAFE } from '../../labs/SafeZones.tsx';
import { LabelRow, MaskLine, Rich, Rise, SceneSurface, TEXT_LEFT, TEXT_WIDTH, coverImg, display, labelStyle, prog, richPlain, riseStyle, sceneIsLight, useT } from './primitives.tsx';
import { Readable } from '../../qa/Readable.tsx';
import { assetPath, scene } from './script.ts';

const H = 1920;
const W = 1080;
const vh = (n: number) => (n / 100) * H;
const vw = (n: number) => (n / 100) * W;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// §3.4: тень текста hero, масштабирована
const HERO_TEXT_SHADOW = `0 ${s(1)}px ${s(1)}px rgba(18,14,12,.32), 0 ${s(8)}px ${s(30)}px rgba(18,14,12,.18)`;
// §4.4: скрим hero ≤767
export const HERO_SCRIM =
  'linear-gradient(90deg, rgba(18,14,12,.2), transparent 72%), linear-gradient(0deg, rgba(18,14,12,.38) 0%, rgba(18,14,12,.06) 52%, transparent 72%)';

const clampX = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** Кроп 9:16 hero-видео ведёт глаз: object-position X по keyframes scenes.yaml (pan). */
export const heroPanX = (t: number): number => {
  const pan = scene('hook').video.pan;
  if (pan.length === 1) return pan[0][1];
  return interpolate(t, pan.map((k) => k[0]), pan.map((k) => k[1]), clampX);
};

/**
 * Hero-видео со скримом: общий слой для хука и кандидата фона в BackgroundPicker.
 * t — время сцены (для pan/zoom); offsetSec — сдвиг старта видео (постер BackgroundPicker).
 * Медленный наезд zoom[0]→zoom[1] за сцену («подойди ближе»), центр наезда — точка кропа.
 */
export const HeroVideoLayer: React.FC<{ t: number; offsetSec?: number }> = ({ t, offsetSec = 0 }) => {
  const { fps } = useVideoConfig();
  const sc = scene('hook');
  const v = sc.video;
  const tv = t + offsetSec;
  const x = heroPanX(tv);
  const z = interpolate(tv, [0, sc.to - sc.from], v.zoom, clampX);
  const pos = `${x.toFixed(2)}% ${v.objectPositionY}%`;
  return (
    <AbsoluteFill style={{ backgroundColor: '#b7aa9f' /* §1.3 фон hero в состоянии «видео» */ }}>
      <OffthreadVideo
        src={staticFile(assetPath(v.asset))}
        trimBefore={Math.round((v.startSec + offsetSec) * fps)}
        muted
        style={{ ...coverImg(pos), transform: `scale(${z})`, transformOrigin: pos }}
      />
      <AbsoluteFill style={{ background: HERO_SCRIM }} />
    </AbsoluteFill>
  );
};

/** Текст хука — переиспользуется в BackgroundPicker (реальный текст ролика). */
export const HookText: React.FC<{ t: number; color: string; shadow: boolean; kickerTop?: number }> = ({ t, color, shadow, kickerTop = vh(22) }) => {
  const sc = scene('hook');
  const tm = sc.timing;
  const textShadow = shadow ? HERO_TEXT_SHADOW : undefined;
  return (
    <>
      <Rise t={t} at={tm.kickerSec} style={{ position: 'absolute', top: kickerTop, left: TEXT_LEFT }}>
        <span style={{ ...labelStyle(color), letterSpacing: BEAUTY_TYPE.kicker.tracking, lineHeight: 'normal', textShadow }}>
          <Readable id="hook.kicker" text={`${sc.kicker[0]} / ${sc.kicker[1]}`}>
            {sc.kicker[0]} / {sc.kicker[1]}
          </Readable>
        </span>
      </Rise>
      <div
        style={{
          position: 'absolute',
          left: TEXT_LEFT,
          bottom: SAFE.bottom + 20,
          width: vw(78),
          display: 'flex',
          flexDirection: 'column',
          gap: s(28),
        }}
      >
        <h1 style={{ ...display(BEAUTY_TYPE.heroH1.size, BEAUTY_TYPE.heroH1.lineHeight, BEAUTY_TYPE.heroH1.tracking, color), textShadow }}>
          <Readable id="hook.title" text={sc.title.join(' ')}>
            <MaskLine t={t} at={tm.titleSec[0]} ms={tm.titleMs}>
              {sc.title[0]}
            </MaskLine>
            {/* лесенка: 2-я строка с отступом 3vw (моб.) */}
            <MaskLine t={t} at={tm.titleSec[1]} ms={tm.titleMs} style={{ paddingLeft: vw(3) }}>
              {sc.title[1]}
            </MaskLine>
          </Readable>
        </h1>
        <Rise t={t} at={tm.subtitleSec}>
          <p
            style={{
              margin: 0,
              maxWidth: '34ch',
              fontFamily: BEAUTY_FONTS.body,
              fontWeight: 400,
              fontSize: BEAUTY_TYPE.heroSub.size,
              lineHeight: BEAUTY_TYPE.heroSub.lineHeight,
              color,
              textShadow,
            }}
          >
            <Readable id="hook.subtitle" text={sc.subtitle}>
              {sc.subtitle}
            </Readable>
          </p>
        </Rise>
      </div>
    </>
  );
};

export const HookScene: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill>
      <HeroVideoLayer t={t} />
      <HookText t={t} color={BEAUTY_COLORS.white} shadow />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 01 Підхід
export const ApproachScene: React.FC = () => {
  const t = useT();
  const sc = scene('approach');
  const tm = sc.timing;
  const ty = BEAUTY_TYPE.editorial;
  const light = sceneIsLight('approach');
  const ink = light ? BEAUTY_COLORS.ink : BEAUTY_COLORS.white;
  // §5.3 .image-reveal: шторка сверху вниз 1100ms + img scale 1.06→1 1200ms
  const pr = prog(t, tm.imageSec, 1100);
  const ps = prog(t, tm.imageSec, 1200);
  return (
    <AbsoluteFill>
      <SceneSurface id="approach" />
      <LabelRow qaId="approach" t={t} at={tm.labelSec} top={SAFE.top + 10} left={sc.label[0]} right={sc.label[1]} dark={!light} />
      <h2 style={{ ...display(ty.size, ty.lineHeight, ty.tracking, ink), position: 'absolute', top: 340, left: TEXT_LEFT, width: TEXT_WIDTH }}>
        <Readable id="approach.title" text={sc.title.join(' ')}>
          {sc.title.map((line, i) => (
            // каждая строка — на свою долю (scenes.yaml timing.titleSec)
            <MaskLine key={i} t={t} at={tm.titleSec[i] ?? tm.titleSec[tm.titleSec.length - 1]}>
              {line}
            </MaskLine>
          ))}
        </Readable>
      </h2>
      <div
        style={{
          position: 'absolute',
          left: 361,
          right: TEXT_LEFT,
          top: 1360,
          bottom: 0,
          overflow: 'hidden',
          clipPath: `inset(0 0 ${(1 - pr) * 100}% 0)`,
        }}
      >
        <Img src={staticFile(assetPath(sc.image))} style={{ ...coverImg('50% 50%'), transform: `scale(${1.06 - 0.06 * ps})` }} />
      </div>
      <Rise t={t} at={tm.codaSec} style={{ position: 'absolute', top: 1180, left: TEXT_LEFT + s(8), width: TEXT_WIDTH - s(8) }}>
        {/* колонка уже сайтовой (правая safe-зона) → кода в 2 строки, balance — без висячего «ваше.» */}
        <p style={{ ...display(BEAUTY_TYPE.coda.size, BEAUTY_TYPE.coda.lineHeight, BEAUTY_TYPE.coda.tracking, ink), textWrap: 'balance' }}>
          <Readable id="approach.coda" text={richPlain(sc.coda)}>
            <Rich text={sc.coda} />
          </Readable>
        </p>
      </Rise>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 02 Наші роботи
type FrameGeo = { left: number; widthFrac: number; z: number; xy: (p: number) => [number, number]; rot: (p: number) => number; opacity: (p: number) => number };
/**
 * Формулы §5.4 (десктоп, styles.css:635–639), vw/vh → 1080×1920. Ширины 56–70% кадра (на 9:16 мобильные
 * 82/76% закрывали бы «Наші роботи» целиком), кадры 4:5. Базовые top подобраны так, чтобы кадры входили
 * снизу и «пролетали» вверх за сцену. Пороги появления c/d/e (§5.4: .18/.42/.62) — из scenes.yaml appearAt:
 * сцена = 10 долей, p = k/10 — ровно доля k; рампа opacity — крутизна сайта (4.5 / 5 / 6).
 */
const framesGeo = (ap: readonly [number, number, number]): FrameGeo[] => [
  { left: TEXT_LEFT, widthFrac: 0.66, z: 2, xy: (p) => [p * vw(12), vh(72) - p * vh(72)], rot: (p) => -p * 3, opacity: () => 1 },
  { left: W - SAFE.right - 0.6 * W, widthFrac: 0.6, z: 3, xy: (p) => [-p * vw(12), vh(50) + vh(42) - p * vh(112)], rot: (p) => 3 - p * 6, opacity: () => 1 },
  { left: TEXT_LEFT + vw(8), widthFrac: 0.58, z: 2, xy: (p) => [p * vw(10), vh(30) + vh(86) - p * vh(128)], rot: () => 0, opacity: (p) => clamp01((p - ap[0]) * 4.5) },
  { left: W - SAFE.right - 0.56 * W, widthFrac: 0.56, z: 5, xy: (p) => [(p - ap[1]) * vw(10), vh(40) + (ap[1] + 0.3 - p) * vh(55)], rot: () => -2, opacity: (p) => clamp01((p - ap[1]) * 5) },
  { left: TEXT_LEFT, widthFrac: 0.7, z: 6, xy: (p) => [(ap[2] + 0.1 - p) * vw(16), vh(36) + (ap[2] + 0.22 - p) * vh(62)], rot: () => 0, opacity: (p) => clamp01((p - ap[2]) * 6) },
];

export const WorksScene: React.FC = () => {
  const t = useT();
  const sc = scene('works');
  const dur = sc.to - sc.from;
  const p = clamp01(t / dur); // прогресс сцены по времени (вместо скролла)
  const ty = BEAUTY_TYPE.works;
  const FRAMES = framesGeo(sc.appearAt);
  return (
    <AbsoluteFill>
      <SceneSurface id="works" />
      {/* §3.2: бронзовое свечение, opacity .25 + p·.75 */}
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 46%, rgba(157,104,73,.16), transparent 42%)', opacity: 0.25 + p * 0.75 }} />
      <div
        style={{
          position: 'absolute',
          // над кадрами a/b/c (z 2/3/2), под d/e (z 5/6): в 4.9 с сцены заголовок обязан прочитаться
          zIndex: 4,
          top: vh(46),
          left: '50%',
          transform: `translate(-50%, -50%) scale(${1 - p * 0.12})`,
          opacity: 0.95 - p * 0.58,
        }}
      >
        <h2 style={{ ...display(ty.size, ty.lineHeight, ty.tracking, BEAUTY_COLORS.textOnDarkTitle), textAlign: 'center', whiteSpace: 'nowrap' }}>
          <Readable id="works.title" text={sc.title.join(' ')}>
            {sc.title.map((l, i) => (
              <MaskLine key={i} t={t} at={sc.timing.titleSec[i] ?? sc.timing.titleSec[sc.timing.titleSec.length - 1]}>
                {l}
              </MaskLine>
            ))}
          </Readable>
        </h2>
      </div>
      {FRAMES.map((g, i) => {
        const [x, y] = g.xy(p);
        const w = g.widthFrac * W;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              zIndex: g.z,
              left: g.left,
              top: 0,
              width: w,
              height: w * 1.25,
              overflow: 'hidden',
              opacity: g.opacity(p),
              transform: `translate(${x}px, ${y}px) rotate(${g.rot(p)}deg)`,
            }}
          >
            <Img src={staticFile(assetPath(sc.frames[i]))} style={coverImg()} />
          </div>
        );
      })}
      {/* скрим под копирайтом: только сторона текста, тёплый почти-чёрный (§4.4, принцип) */}
      <AbsoluteFill style={{ zIndex: 7, background: 'linear-gradient(0deg, rgba(23,21,19,.94) 0%, rgba(23,21,19,.82) 26%, rgba(23,21,19,0) 44%)' }} />
      {/* вертикальный прогресс 2px × 28vh, внутри safe zone */}
      <div style={{ position: 'absolute', zIndex: 8, left: W - SAFE.right - 2, top: vh(50) - vh(14), width: 2, height: vh(28), background: BEAUTY_COLORS.progressTrack }}>
        <div style={{ width: '100%', height: '100%', background: BEAUTY_COLORS.bronze, transform: `scaleY(${p})`, transformOrigin: 'top' }} />
      </div>
      <div style={{ position: 'absolute', zIndex: 9, left: TEXT_LEFT, width: TEXT_WIDTH, bottom: SAFE.bottom + 10, ...riseStyle(t, sc.timing.copySec) }}>
        <div style={{ ...labelStyle(BEAUTY_COLORS.white), marginBottom: s(20) }}>
          <Readable id="works.counter" text={sc.counter}>
            {sc.counter}
          </Readable>
        </div>
        <p
          style={{
            margin: 0,
            marginLeft: vw(16),
            fontFamily: BEAUTY_FONTS.body,
            fontSize: BEAUTY_TYPE.body.size,
            lineHeight: BEAUTY_TYPE.body.lineHeight,
            color: BEAUTY_COLORS.textOnDark,
          }}
        >
          <Readable id="works.text" text={sc.text}>
            {sc.text}
          </Readable>
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 03 Послуги
/** Индекс активной услуги и время её начала (сек сцены). */
export const serviceStepAt = (t: number, stepSec: number) => Math.min(3, Math.max(0, Math.floor(t / stepSec)));
// Фото ≈ 61% высоты кадра (моб. сайт: 62svh), во всю ширину; текст услуги лежит на нижней части фото
// со скримом §4.4 (тёплый почти-чёрный, только сторона текста) — иначе текст уходит ниже safe zone 1540.
const PHOTO_TOP = 330;
const PHOTO_BOTTOM = 1500;
const SERVICE_SCRIM = 'linear-gradient(0deg, rgba(18,14,12,.86) 0%, rgba(18,14,12,.62) 22%, rgba(18,14,12,.0) 46%)';
const SERVICE_NAME_PX = 112; // s(50.7)=140 не помещает «Нарощування вій» в одну строку при safe zones

export const ServicesScene: React.FC = () => {
  const t = useT();
  const sc = scene('services');
  const step = serviceStepAt(t, sc.stepSec);
  const changeAt = (k: number) => (k === 0 ? sc.timing.firstPhotoSec : k * sc.stepSec);
  const item = sc.items[step];
  // §5.4: смена текста opacity .2→1, translateY 14→0, 280ms ease-out (у первой — без «.2»)
  const pt = prog(t, step === 0 ? 0 : changeAt(step), 280, BEAUTY_EASE.easeOut);
  const pBar = prog(t, step === 0 ? 0.2 : changeAt(step), 500);
  const barFrom = step / 4;
  const barTo = (step + 1) / 4;
  return (
    <AbsoluteFill>
      <SceneSurface id="services" />
      {/* §3.2: левая колонка сервиса — тёплый градиент; на вертикали — по всему кадру, слабо */}
      <AbsoluteFill style={{ background: 'linear-gradient(110deg, transparent 65%, rgba(157,104,73,.12))', opacity: 0.2 + (t / (sc.to - sc.from)) * 0.8 }} />
      <LabelRow qaId="services" t={t} at={0.1} top={SAFE.top + 10} left={sc.label[0]} right={sc.label[1]} dark>
        <div style={{ marginTop: s(8), height: 2, background: BEAUTY_COLORS.progressTrack }}>
          <div
            style={{
              height: '100%',
              background: BEAUTY_COLORS.bronze,
              transform: `scaleX(${barFrom + (barTo - barFrom) * pBar})`,
              transformOrigin: 'left',
            }}
          />
        </div>
      </LabelRow>
      <div style={{ position: 'absolute', left: 0, right: 0, top: PHOTO_TOP, height: PHOTO_BOTTOM - PHOTO_TOP, overflow: 'hidden' }}>
        {sc.items.map((it, k) => {
          const at = changeAt(k);
          if (t < at) return null;
          // §5.4: clip-path inset(100% 0 0) → inset(0) 900ms + scale 1.03→1, ease; входящее фото поверх
          const p = prog(t, at, 900);
          return (
            <div key={k} style={{ position: 'absolute', inset: 0, clipPath: `inset(${(1 - p) * 100}% 0 0 0)`, transformOrigin: 'bottom' }}>
              <Img src={staticFile(assetPath(it.image))} style={{ ...coverImg('50% 50%'), transform: `scale(${1.03 - 0.03 * p})`, transformOrigin: 'bottom' }} />
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ top: PHOTO_TOP, height: PHOTO_BOTTOM - PHOTO_TOP, background: SERVICE_SCRIM }} />
      <div style={{ position: 'absolute', left: TEXT_LEFT, width: TEXT_WIDTH, bottom: 1920 - PHOTO_BOTTOM + 34, opacity: step === 0 ? pt : 0.2 + 0.8 * pt, transform: `translateY(${(1 - pt) * s(14)}px)` }}>
        <div style={{ ...labelStyle(BEAUTY_COLORS.textOnDark), letterSpacing: '.06em', marginBottom: s(10) }}>
          <Readable id="services.n" text={item.n}>
            {item.n}
          </Readable>
        </div>
        <h3 style={{ ...display(SERVICE_NAME_PX, BEAUTY_TYPE.serviceName.lineHeight, BEAUTY_TYPE.serviceName.tracking, BEAUTY_COLORS.white), whiteSpace: 'nowrap' }}>
          <Readable id="services.name" text={item.name}>
            {item.name}
          </Readable>
        </h3>
        <p
          style={{
            margin: `${s(14)}px 0 0 ${vw(16)}px`,
            fontFamily: BEAUTY_FONTS.body,
            fontSize: BEAUTY_TYPE.body.size,
            lineHeight: BEAUTY_TYPE.body.lineHeight,
            color: BEAUTY_COLORS.textOnDarkService,
          }}
        >
          <Readable id="services.text" text={item.text}>
            {item.text}
          </Readable>
        </p>
      </div>
    </AbsoluteFill>
  );
};


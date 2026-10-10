// Сцены 5–8: 04 Деталі, 05 Студія, 08 Контакти, логотип.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useVideoConfig } from 'remotion';
import { BEAUTY_COLORS, BEAUTY_EASE, BEAUTY_FONTS, BEAUTY_TYPE, s } from '../../theme/brands/beauty-studio.ts';
import { SAFE } from '../../labs/SafeZones.tsx';
import { LabelRow, MaskLine, Rich, Rise, SceneSurface, TEXT_LEFT, TEXT_WIDTH, coverImg, display, labelStyle, prog, riseStyle, sceneIsLight, useT } from './primitives.tsx';
import { ASSETS, assetPath, scene } from './script.ts';

// §4.6: нормализация лиц (content.js) — translate после scale, проценты от несмасштабированного кадра
const FACE_NORM: Record<string, { fs: number; fx: string; fy: string }> = {
  'face-01': { fs: 1.378, fx: '18.89%', fy: '11.42%' },
  'face-02': { fs: 1.676, fx: '10.89%', fy: '23.19%' },
  'face-03': { fs: 1.512, fx: '12.85%', fy: '7.66%' },
  'face-04': { fs: 1.378, fx: '18.89%', fy: '7.98%' },
  'face-05': { fs: 1.632, fx: '3.26%', fy: '14.11%' },
};

const bodyText = (color: string): React.CSSProperties => ({
  margin: 0,
  fontFamily: BEAUTY_FONTS.body,
  fontWeight: 400,
  fontSize: BEAUTY_TYPE.body.size,
  lineHeight: BEAUTY_TYPE.body.lineHeight,
  color,
});

// ---------------------------------------------------------------- 04 Деталі
const FACE_W = 720;
export const DetailsScene: React.FC = () => {
  const t = useT();
  const sc = scene('details');
  const tm = sc.timing;
  const ty = BEAUTY_TYPE.editorial;
  const light = sceneIsLight('details');
  const ink = light ? BEAUTY_COLORS.ink : BEAUTY_COLORS.white;
  return (
    <AbsoluteFill>
      <SceneSurface id="details" />
      <LabelRow t={t} at={0.1} top={SAFE.top + 10} left={sc.label[0]} right={sc.label[1]} dark={!light} />
      <h2 style={{ ...display(ty.size, ty.lineHeight, ty.tracking, ink), position: 'absolute', top: 350, left: TEXT_LEFT, width: TEXT_WIDTH }}>
        {sc.title.map((l, i) => (
          <MaskLine key={i} t={t} at={tm.titleSec + i * 0.1}>
            {l}
          </MaskLine>
        ))}
      </h2>
      <Rise t={t} at={tm.textSec} style={{ position: 'absolute', top: 668, left: TEXT_LEFT, width: TEXT_WIDTH }}>
        <p style={bodyText(ink)}>{sc.text}</p>
      </Rise>
      <div
        style={{
          position: 'absolute',
          top: 900,
          left: TEXT_LEFT + TEXT_WIDTH + SAFE.right - TEXT_LEFT - FACE_W,
          width: FACE_W,
          height: FACE_W * 1.25,
          overflow: 'hidden',
          border: `2px solid ${BEAUTY_COLORS.ruleSecondary}`,
          background: BEAUTY_COLORS.blush,
          ...riseStyle(t, 0.2, 900),
          filter: undefined,
        }}
      >
        {sc.faces.map((id, k) => {
          const n = FACE_NORM[id];
          if (!n) throw new Error(`нет нормализации §4.6 для ${id}`);
          const at = tm.firstChangeSec + (k - 1) * tm.intervalSec;
          // кроссфейд только входящего кадра (§5.5), ease-out; длительность и шаг — под долю (scenes.yaml)
          const o = k === 0 ? 1 : prog(t, at, tm.fadeMs, BEAUTY_EASE.easeOut);
          if (o <= 0) return null;
          return (
            <Img
              key={id}
              src={staticFile(assetPath(id))}
              style={{ position: 'absolute', inset: 0, ...coverImg(), opacity: o, transform: `translate(${n.fx}, ${n.fy}) scale(${n.fs})` }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 05 Студія
const STUDIO_PHOTO_H = 1120;
export const StudioScene: React.FC = () => {
  const t = useT();
  const sc = scene('studio');
  const tm = sc.timing;
  const ty = BEAUTY_TYPE.studio;
  const light = sceneIsLight('studio');
  const ink = light ? BEAUTY_COLORS.ink : BEAUTY_COLORS.white;
  return (
    <AbsoluteFill>
      <SceneSurface id="studio" />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: STUDIO_PHOTO_H, overflow: 'hidden' }}>
        {sc.frames.map((f, k) => {
          // §5.5: растворение, входящий кадр поверх, cubic-bezier(.4,0,.2,1)
          const o = k === 0 ? 1 : prog(t, tm.changesSec[k - 1] ?? Infinity, tm.fadeMs, BEAUTY_EASE.studio);
          if (o <= 0) return null;
          return <Img key={k} src={staticFile(assetPath(f.image))} style={{ position: 'absolute', inset: 0, ...coverImg(f.objectPosition), opacity: o }} />;
        })}
      </div>
      <LabelRow t={t} at={tm.labelSec} top={STUDIO_PHOTO_H + 30} left={sc.label[0]} right={sc.label[1]} dark={!light} />
      <h2 style={{ ...display(ty.size, ty.lineHeight, ty.tracking, ink), position: 'absolute', top: 1282, left: TEXT_LEFT, width: TEXT_WIDTH }}>
        {sc.title.map((l, i) => (
          <MaskLine key={i} t={t} at={tm.titleSec[i] ?? tm.titleSec[tm.titleSec.length - 1]}>
            {l}
          </MaskLine>
        ))}
      </h2>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 08 Контакти
const TelegramIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  // простой «самолётик» линией
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round">
    <path d="M21.5 3.5 2.8 10.7l6.4 2.4 2.4 6.9 3.6-4.6 4.6 3.4z" />
    <path d="m9.2 13.1 12.3-9.6" />
  </svg>
);

const BTN_W = s(204);
const BTN_H = s(53);
export const ContactsScene: React.FC = () => {
  const t = useT();
  const sc = scene('contacts');
  const tm = sc.timing;
  const ty = BEAUTY_TYPE.contactsH2;
  // §5.7 ховер кнопки: заливка scaleX 0→1 слева 500ms ease (бронзовая → белая), текст меняет цвет 320ms,
  // сдвиг 3px 520ms, хвост scaleX 1.35 520ms
  const fill = prog(t, tm.fillSec, 500);
  const txt = prog(t, tm.fillSec, 320);
  const shift = prog(t, tm.fillSec, 520);
  const mix = (a: number[], b: number[], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  const labelColor = mix([255, 255, 255], [23, 21, 19], txt);
  const rows: { label: string; value: string }[] = [
    { label: 'Телефон', value: sc.phone },
    { label: 'Адреса', value: sc.address },
    { label: 'Instagram', value: sc.instagram },
  ];
  return (
    <AbsoluteFill>
      <SceneSurface id="contacts" />
      <LabelRow t={t} at={0.1} top={SAFE.top + 10} left={sc.label[0]} right={sc.label[1]} dark />
      <h2 style={{ ...display(ty.size, ty.lineHeight, ty.tracking, BEAUTY_COLORS.white), position: 'absolute', top: 360, left: TEXT_LEFT, width: TEXT_WIDTH }}>
        {sc.title.map((l, i) => (
          <MaskLine key={i} t={t} at={tm.titleSec[i] ?? tm.titleSec[tm.titleSec.length - 1]}>
            <Rich text={l} />
          </MaskLine>
        ))}
      </h2>
      <Rise t={t} at={tm.buttonSec} style={{ position: 'absolute', top: 955, left: TEXT_LEFT }}>
        <div
          style={{
            position: 'relative',
            width: BTN_W,
            height: BTN_H,
            borderRadius: 3,
            overflow: 'hidden',
            background: 'rgba(157,104,73,.94)',
            border: '2px solid rgba(255,255,255,.18)',
            boxShadow: `inset 0 ${s(1)}px rgba(255,255,255,.22)`,
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${s(20)}px`,
            boxSizing: 'border-box',
            gap: s(12),
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: BEAUTY_COLORS.white, transform: `scaleX(${fill})`, transformOrigin: 'left' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: s(12), transform: `translateX(${shift * s(3)}px)`, flex: 1 }}>
            <TelegramIcon size={s(17)} color={labelColor} />
            <span style={{ fontFamily: BEAUTY_FONTS.body, fontSize: BEAUTY_TYPE.button.size, color: labelColor, whiteSpace: 'nowrap', flex: 1 }}>{sc.button}</span>
            <span style={{ width: s(38), height: 2, background: labelColor, transform: `scaleX(${1 + 0.35 * shift})`, transformOrigin: 'left' }} />
          </div>
        </div>
        <div style={{ ...bodyText(BEAUTY_COLORS.textOnDark), fontSize: s(13), marginTop: s(14) }}>{sc.hours}</div>
      </Rise>
      {/* метки «Телефон/Адреса/Instagram» сайта опущены: с ними нижняя строка уходит ниже 1540 (safe zone) */}
      <div style={{ position: 'absolute', left: TEXT_LEFT, width: TEXT_WIDTH, top: 1190 }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ borderTop: `2px solid ${BEAUTY_COLORS.ruleDarkSecondary}`, padding: `${s(9)}px 0 ${s(10)}px`, ...riseStyle(t, tm.infoSec + i * 0.1) }}>
            <div style={{ ...display(BEAUTY_TYPE.contactValue.size, BEAUTY_TYPE.contactValue.lineHeight, '0', BEAUTY_COLORS.white) }}>{r.value}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Логотип
// §3.5: двухосевая маска-растушёвка ролика заставки
const LOGO_MASK =
  'linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%), linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%)';

export const LogoScene: React.FC = () => {
  const t = useT();
  const { fps } = useVideoConfig();
  const sc = scene('logo');
  const logo = ASSETS.assets.logo;
  const w = 1080 * sc.video.widthFrac;
  const h = (w * logo.height) / logo.width;
  const dur = sc.to - sc.from;
  return (
    <AbsoluteFill>
      <SceneSurface id="logo" />
      <div
        style={{
          position: 'absolute',
          left: (1080 - w) / 2,
          top: 960 - h / 2 - 40,
          width: w,
          height: h,
          maskImage: LOGO_MASK,
          WebkitMaskImage: LOGO_MASK,
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      >
        {/* звук ролика логотипа НЕ используется — музыка несёт ролик (в ассете звука нет, muted — явно) */}
        <OffthreadVideo src={staticFile(assetPath(sc.video.asset))} trimBefore={Math.round(sc.video.startSec * fps)} muted style={coverImg()} />
      </div>
      <Rise t={t} at={dur - sc.timing.captionLastSec} style={{ position: 'absolute', left: 0, right: 0, top: 960 + h / 2 + 10, textAlign: 'center' }}>
        <span style={labelStyle(BEAUTY_COLORS.ink)}>{sc.caption}</span>
      </Rise>
    </AbsoluteFill>
  );
};

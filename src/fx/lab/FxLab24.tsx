// Лаборатория приёмов src/fx (задача 012-А): 1080×1920, 24 fps, 4.5 с. Плитки: удар S / M / L, слэм, штамп, плашка,
// смаз-склейка, ramp + подвод на синтетическом видео (public/fixtures, scripts/fxlab.mjs fixtures), look film | monoHit.
// События на 0.5 / 1.5 / 2.5 / 3.5 с (cinematic-fx §4); удар L — на 1.5 и 3.5 с (лист удара: кадры 32…44 = −4…+8 от f36).
// Текст — только <Readable> в safe zones (readcheck FxLab24); только пресеты src/fx, всё — функция кадра.
import React from 'react';
import { AbsoluteFill, Freeze, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { fontFor } from '../../theme/fonts.ts';
import { fontStack, loadAllFonts } from '../../theme/loadFonts.ts';
import { Readable } from '../../qa/Readable.tsx';
import { step } from '../../motion/spring.ts';
import { RAMP, remapSpeed, type Cuts } from '../core.ts';
import { HIT, LOOK, RECOIL, type HitPreset } from '../presets.ts';
import { Filters, HitLayer, LeadFlash, LeadIn, Look, Rays, Slam, Stamp, TagPlate, WhipCut, White, filterCss, lookFilter, useHit } from '../components.tsx';
import { FX_FIXTURES } from './fixtures.ts';

loadAllFonts();

export const FX_LAB_FPS = 24;
export const FX_LAB_FRAMES = 108; // 4.5 с
const EV = [0.5, 1.5, 2.5, 3.5]; // с — события
const END = FX_LAB_FRAMES / FX_LAB_FPS;
const BG = '#17161a';
const INK = '#efeae0';
const ACC = '#d9a05b';
const MUTE = '#6f6a63';
const CARD = '#F7C600';
const COL = 540;
const ROW = 384;
const grainTiles = () => FX_FIXTURES.grain.map((g) => staticFile(g));

const Tile: React.FC<{ col: number; row: number; span?: number; title: string; note: string; children: React.ReactNode }> = ({ col, row, span = 1, title, note, children }) => (
  <div style={{ position: 'absolute', left: col * COL, top: row * ROW, width: COL * span, height: ROW, overflow: 'hidden', boxSizing: 'border-box', borderRight: `1px solid ${MUTE}`, borderBottom: `1px solid ${MUTE}` }}>
    {children}
    <div style={{ position: 'absolute', left: 24, top: 16, fontFamily: fontStack('JetBrainsMono'), fontSize: 24, color: INK, textShadow: '0 0 6px #000' }}>{title}</div>
    <div style={{ position: 'absolute', left: 24, bottom: 14, fontFamily: fontStack('JetBrainsMono'), fontSize: 17, color: MUTE, textShadow: '0 0 6px #000' }}>{note}</div>
  </div>
);

/** «Предыдущий план»: градиент и медленно плывущие полосы — есть что обесцвечивать, трясти и смазывать. */
const Scene: React.FC<{ w: number; h: number; hue: number }> = ({ w, h, hue }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, background: `linear-gradient(135deg, hsl(${hue} 60% 28%), hsl(${hue + 40} 70% 55%))` }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ position: 'absolute', left: ((i * w) / 4 + f * 3) % w, top: 0, width: 40, height: h, background: 'rgba(255,255,255,0.16)' }} />
      ))}
    </div>
  );
};

/** Силуэт героя (голова + плечи); poster — жёсткий ч/б-постер с белым контуром для impact-кадра. */
const Figure: React.FC<{ x: number; y: number; h: number; poster?: boolean }> = ({ x, y, h, poster }) => {
  const w = h * 0.7;
  const fill = poster ? '#000' : ACC;
  const stroke = poster ? '#fff' : '#000';
  const sw = poster ? 14 : 6;
  return (
    <svg style={{ position: 'absolute', left: x, top: y, width: w, height: h, overflow: 'visible' }} viewBox={`0 0 ${w} ${h}`}>
      <circle cx={w * 0.5} cy={h * 0.18} r={h * 0.14} fill={fill} stroke={stroke} strokeWidth={sw} />
      <path d={`M${w * 0.08},${h} L${w * 0.08},${h * 0.62} Q${w * 0.5},${h * 0.3} ${w * 0.92},${h * 0.62} L${w * 0.92},${h} Z`} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  );
};

/** Удар по пресету внутри <Sequence>, начинающегося в кадре удара: HitLayer (вспышка, impact) → отдача по env. */
const HitDemo: React.FC<{ preset: HitPreset; seed: string; w: number; h: number; hue: number; bg: string; name?: string; nameId?: string }> = ({ preset, seed, w, h, hue, bg, name, nameId }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const env = useHit(preset, seed);
  const cx = w * 0.7;
  const cy = h * 0.55;
  const figH = h * 0.8;
  const figX = cx - figH * 0.35;
  const figY = h - figH + 12;
  const under = <Scene w={w} h={h} hue={hue} />;
  if (env.phase !== 'recoil') return <HitLayer env={env} preset={preset} under={under} bg={bg} center={{ x: cx, y: cy }} size={{ w, h }} impact={<Figure x={figX} y={figY} h={figH} poster />} />;
  const [sx, sy] = env.shake;
  const id = `lab-${seed}`;
  const R = Math.hypot(w, h) * 1.2;
  const r = R * env.reveal;
  const fig = RECOIL.figure;
  const figSc = 1 + fig.pop * (1 - step(t - fig.delay, fig.spring)) + fig.grow * t;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Filters id={id} ca={env.ca} smear={0} />
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${env.zoom})`, transformOrigin: `${(cx / w) * 100}% ${(cy / h) * 100}%`, filter: filterCss(id, env.ca, 0) }}>
        {preset.reveal ? (
          <>
            {r < R * 0.98 ? <AbsoluteFill style={{ filter: lookFilter(LOOK.monoHit) }}>{under}</AbsoluteFill> : null}
            <AbsoluteFill style={{ clipPath: `circle(${r}px at ${cx}px ${cy}px)`, backgroundColor: bg }}>
              <Rays cx={cx} cy={cy} n={18} color="#000" alpha={0.11} rad={RECOIL.raysSpin * t} />
            </AbsoluteFill>
            <div style={{ position: 'absolute', left: figX + fig.drift * t, top: figY, width: figH * 0.7, height: figH, transform: `scale(${figSc})`, transformOrigin: '50% 60%' }}>
              <Figure x={0} y={0} h={figH} />
            </div>
            {name ? <Slam id={nameId ?? `lab.${seed}`} text={name} size={150} t={t - RECOIL.nameAt} align={{ left: 36 }} top={h * 0.3} origin="0% 50%" fontFamily={fontFor('Anton', name)} /> : null}
          </>
        ) : (
          under
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SlamDemo: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <Slam id="lab.slam" text="ROOK" size={170} t={f / fps} align={{ left: 36 }} top={100} origin="0% 50%" fontFamily={fontFor('Anton', 'ROOK')} />;
};
const StampDemo: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stamp t={f / fps} origin="0% 0%" style={{ left: 60, top: 120, fontFamily: fontFor('Oswald', '#2'), fontSize: 120, color: INK, lineHeight: 1 }}>
      <Readable id="lab.stamp" text="#2">
        #2
      </Readable>
    </Stamp>
  );
};
const TagDemo: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = 'THE HUNTER';
  return (
    <TagPlate t={f / fps} style={{ left: 36, top: 150, fontFamily: fontFor('Oswald', tag), fontWeight: 500, fontSize: 60, lineHeight: 1.2, color: ACC }}>
      <Readable id="lab.tag" text={tag}>
        {tag}
      </Readable>
    </TagPlate>
  );
};

/** Панель склейки: цвет и крупная цифра (не для чтения — без <Readable>). */
const Panel: React.FC<{ i: number }> = ({ i }) => (
  <AbsoluteFill style={{ backgroundColor: `hsl(${i * 70 + 10} 55% 40%)`, justifyContent: 'center', alignItems: 'center' }}>
    <div aria-hidden style={{ fontFamily: fontStack('JetBrainsMono'), fontSize: 180, color: 'rgba(255,255,255,0.85)' }}>
      {i + 1}
    </div>
  </AbsoluteFill>
);

// ---------------------------------------------------------------- ramp на синтетическом видео (#038, межкадровое смешивание)
const V = FX_FIXTURES.video;
const SrcFrame: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 1 }) => (
  <Freeze frame={Math.max(0, Math.min(V.frames - 1, frame))} active>
    <OffthreadVideo src={staticFile(V.file)} muted style={{ position: 'absolute', left: 0, top: 0, width: V.w, height: V.h, opacity }} />
  </Freeze>
);
const SrcAt: React.FC<{ pos: number }> = ({ pos }) => {
  const i0 = Math.floor(pos + 1e-6);
  const fr = pos - i0;
  return (
    <>
      <SrcFrame frame={i0} />
      {fr > 0.02 ? <SrcFrame frame={i0 + 1} opacity={fr} /> : null}
    </>
  );
};
const PlayLoop: React.FC = () => {
  const f = useCurrentFrame();
  return <SrcAt pos={f % V.frames} />;
};
const RampLead: React.FC<{ n: number }> = ({ n }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <LeadIn id="lab-ramp" dur={(n - 1) / fps}>
        <SrcAt pos={remapSpeed(f, n, V.frames, Math.round(RAMP.slowDur * fps), RAMP.slow)} />
      </LeadIn>
      <LeadFlash hitAt={n / fps} />
    </>
  );
};
const RampHit: React.FC = () => {
  const env = useHit(HIT.M, 'lab-ramp');
  const [sx, sy] = env.shake;
  return (
    <>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(1.04)` }}>
        <SrcAt pos={V.frames - 1} />
      </AbsoluteFill>
      <White a={env.flash} />
    </>
  );
};

export const FxLab24: React.FC = () => {
  const { fps } = useVideoConfig();
  const at = (s: number) => Math.round(s * fps);
  const hitSeq = (preset: HitPreset, hue: number) => (
    <>
      <Sequence from={0} durationInFrames={at(EV[0])}>
        <Scene w={COL} h={ROW} hue={hue} />
      </Sequence>
      {EV.map((e, i) => (
        <Sequence key={i} from={at(e)} durationInFrames={at(1)}>
          <HitDemo preset={preset} seed={`${preset.name}${i}`} w={COL} h={ROW} hue={hue} bg={BG} />
        </Sequence>
      ))}
    </>
  );
  // склейки смаза: направление чередуется по склейкам; каждая вторая панель уходит «как карточка» (3 кадра + затемнение)
  const segs = [0, ...EV, END];
  const dirOf = (j: number) => (j % 2 === 0 ? 1 : -1);
  const rampN = at(EV[3]) - at(EV[2]);
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Tile col={0} row={0} title="удар S · zoom-punch" note="+7 % за кадр · возврат 8 к E.out · на каждой доле">
        {hitSeq(HIT.S, 200)}
      </Tile>
      <Tile col={1} row={0} title="удар M" note="вспышка 60 % · тряска 12 px ×0.72 · хроматика 6 px">
        {hitSeq(HIT.M, 290)}
      </Tile>
      <Tile col={0} row={1} title="слэм имени (#008)" note="1.9→1 SPR.slam · шлейф 2 копии · полёт полупрозрачен">
        {[EV[0], EV[2]].map((e, i) => (
          <Sequence key={i} from={at(e)} durationInFrames={at(2)}>
            <SlamDemo />
          </Sequence>
        ))}
      </Tile>
      <Tile col={1} row={1} title="штамп номера" note="2.2→1 SPR.stamp">
        {[EV[0], EV[2]].map((e, i) => (
          <Sequence key={i} from={at(e)} durationInFrames={at(2)}>
            <StampDemo />
          </Sequence>
        ))}
      </Tile>
      <Tile col={0} row={2} title="плашка подписи (#005)" note="маска 7 к E.out · въезд 60 px">
        {[EV[0], EV[2]].map((e, i) => (
          <Sequence key={i} from={at(e)} durationInFrames={at(2)}>
            <TagDemo />
          </Sequence>
        ))}
      </Tile>
      <Tile col={1} row={2} title="смаз-склейка (#043)" note="вход 120/60 · выход 60/120 · из карточки 90/180/270 + тьма">
        {segs.slice(0, -1).map((a, i) => {
          const b = segs[i + 1];
          const cuts: Cuts = { inDir: i === 0 ? 0 : dirOf(i), outDir: i === segs.length - 2 ? 0 : dirOf(i + 1), outIsCard: i % 2 === 1 };
          return (
            <Sequence key={i} from={at(a)} durationInFrames={at(b) - at(a)}>
              <WhipCut id={`lab-whip${i}`} dur={(at(b) - at(a)) / fps} cuts={cuts}>
                <Panel i={i} />
              </WhipCut>
            </Sequence>
          );
        })}
      </Tile>
      <Tile col={0} row={3} span={2} title="удар L — анатомия ROOK" note="подвод → вспышка 90 % → 2 impact-кадра → раскрытие кругом · слэм · тряска 30/22/12 · хроматика 14">
        <Sequence from={0} durationInFrames={at(EV[1])}>
          <LeadIn id="lab-L-lead" dur={(at(EV[1]) - 1) / fps}>
            <Scene w={COL * 2} h={ROW} hue={20} />
          </LeadIn>
          <LeadFlash hitAt={EV[1]} />
        </Sequence>
        {[EV[1], EV[3]].map((e, i) => (
          <Sequence key={i} from={at(e)} durationInFrames={at(2)}>
            <HitDemo preset={HIT.L} seed={`L${i}`} w={COL * 2} h={ROW} hue={20} bg={CARD} name="HIT L" nameId="lab.hitL" />
          </Sequence>
        ))}
      </Tile>
      <Tile col={0} row={4} title="ramp (#038) + подвод → удар M" note="testsrc2 · ×0.55 последние 9 к · наезд 1.16 · ч/б · засветка 35/70 %">
        <Sequence from={0} durationInFrames={at(EV[2])}>
          <PlayLoop />
        </Sequence>
        <Sequence from={at(EV[2])} durationInFrames={rampN}>
          <RampLead n={rampN} />
        </Sequence>
        <Sequence from={at(EV[3])} durationInFrames={FX_LAB_FRAMES - at(EV[3])}>
          <RampHit />
        </Sequence>
      </Tile>
      <Tile col={1} row={4} title="look: film | monoHit" note="зерно 0.07 Img-тайлы · виньетка 0.42 | grayscale · contrast 1.4">
        <div style={{ position: 'absolute', left: 0, top: 0, width: COL / 2, height: ROW, overflow: 'hidden' }}>
          <Scene w={COL / 2} h={ROW} hue={200} />
          <Look preset={LOOK.film} tiles={grainTiles()} />
        </div>
        <div style={{ position: 'absolute', left: COL / 2, top: 0, width: COL / 2, height: ROW, overflow: 'hidden' }}>
          <AbsoluteFill style={{ filter: lookFilter(LOOK.monoHit) }}>
            <Scene w={COL / 2} h={ROW} hue={200} />
          </AbsoluteFill>
          <Look preset={LOOK.monoHit} tiles={grainTiles()} />
        </div>
      </Tile>
    </AbsoluteFill>
  );
};

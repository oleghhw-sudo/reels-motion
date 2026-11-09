// Блок 4 «Петля навчання» (задача 032, правки Олега 09.11): станции петли раскрываются в схематичные панели по правилам
// эталона блоков 3а–3в — панель вырастает из станции за 0.8 с, соседи сжимаются в карточки (слева — пройденная, справа —
// следующая), по каналам всё время бегут зелёные трассы. Интерфейсы петли не рисуются: только реальные элементы и факты
// проекта — карточка задачи стенда #/queue (DPR 3), вырезки сканов блока 3а, «Два незалежних читання» стенда, типы ошибок,
// предложения из текста диктора, сетка эталона, версия навички читання (в проекте 0.2.0).
// Окно панелей — от первой станции до «перевірки на еталоні»; потом последняя панель сжимается обратно в свою станцию мира,
// значок версии уходит по петле в «Розпізнавання» и «Два читання» (мир, Scheme.tsx). Всё — функция времени t (гейт 1).
import React from 'react';
import { clamp, expoOut, lerp, seg, smoother, type Pt } from '../../motion/index.ts';
import { BADGE_PATH, DELAY, LOOP_WIN, MOVE, N, PANELS, TRAVEL, VERSION, at, loopLayout, loopMix, loopStage, type LoopCard } from './loop-layout.ts';
export { VERSION } from './loop-layout.ts';
export { loopMix } from './loop-layout.ts';
import { Readable } from '../../qa/Readable.tsx';
import { type Cam } from './camera.ts';
import { frameAmt } from './layout.ts';
import { Field } from './Field.tsx';
import { along } from './geom.ts';
import { A, CONTENT, GEO, Outline, PanView, STAND_K, ValueChip, frameBox } from './panels.tsx';
import { LOOP_STEPS, nodeById } from './schema.ts';
import { CH_IN, CH_OUT, PANEL } from './stage.ts';
import { LOOP_EV } from './timeline.ts';
import { BORDER, C, TEXTURE_ATTR, TYPE, bcolor, mixBorder, rgba } from './tokens.ts';

// ---------------------------------------------------------------- содержимое панелей (координаты CONTENT 1000×476)
const NOTE = 'стор. 3, не 2'; // читання збіглися (30 750,00 грн/міс), сторінки різні: A — 3, B — 2 (стенд, задача «Орендна плата · doc3»)
const VALUE = '30 750,00 грн/міс';

const Cursor: React.FC<{ x: number; y: number; a: number; press: number }> = ({ x, y, a, press }) =>
  a > 0 ? (
    <svg style={{ position: 'absolute', left: x, top: y, overflow: 'visible', opacity: a, transform: `scale(${1.3 - 0.15 * press})`, transformOrigin: '0 0' }} width={1} height={1}>
      <path d="M0,0 L0,30 L8,23 L13,35 L18,33 L13,21 L23,21 Z" fill={C.ink} stroke={C.paper} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  ) : null;

/** «рішення людини»: карточка задачи стенда — модель пропонує (два читання) → курсор жмёт «Виправити» → примечание. */
const Decision: React.FC<{ t: number }> = ({ t }) => {
  const g = GEO.card;
  const f = GEO.fix;
  const k = STAND_K;
  const vw = CONTENT.w / k;
  const vh = CONTENT.h / k;
  const e = LOOP_EV;
  const atReadings = { x: g.w - vw, y: Math.max(0, g.readings.y - 30) };
  const down = e.fix - 1.15;
  const swap = smoother(seg(t, e.fix + 0.05, e.fix + 0.3));
  const cu = smoother(seg(t, e.fix - 0.65, e.fix - 0.08));
  const press = clamp(1 - Math.abs(t - e.fix) / 0.12);
  const typed = Math.round(NOTE.length * clamp(seg(t, e.fix + 0.32, e.fix + 0.62)));
  return (
    <div style={frameBox(CONTENT.w, CONTENT.h, { left: 0, top: 0 })}>
      {swap < 1 ? (
        <PanView t={t} src={A('stand-queue-card.png')} imgW={g.w} imgH={g.h} k={k} w={CONTENT.w} h={CONTENT.h} opacity={1 - swap} keys={[{ at: 0, ...atReadings }, { at: down, x: 0, y: g.h - vh, dur: 0.5 }]}>
          {(S) => {
            const rd = S(g.readings);
            const from = S({ x: g.fix.x + g.fix.w * 0.9, y: g.fix.y - 140, w: 0, h: 0 });
            const to = S({ x: g.fix.x + g.fix.w * 0.5, y: g.fix.y + g.fix.h * 0.6, w: 0, h: 0 });
            const btn = S(g.fix);
            return (
              <>
                {/* «Модель пропонує»: два незалежних читання — рамка охрой */}
                <Outline r={{ x: rd.x - 4, y: rd.y - 4, w: rd.w + 8, h: rd.h + 8 }} p={smoother(seg(t, e.model, e.model + 0.45))} color={rgba(C.tight, 0.9)} a={1 - seg(t, down, down + 0.3)} />
                <div style={{ position: 'absolute', left: btn.x, top: btn.y, width: btn.w, height: btn.h, borderRadius: 8, background: rgba(C.ink, 0.22 * press) }} />
                <Cursor x={lerp(from.x, to.x, cu)} y={lerp(from.y, to.y, cu)} a={seg(t, e.fix - 0.7, e.fix - 0.55)} press={press} />
              </>
            );
          }}
        </PanView>
      ) : null}
      {swap > 0 ? (
        <PanView t={t} src={A('stand-queue-fix.png')} imgW={f.w} imgH={f.h} k={k} w={CONTENT.w} h={CONTENT.h} opacity={swap} keys={[{ at: 0, x: 0, y: f.h - vh }]}>
          {(S) => {
            const n = S(f.note);
            const sv = S(f.save);
            const shown = NOTE.slice(0, typed);
            return (
              <>
                {/* примечание печатается поверх поля (плейсхолдер закрыт бумагой стенда) */}
                <div style={{ position: 'absolute', left: n.x + 6, top: n.y + 6, width: n.w - 12, height: n.h - 12, background: 'rgb(249, 243, 232)' }} />
                <div style={{ position: 'absolute', left: n.x + 34, top: n.y + 24, ...TYPE.chip, fontSize: 30, color: C.ink, whiteSpace: 'nowrap' }} {...(typed < NOTE.length ? TEXTURE_ATTR : {})}>
                  {typed >= NOTE.length ? (
                    <Readable id="loop.p0.note" text={NOTE}>
                      {NOTE}
                    </Readable>
                  ) : (
                    shown
                  )}
                  {typed < NOTE.length && typed > 0 ? <span style={{ display: 'inline-block', width: 3, height: 30, background: C.ink, marginLeft: 2, verticalAlign: 'middle' }} /> : null}
                </div>
                <Cursor x={sv.x + sv.w * 0.5} y={sv.y + sv.h * 0.6} a={1 - seg(t, e.fix + 0.4, e.fix + 0.6)} press={0} />
              </>
            );
          }}
        </PanView>
      ) : null}
    </div>
  );
};

/** «контрольний приклад»: исправленное значение приходит по каналу и становится карточкой теста «очікувано / отримано». */
const Example: React.FC<{ t: number }> = ({ t }) => {
  const t0 = at(1) + DELAY + MOVE * 0.75;
  const r1 = expoOut(seg(t, t0 + 0.05, t0 + 0.45));
  const r2 = expoOut(seg(t, t0 + 0.3, t0 + 0.7));
  const row = (a: number, label: string, page: string, tone: string, id: string, y: number) => (
    <div style={{ position: 'absolute', left: 40, top: y, width: 920, height: 92, opacity: a, transform: `translateX(${(1 - a) * -24}px)`, display: 'flex', alignItems: 'center', gap: 28, borderTop: `1.5px solid ${C.line}` }}>
      <div style={{ width: 200, fontFamily: TYPE.detail.fontFamily, fontSize: 30, color: C.muted }}>
        <Readable id={`loop.p1.${id}`} text={label}>
          {label}
        </Readable>
      </div>
      <div {...TEXTURE_ATTR} style={{ ...TYPE.chip, fontSize: 32, color: C.ink, width: 400 }}>
        {VALUE}
      </div>
      <div style={{ ...TYPE.chip, fontSize: 32, color: tone, border: `2px solid ${rgba(tone, 0.8)}`, borderRadius: 8, padding: '2px 14px', whiteSpace: 'nowrap' }}>
        <Readable id={`loop.p1.${id}.page`} text={page}>
          {page}
        </Readable>
      </div>
    </div>
  );
  return (
    <div style={frameBox(CONTENT.w, CONTENT.h, { left: 0, top: 0 })}>
      <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: 40, top: 40, fontFamily: TYPE.detail.fontFamily, fontSize: 24, color: C.muted }}>
        тест · Орендна плата за договором · doc3
      </div>
      {row(r1, 'очікувано', 'стор. 3', C.green, 'exp', 130)}
      {row(r2, 'отримано', 'стор. 2', C.crit, 'got', 222)}
      <div style={{ position: 'absolute', left: 40, top: 314, width: 920, borderTop: `1.5px solid ${C.line}`, opacity: r2 }} />
    </div>
  );
};

/** «щотижневий розбір»: ошибки (реальные вырезки блока 3а и расхождение читаний стенда) ложатся в колонки типов, без чисел. */
const TYPES = [
  { label: 'печатка', src: 's5_crop_1.png' },
  { label: 'бліде', src: 's5_crop_2.png' },
  { label: 'рукопис', src: 's5_crop_3.png' },
  { label: 'розбіжність читань', src: 'stand-readings-diff.png' },
] as const;
const Review: React.FC<{ t: number }> = ({ t }) => {
  const t0 = at(2) + DELAY + MOVE * 0.6;
  const colW = 226;
  const gap = 32;
  const x0 = (CONTENT.w - (colW * 4 + gap * 3)) / 2;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {TYPES.map((ty, i) => {
        const x = x0 + i * (colW + gap);
        const h = expoOut(seg(t, t0 + i * 0.08, t0 + 0.4 + i * 0.08));
        return (
          <div key={ty.label} style={{ position: 'absolute', left: x, top: 0, width: colW, height: CONTENT.h }}>
            <div style={{ height: 70, display: 'flex', alignItems: 'flex-end', paddingBottom: 10, boxSizing: 'border-box', borderBottom: `2px solid ${rgba(C.ink, 0.38 * h)}`, opacity: h, fontFamily: TYPE.detail.fontFamily, fontSize: 28, lineHeight: 1.1, color: C.ink }}>
              <Readable id={`loop.p2.${i}`} text={ty.label}>
                {ty.label}
              </Readable>
            </div>
            {/* стопка: реальная вырезка сверху, под ней — бледные следы (ошибок много, чисел не даём) */}
            {[2, 1, 0].map((d) => {
              const k = expoOut(seg(t, LOOP_EV.types - 0.5 + i * 0.22 + (2 - d) * 0.1, LOOP_EV.types - 0.05 + i * 0.22 + (2 - d) * 0.1));
              return (
                <div key={d} {...TEXTURE_ATTR} style={frameBox(colW, 128, { left: 0, top: 96 + d * 22 + (1 - k) * -60, opacity: k * (d === 0 ? 1 : 0.35 / d), transform: `translateX(${(1 - k) * -120}px) rotate(${(1 - k) * -6}deg)`, borderRadius: 4, boxShadow: d === 0 ? '0 4px 12px rgba(28,32,30,0.14)' : 'none' })}>
                  <img src={A(ty.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: ty.src.startsWith('stand') ? '50% 12%' : '50% 50%' }} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/** «пропозиція»: три чипа из текста диктора — выбирается «навичка читання». */
const OFFERS = ['словник', 'бібліотека формулювань', 'навичка читання'] as const;
const Proposal: React.FC<{ t: number }> = ({ t }) => {
  const pick = smoother(seg(t, LOOP_EV.tags[2] + 0.55, LOOP_EV.tags[2] + 0.9));
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {OFFERS.map((o, i) => {
        const a = expoOut(seg(t, LOOP_EV.tags[i], LOOP_EV.tags[i] + 0.45));
        const chosen = i === 2;
        const b = chosen ? mixBorder(BORDER.active, BORDER.human, pick) : BORDER.active;
        const drift = Math.sin((t + i * 1.3) * 1.1) * 3;
        return (
          <div key={o} style={{ position: 'absolute', left: 500, top: 70 + i * 128 + drift, transform: `translate(-50%, 0) translateY(${(1 - a) * 18}px) scale(${chosen ? 1 + 0.05 * pick : 1})`, opacity: a * (chosen ? 1 : 1 - 0.08 * pick), display: 'flex', alignItems: 'center', gap: 16, fontFamily: TYPE.detail.fontFamily, fontSize: 36, color: C.ink, background: chosen ? `color-mix(in srgb, ${C.warnBg} ${(1 - pick) * 100}%, ${rgba(C.green, 0.14)})` : C.warnBg, border: `${b.width + 0.4}px solid ${bcolor(b)}`, borderRadius: 40, padding: '14px 34px', whiteSpace: 'nowrap' }}>
            {chosen && pick > 0 ? <span {...TEXTURE_ATTR} style={{ width: 34, height: 34, borderRadius: 17, background: C.green, color: C.paper, ...TYPE.chip, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pick})` }}>✓</span> : null}
            <Readable id={`loop.p3.${i}`} text={o}>
              {o}
            </Readable>
          </div>
        );
      })}
    </div>
  );
};

/** «перевірка на еталоні»: 12 карточек договоров эталона загораются по одной; подпись «критичні поля: 0 нових помилок». */
const GRID = { cols: 4, rows: 3, w: 128, h: 104, gx: 18, gy: 20, x: 34, y: 92 } as const;
const Check: React.FC<{ t: number }> = ({ t }) => {
  const t0 = LOOP_EV.check - 1.2;
  const capA = expoOut(seg(t, LOOP_EV.check + 0.15, LOOP_EV.check + 0.55));
  const labA = expoOut(seg(t, at(4) + DELAY + MOVE * 0.6, at(4) + DELAY + MOVE + 0.3));
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: GRID.x, top: 30, opacity: labA, fontFamily: TYPE.detail.fontFamily, fontSize: 28, color: C.muted }}>
        <Readable id="loop.p4.etalon" text="еталон">
          еталон
        </Readable>
      </div>
      {Array.from({ length: GRID.cols * GRID.rows }, (_, i) => {
        const cx = GRID.x + (i % GRID.cols) * (GRID.w + GRID.gx);
        const cy = GRID.y + Math.floor(i / GRID.cols) * (GRID.h + GRID.gy);
        const on = smoother(seg(t, t0 + i * 0.12, t0 + i * 0.12 + 0.25));
        const b = mixBorder(BORDER.normal, BORDER.human, on);
        return (
          <div key={i} {...TEXTURE_ATTR} style={{ position: 'absolute', left: cx, top: cy, width: GRID.w, height: GRID.h, boxSizing: 'border-box', border: `${b.width}px solid ${bcolor(b)}`, borderRadius: 6, background: on > 0 ? rgba(C.green, 0.1 * on) : C.paper, opacity: labA }}>
            {[0, 1, 2, 3].map((l) => (
              <div key={l} style={{ position: 'absolute', left: 14, top: 18 + l * 16, width: [80, 96, 64, 88][(l + i) % 4], height: 5, borderRadius: 2, background: rgba(C.ink, 0.16) }} />
            ))}
            {on > 0 ? <div style={{ position: 'absolute', right: 8, bottom: 8, width: 26, height: 26, borderRadius: 13, background: C.green, color: C.paper, ...TYPE.chip, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${on})` }}>✓</div> : null}
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 640, top: 150, opacity: capA, transform: `translateY(${(1 - capA) * 10}px)` }}>
        <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 30, color: C.muted }}>
          <Readable id="loop.p4.critical" text="критичні поля">
            критичні поля
          </Readable>
        </div>
        <div style={{ marginTop: 6, fontFamily: TYPE.detail.fontFamily, fontSize: 40, color: C.green }}>
          <Readable id="loop.p4.zero" text="0 нових помилок">
            0 нових помилок
          </Readable>
        </div>
      </div>
    </div>
  );
};

const CONTENTS: React.FC<{ t: number }>[] = [Decision, Example, Review, Proposal, Check];

// ---------------------------------------------------------------- значок версии: панель «перевірки» → по петле в узлы
/** «навичка читання v0.2 → v0.3» (в проекте сейчас 0.2.0): появляется после проверки, уходит по зелёной трассе. */
const BADGE_PANEL: Pt = [PANEL.x + CONTENT.x + 812, PANEL.y + CONTENT.y + 330]; // под подписью «0 нових помилок», правее сетки

const VersionBadge: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const a = expoOut(seg(t, VERSION.show, VERSION.show + 0.4)) * (1 - smoother(seg(t, VERSION.read2, VERSION.read2 + 0.4)));
  if (a <= 0) return null;
  const bump = smoother(seg(t, VERSION.bump, VERSION.bump + 0.4));
  const toW = (p: Pt): Pt => [p[0] * cam.s + cam.ox, p[1] * cam.s + cam.oy];
  // панель → станция мира (за время сжатия), затем по пути
  const leave = smoother(seg(t, LOOP_WIN.out, LOOP_WIN.out + MOVE * 0.9));
  const k = smoother(seg(t, TRAVEL.from, TRAVEL.to));
  const onPath = toW(along(BADGE_PATH, k));
  const x = lerp(BADGE_PANEL[0], onPath[0], leave);
  const y = lerp(BADGE_PANEL[1], onPath[1], leave);
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${1 - 0.12 * leave})`, opacity: a, display: 'flex', alignItems: 'center', gap: 14, background: C.paper, border: `${BORDER.human.width + 0.6}px solid ${bcolor(BORDER.human)}`, borderRadius: 30, padding: '8px 22px', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(28,32,30,0.16)' }}>
      <span style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 28, color: C.ink }}>
        <Readable id="loop.version.skill" text="навичка читання">
          навичка читання
        </Readable>
      </span>
      <span style={{ ...TYPE.chip, fontSize: 28, color: C.green }}>
        {bump > 0.5 ? (
          <Readable id="loop.version.v" text="v0.2 → v0.3">
            v0.2 → v0.3
          </Readable>
        ) : (
          <span {...TEXTURE_ATTR}>v0.2</span>
        )}
      </span>
    </div>
  );
};

/** Значок версии на обновлённом узле (экранные px), с прихода значка до конца блока 5. */
export const NodeVersion: React.FC<{ id: 'ocr' | 'read2'; t: number; cam: Cam; until: number }> = ({ id, t, cam, until }) => {
  const t0 = VERSION[id];
  const n = nodeById(id);
  // при наезде камеры значок у края кадра гаснет вместе с текстом узла (не режется краем, не заходит в зону заголовка)
  const fa = frameAmt(n.x + n.w / 2 - 60, n.y - n.h / 2 - 24, n.x + n.w / 2 + 20, n.y - n.h / 2 + 16, cam);
  const a = expoOut(seg(t, t0, t0 + 0.4)) * (1 - smoother(seg(t, until - 0.6, until))) * fa.inA;
  if (a <= 0.01) return null;
  const x = (n.x + n.w / 2) * cam.s + cam.ox;
  const y = (n.y - n.h / 2) * cam.s + cam.oy;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-70%, -55%) scale(${0.8 + 0.2 * a})`, opacity: a, ...TYPE.chip, fontSize: 24, color: C.paper, background: C.green, borderRadius: 14, padding: '2px 12px', whiteSpace: 'nowrap' }}>
      <Readable id={`loop.version.${id}`} text="v0.3">
        v0.3
      </Readable>
    </div>
  );
};

// ---------------------------------------------------------------- сцена станций
export const LoopStage: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const m = loopMix(t);
  const cards = m > 0 ? loopLayout(t, cam) : [];
  const { c, u } = loopStage(t);
  const identity: Cam = { s: 1, ox: 0, oy: 0 };
  // канал слева — когда есть пройденная станция; справа — когда появилась следующая
  const hasLeft = m * (c > 0 ? u : 0);
  const hasRight = m * (c + 1 < N ? expoOut(seg(t, at(c + 1), at(c + 1) + 0.55)) : 0);
  return (
    <>
      {m > 0 ? (
        <>
          {/* мир и карточки узлов уходят под бумагу; по каналам станций — зелёные трассы петли */}
          <div style={{ position: 'absolute', inset: 0, background: C.paper, opacity: m }} />
          <div style={{ position: 'absolute', inset: 0, opacity: hasLeft }}>
            <Field t={t} cam={identity} tracks={[{ pts: CH_IN, on: LOOP_WIN.in, kind: 'loop' }]} perChannel={9} width={1920} height={1080} />
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: hasRight }}>
            <Field t={t} cam={identity} tracks={[{ pts: CH_OUT, on: LOOP_WIN.in, kind: 'loop' }]} perChannel={9} width={1920} height={1080} />
          </div>
          <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
            <path d={`M${CH_IN.map((p) => p.join(',')).join(' L')}`} fill="none" stroke={C.green} strokeWidth={1.4} opacity={0.18 * hasLeft} />
            <path d={`M${CH_OUT.map((p) => p.join(',')).join(' L')}`} fill="none" stroke={C.green} strokeWidth={1.4} opacity={0.18 * hasRight} />
          </svg>
          {/* исправленное значение едет по входному каналу в карточку теста */}
          {(() => {
            const k = seg(t, at(1) + DELAY + 0.1, at(1) + DELAY + 0.1 + 0.85);
            if (k <= 0 || k >= 1) return null;
            const p = along(CH_IN, smoother(k));
            return <ValueChip text={`${VALUE} · ${NOTE.split(',')[0]}`} x={p[0]} y={p[1]} tone="green" a={m * seg(k, 0, 0.12) * (1 - seg(k, 0.85, 1))} />;
          })()}
        </>
      ) : null}
      {cards
        .filter((cd) => cd.opacity > 0.01)
        .sort((a, z) => z.i - a.i) // пройденная станция (сжимается влево) — поверх растущей панели: подпись не обрезается
        .map((cd) => (
          <StationCard key={cd.i} cd={cd} t={t} />
        ))}
      <VersionBadge t={t} cam={cam} />
    </>
  );
};

const StationCard: React.FC<{ cd: LoopCard; t: number }> = ({ cd, t }) => {
  const { i, rect, open, opacity, labelPx, radius, done, fill } = cd;
  const label = LOOP_STEPS[i];
  const Content = i < PANELS ? CONTENTS[i] : null;
  let b = mixBorder(BORDER.human, BORDER.active, open);
  b = mixBorder(b, { ...BORDER.human, width: BORDER.human.width + 1.2, a: 0.95 }, done);
  const centered = 1 - smoother(seg(open, 0.2, 0.7));
  const top = smoother(seg(open, 0.5, 0.9));
  const readable = labelPx >= 24;
  const lbl = (id: string, color: string) =>
    readable ? (
      <Readable id={id} text={label}>
        {label}
      </Readable>
    ) : (
      <span {...TEXTURE_ATTR} style={{ color }}>
        {label}
      </span>
    );
  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity, boxSizing: 'border-box', borderRadius: radius, border: `${b.width}px solid ${bcolor(b)}`, background: C.paper, overflow: 'hidden' }}>
      {fill > 0 ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, background: C.green }} /> : null}
      {centered > 0.01 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 18px', opacity: centered, fontFamily: TYPE.detail.fontFamily, fontSize: labelPx, lineHeight: 1.12, color: fill > 0.6 ? C.paper : C.green }}>
          {centered > 0.5 ? lbl(`loop.${i}`, C.green) : <span {...TEXTURE_ATTR}>{label}</span>}
        </div>
      ) : null}
      {top > 0.01 ? (
        <div style={{ position: 'absolute', left: 28, top: 30, opacity: top, fontFamily: TYPE.detail.fontFamily, fontSize: 36, lineHeight: 1.1, color: C.green, whiteSpace: 'nowrap' }}>
          {top > 0.5 ? lbl(`loop.${i}`, C.green) : <span {...TEXTURE_ATTR}>{label}</span>}
        </div>
      ) : null}
      {/* станция сделана: галочка в углу панели */}
      {done > 0 && open > 0.3 ? (
        <div {...TEXTURE_ATTR} style={{ position: 'absolute', right: 26, top: 24, width: 46, height: 46, borderRadius: 23, background: C.green, color: C.paper, ...TYPE.chip, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${done})`, opacity: smoother(seg(open, 0.3, 0.6)) }}>
          ✓
        </div>
      ) : null}
      {Content && open > 0.01 ? (
        <div style={{ position: 'absolute', left: CONTENT.x, top: CONTENT.y, width: CONTENT.w, height: CONTENT.h, opacity: smoother(seg(open, 0.75, 1)) }}>
          <Content t={t} />
        </div>
      ) : null}
    </div>
  );
};

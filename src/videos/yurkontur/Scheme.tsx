// Схема архитектуры «Юридичний контур» как живой прибор (задача 031, режим hud, светлый вариант).
// Один непрерывный кадр: узлы появляются на слова диктора (timeline.ts), камера вписывает новый узел + 2–3 соседа (camera.ts).
// Правила (brief.md): типографика по ролям (tokens.ts TYPE), границы карточек (BORDER), заливка --paper непрозрачная;
// живые панели в блоках 1 и 3а (stage.ts, panels.tsx), в остальных блоках — мировые координаты с камерой; заголовок сцены —
// в своей зоне сверху, субтитры — в нижних 16 %; трассы ортогональные со скруглёнными углами, по каналам едут чипы-значения.
// Всё — функция времени t (секунды), которое обёртки получают из useCurrentFrame() (гейт 1).
import React from 'react';
import { clamp, expoOut, seg, smoother, type Pt } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { camAt, ZONE, type Cam } from './camera.ts';
import { along, Field, type Track } from './Field.tsx';
import { CARD_FIELDS, CHIP, CONTRACT_HUMAN_K, CONTRACT_ROUTE, EDGES, LOOP_CHIPS, LOOP_PTS, LOOP_ROLLBACK, LOOP_STEPS, NODES, type Node } from './schema.ts';
import { APPEAR, BLOCKS, CONTRACT, FLASH, LOOP_DRAW, STAGES, block, blockAt, densityAt, subtitleAt } from './timeline.ts';
import { CH_IN, CH_OUT, STAGE_LIST, stageAt, stageMix, stageRectOf, type Rect } from './stage.ts';
import { Block2Stand, CONTENT, PANEL_CONTENT, ValueChip } from './panels.tsx';
import { BORDER, C, TEXTURE_ATTR, TYPE, fitLetterSpacing, rgba } from './tokens.ts';

/** Мировой режим: название 20 px мира (≥ 32 px экрана при s ≥ 1.6), пояснение 18 px мира (≥ 24 px при s ≥ 1.34). */
const WORLD_LABEL = 20;
const WORLD_DETAIL = 18;
export const READ_S = Math.max(32 / WORLD_LABEL, 24 / WORLD_DETAIL);
/** Сцена панелей: название в карточке-соседе 32 px, в заголовке панели 36 px; пояснение 24 px. */
const STAGE_LABEL = 32;
const PANEL_LABEL = 36;
const PANEL_DETAIL = 24;
/** Подпись станции петли: Inter 30 px мира · s ≥ 24 px. */
const CHIP_READ_S = 24 / CHIP.font;

// ---------------------------------------------------------------- геометрия трасс
/** Ортогональная ломаная → SVG d со скруглёнными углами радиуса r. */
export function roundedPath(P: readonly Pt[], r = 14): string {
  if (P.length < 2) return '';
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const [cx, cy] = P[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: Pt = [bx - ((bx - ax) / l1) * rr, by - ((by - ay) / l1) * rr];
    const p2: Pt = [bx + ((cx - bx) / l2) * rr, by + ((cy - by) / l2) * rr];
    d += ` L${p1[0]},${p1[1]} Q${bx},${by} ${p2[0]},${p2[1]}`;
  }
  const last = P[P.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}
/** Часть ломаной от доли a до доли b длины. */
export function subPolyline(P: readonly Pt[], a: number, b: number): Pt[] {
  if (b <= a) return [];
  const segs = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
  const total = segs.reduce((x, y) => x + y, 0);
  const out: Pt[] = [along(P, a)];
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    acc += segs[i];
    const k = acc / total;
    if (k > a && k < b) out.push(P[i + 1]);
  }
  out.push(along(P, b));
  return out;
}

// ---------------------------------------------------------------- состояние элементов
type Vis = { live: number; ghost: number; flash: number; fresh: number; dim: number };
function visOf(id: string, t: number, ghostable: boolean): Vis {
  const at = APPEAR[id];
  const live = at === undefined ? 0 : expoOut(seg(t, at, at + 0.55));
  const ghost = ghostable && t >= FLASH.at ? 1 : 0;
  const flash = ghostable ? (t < FLASH.peak ? seg(t, FLASH.at, FLASH.peak) : 1 - smoother(seg(t, FLASH.peak, FLASH.ghostBy))) : 0;
  const fresh = at === undefined ? 0 : 1 - smoother(seg(t, at + 2.2, at + 3.2));
  // блок 6: приглушение и пересборка по этапам
  const b6 = block('b6').from;
  let dim = 1;
  if (t >= b6) {
    const stage = STAGES.find((s) => s.ids.includes(id) || (id.startsWith('chip:') && s.ids.includes('chips')));
    const down = smoother(seg(t, b6, b6 + 0.8));
    const up = stage ? smoother(seg(t, stage.at, stage.at + 0.6)) : 0;
    dim = 1 - 0.65 * down * (1 - up);
  }
  return { live: t >= at! ? live : 0, ghost, flash, fresh, dim };
}

// ---------------------------------------------------------------- в кадре ли элемент
/** 'in' — целиком в рабочей зоне (текст читаемый), 'edge' — в кадре, но задевает зоны/край (только фактура), 'cut' — обрезан краем (без текста). */
type Frame = 'in' | 'edge' | 'cut';
function frameOf(x0: number, y0: number, x1: number, y1: number, cam: Cam): Frame {
  const X0 = x0 * cam.s + cam.ox;
  const X1 = x1 * cam.s + cam.ox;
  const Y0 = y0 * cam.s + cam.oy;
  const Y1 = y1 * cam.s + cam.oy;
  if (X0 < 4 || X1 > 1916 || Y0 < 4 || Y1 > 1076) return 'cut';
  if (X0 < ZONE.marginX - 40 || X1 > 1920 - ZONE.marginX + 40 || Y0 < ZONE.title.y1 || Y1 > ZONE.subs.y0) return 'edge';
  return 'in';
}

// ---------------------------------------------------------------- карточка узла (экранные координаты)
type CardProps = {
  n: Node;
  t: number;
  rect: Rect;
  /** 0 — карточка, 1 — раскрытая панель */
  open: number;
  labelPx: number;
  detailPx: number | null;
  readable: boolean;
  cut: boolean;
  opacity: number;
  active: number;
  conflict: number;
  greenFill: number;
};
const Card: React.FC<CardProps> = ({ n, t, rect, open, labelPx, detailPx, readable, cut, opacity, active, conflict, greenFill }) => {
  const v = visOf(n.id, t, true);
  if ((v.live <= 0 && v.ghost <= 0) || opacity <= 0.01) return null;
  const human = n.kind === 'human';
  const live = v.live > 0;
  const b = !live ? BORDER.ghost : conflict > 0.5 ? BORDER.conflict : active > 0.5 ? BORDER.active : human ? BORDER.human : BORDER.normal;
  const pad = Math.max(8, Math.min(28, rect.w * 0.05));
  const ls = fitLetterSpacing(n.label, labelPx, rect.w - pad * 2 - 4);
  const Content = open > 0.01 ? PANEL_CONTENT[n.id] : undefined;
  const fields = n.id === 'card';
  const labelStyle: React.CSSProperties = { fontFamily: TYPE.node.fontFamily, fontWeight: TYPE.node.fontWeight, textTransform: TYPE.node.textTransform, letterSpacing: `${ls}em`, lineHeight: TYPE.node.lineHeight, fontSize: labelPx, color: human ? C.green : C.ink, opacity: readable ? 1 : 0.4 };
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        opacity: Math.max(v.live, v.ghost * (0.5 + 0.5 * v.flash)) * v.dim * opacity,
        transform: `scale(${live ? 0.94 + 0.06 * v.live : 1})`,
        boxSizing: 'border-box',
        borderRadius: BORDER.radius,
        border: `${b.width + (v.flash > 0 ? 2 * v.flash : 0)}px ${live || v.flash > 0.2 ? 'solid' : 'dashed'} ${v.flash > 0.05 && !live ? rgba(C.ink, 0.3 + 0.6 * v.flash) : b.color}`,
        background: C.paper,
        overflow: 'hidden',
      }}
    >
      {/* «Людина» заливается зелёным после подтверждения */}
      {greenFill > 0 ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${greenFill * 100}%`, background: C.green }} /> : null}
      {live && !cut ? (
        <div style={{ position: 'absolute', left: pad, top: Math.min(pad, 18), right: pad }}>
          <div style={labelStyle} {...(readable ? {} : TEXTURE_ATTR)}>
            {readable ? (
              <Readable id={`node.${n.id}`} text={n.label}>
                {n.label}
              </Readable>
            ) : (
              n.label
            )}
          </div>
          {detailPx && readable && !fields ? (
            <div style={{ marginTop: 6, fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: detailPx, lineHeight: TYPE.detail.lineHeight, color: greenFill > 0.5 ? C.paper : C.muted }}>
              <Readable id={`node.${n.id}.detail`} text={n.detail}>
                {n.detail}
              </Readable>
            </div>
          ) : null}
          {fields && detailPx && readable ? (
            <div style={{ marginTop: 8 }}>
              {CARD_FIELDS.map((f) => {
                const at = APPEAR[`field:${f}`];
                const a = at === undefined ? 0 : expoOut(seg(t, at, at + 0.4));
                return (
                  <div key={f} style={{ fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: detailPx, lineHeight: 1.35, color: C.ink, opacity: a, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: C.tight }} />
                    {a > 0.5 ? (
                      <Readable id={`card.${f}`} text={f}>
                        {f}
                      </Readable>
                    ) : (
                      f
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {/* подпись на зелёной заливке — та же строка цветом бумаги, обрезанная по краю заливки */}
      {greenFill > 0 && live && !cut ? (
        <div {...TEXTURE_ATTR} style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - greenFill) * 100}% 0 0)` }}>
          <div style={{ position: 'absolute', left: pad, top: Math.min(pad, 18), right: pad, ...labelStyle, color: C.paper }}>{n.label}</div>
        </div>
      ) : null}
      {Content && live ? (
        <div style={{ position: 'absolute', left: CONTENT.x, top: CONTENT.y, width: CONTENT.w, height: CONTENT.h, opacity: seg(open, 0.75, 1) }}>
          <Content t={t} />
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- станция петли (мир)
const LoopStation: React.FC<{ i: number; t: number; cam: Cam }> = ({ i, t, cam }) => {
  const v = visOf(`chip:${i}`, t, false);
  if (v.live <= 0) return null;
  const [x, y] = LOOP_CHIPS[i];
  const fr = frameOf(x - CHIP.w / 2, y - CHIP.h / 2, x + CHIP.w / 2, y + CHIP.h / 2, cam);
  const readable = cam.s >= CHIP_READ_S && v.live > 0.5 && fr === 'in';
  const text = LOOP_STEPS[i];
  const b = v.fresh > 0.3 ? BORDER.active : BORDER.human;
  return (
    <div style={{ position: 'absolute', left: x - CHIP.w / 2, top: y - CHIP.h / 2, width: CHIP.w, height: CHIP.h, boxSizing: 'border-box', borderRadius: 42, border: `${b.width / cam.s}px solid ${b.color}`, background: C.paper, opacity: v.live * v.dim, transform: `scale(${0.9 + 0.1 * v.live})`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 16px' }}>
      {fr === 'cut' ? null : (
        <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: CHIP.font, fontWeight: 400, lineHeight: 1.1, color: C.green, opacity: readable ? 1 : 0.4 }} {...(readable ? {} : TEXTURE_ATTR)}>
          {readable ? (
            <Readable id={`loop.${i}`} text={text}>
              {text}
            </Readable>
          ) : (
            text
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- чипы-значения на каналах сцены панелей
/** Значения — только сверенные числа (NUMBERS_CHECK стр. 9: 24 700 → 43 155 → 48 355, даты 01.03.2015 / 01.09.2015;
 * стр. 18: 7 450,00 грн) и дата договора doc1 05.12.2013 (стенд, таблица экранов задачи). */
const STAGE_VALUES: Record<string, { in?: string; out?: string[] }> = {
  ocr: { in: '05.12.2013', out: ['7 450,00 грн'] },
  read2: { in: '7 450,00 грн', out: ['24 700,00 грн', '01.03.2015'] },
  code: { in: '24 700,00 грн', out: ['43 155,00 грн'] },
  queue: { in: '43 155,00 грн', out: ['48 355,00 грн'] },
};
const CHIP_TRAVEL = 1.3;
function stageChips(t: number): { text: string; pts: Pt[]; k: number }[] {
  const { cur } = stageAt(t);
  const vals = STAGE_VALUES[cur.center];
  if (!vals) return [];
  const next = STAGE_LIST[STAGE_LIST.indexOf(cur) + 1]?.from ?? block('b3b').from;
  const out: { text: string; pts: Pt[]; k: number }[] = [];
  if (vals.in) out.push({ text: vals.in, pts: CH_IN, k: seg(t, cur.from + 0.6, cur.from + 0.6 + CHIP_TRAVEL) });
  (vals.out ?? []).forEach((v, i) => {
    const at = next - CHIP_TRAVEL - 0.2 - (vals.out!.length - 1 - i) * 1.1;
    out.push({ text: v, pts: CH_OUT, k: seg(t, at, at + CHIP_TRAVEL) });
  });
  return out.filter((c) => c.k > 0 && c.k < 1);
}

// ---------------------------------------------------------------- кадр
const TITLE_FROM: Record<string, number> = {
  b2: FLASH.ghostBy + 0.3,
  b3a: APPEAR.read2,
  b3b: APPEAR.card,
  b3c: APPEAR.deviations,
  b4: block('b4').from + 0.8,
};

export const Scheme: React.FC<{ t: number }> = ({ t }) => {
  const cam = camAt(t);
  const s = cam.s;
  const b = blockAt(t);
  const b5 = t >= block('b5').from && t < block('b6').from;
  const mix = stageMix(t);
  const { u: stageU } = stageAt(t);

  // рёбра мира: канал включается при появлении узла `to`
  const edges = EDGES.map((e) => {
    const at = APPEAR[e.to];
    const p = at === undefined ? 0 : smoother(seg(t, at - 0.35, at + 0.25));
    const vTo = visOf(e.to, t, true);
    return { e, p, ghost: vTo.ghost, flash: vTo.flash, dim: Math.min(visOf(e.from, t, true).dim, vTo.dim) };
  });
  const loopP = smoother(seg(t, LOOP_DRAW.from, LOOP_DRAW.to));
  const loopPts = subPolyline(LOOP_PTS, 0, loopP);
  const rollP = smoother(seg(t, APPEAR['chip:5'] + 0.2, APPEAR['chip:5'] + 0.8));

  // договор блока 5
  const ck = smoother(seg(t, CONTRACT.from, CONTRACT.to));
  const contractOn = b5 && t >= CONTRACT.from;
  const cPos = along(CONTRACT_ROUTE, ck);
  const conflict = contractOn ? clamp(1 - Math.abs(ck - CONTRACT_HUMAN_K) / 0.05) : 0;
  const insideNode = NODES.some((n) => Math.abs(cPos[0] - n.x) <= n.w / 2 + 16 && Math.abs(cPos[1] - n.y) <= n.h / 2 + 16);
  const hotNode = contractOn ? NODES.find((n) => Math.abs(cPos[0] - n.x) <= n.w / 2 && Math.abs(cPos[1] - n.y) <= n.h / 2)?.id ?? null : null;

  const perChannel = 6 + Math.round(4 * clamp((densityAt(t) - 0.25) / 0.75));
  const worldTracks: Track[] = [
    ...edges.map(({ e, dim }): Track => ({ pts: e.pts, on: APPEAR[e.to] === undefined ? null : APPEAR[e.to] - 0.35, kind: 'flow', alpha: dim })),
    { pts: LOOP_PTS, on: LOOP_DRAW.from, kind: 'loop', maxK: loopP, alpha: visOf('chip:0', t, false).dim },
    { pts: LOOP_ROLLBACK, on: APPEAR['chip:5'] + 0.2, kind: 'loop', alpha: visOf('chip:5', t, false).dim },
    ...(contractOn ? [{ pts: CONTRACT_ROUTE, on: CONTRACT.from, kind: 'contract', headK: ck } as Track] : []),
  ];
  // каналы сцены панелей (экранные координаты): вход и выход текущей панели
  const { cur } = stageAt(t);
  const chOn = mix * smoother(seg(stageU, 0.6, 1));
  const stageTracks: Track[] = [
    ...(cur.left ? [{ pts: CH_IN, on: cur.from + 0.3, kind: 'flow' } as Track] : []),
    ...(cur.right ? [{ pts: CH_OUT, on: cur.from + 0.3, kind: 'flow' } as Track] : []),
  ];
  const identity: Cam = { s: 1, ox: 0, oy: 0 };

  // прямоугольники узлов: мир (камера) ↔ сцена панелей
  const cards = NODES.map((n) => {
    const wr: Rect = { x: (n.x - n.w / 2) * s + cam.ox, y: (n.y - n.h / 2) * s + cam.oy, w: n.w * s, h: n.h * s };
    const fr = frameOf(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2, cam);
    const st = mix > 0 ? stageRectOf(n.id, t) : null;
    const m = st ? mix : 0;
    const rect: Rect = st ? { x: wr.x + (st.rect.x - wr.x) * m, y: wr.y + (st.rect.y - wr.y) * m, w: wr.w + (st.rect.w - wr.w) * m, h: wr.h + (st.rect.h - wr.h) * m } : wr;
    const open = st ? st.open * m : 0;
    const stagePx = st ? STAGE_LABEL + (PANEL_LABEL - STAGE_LABEL) * st.open : STAGE_LABEL;
    const labelPx = WORLD_LABEL * s + (stagePx - WORLD_LABEL * s) * m;
    const worldReadable = s >= READ_S && fr === 'in';
    const stageVisible = st && st.slot !== 'offL' && st.slot !== 'offR';
    const readable = m > 0.5 ? Boolean(stageVisible) : worldReadable;
    const detailPx = m > 0.5 ? (st && st.open > 0.5 ? PANEL_DETAIL : null) : worldReadable ? WORLD_DETAIL * s : null;
    const opacity = mix > 0 && !st ? 1 - mix : st && !stageVisible ? 1 - m : 1;
    const active = st ? (st.open > 0.5 ? 1 : 0) : visOf(n.id, t, true).fresh > 0.3 || hotNode === n.id ? 1 : 0;
    const greenFill = n.id === 'human1' ? smoother(seg(t, STAGE_EV_HUMAN, STAGE_EV_HUMAN + 0.6)) * (t < block('b3b').from ? 1 : 0) : 0;
    return { n, rect, open, labelPx, detailPx, readable, cut: m > 0.5 ? false : fr === 'cut', opacity, active, conflict: n.id === 'human2' ? conflict : 0, greenFill, z: st && st.open > 0.1 ? 2 : 1 };
  });

  const subtitle = subtitleAt(t);
  const titleFrom = TITLE_FROM[b.id];
  const titleA = b.title && titleFrom !== undefined ? seg(t, titleFrom, titleFrom + 0.5) * (1 - seg(t, b.to - 0.5, b.to)) : 0;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, background: C.paper, overflow: 'hidden' }}>
      {/* мир: нити связей, петля, трассы */}
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - mix }}>
        <Field t={t} cam={cam} tracks={worldTracks} perChannel={perChannel} width={1920} height={1080} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${cam.ox}px, ${cam.oy}px) scale(${s})` }}>
          <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
            {edges.map(({ e, p, ghost, flash, dim }) => (
              <g key={e.id} opacity={dim}>
                {ghost > 0 && p < 1 ? <path d={roundedPath(e.pts)} fill="none" stroke={C.ink} strokeWidth={(1.4 + 1.8 * flash) / s} strokeDasharray={flash > 0.2 ? undefined : '3 6'} opacity={0.12 + 0.7 * flash} /> : null}
                {p > 0 ? <path d={roundedPath(e.pts)} pathLength={1} fill="none" stroke={C.ink} strokeWidth={1.4 / s} strokeDasharray="1" strokeDashoffset={1 - p} opacity={0.06} /> : null}
              </g>
            ))}
            {loopPts.length > 1 ? <path d={roundedPath(loopPts, 14)} fill="none" stroke={C.green} strokeWidth={1.4 / s} strokeDasharray="6 7" opacity={0.18 * visOf('chip:0', t, false).dim} /> : null}
            {rollP > 0 ? (
              <g opacity={rollP * 0.5}>
                <path d={roundedPath(LOOP_ROLLBACK)} fill="none" stroke={C.green} strokeWidth={1.4 / s} strokeDasharray="6 7" opacity={0.5} />
                <path d={`M${LOOP_ROLLBACK[1][0] + 10},${LOOP_ROLLBACK[1][1] - 9} L${LOOP_ROLLBACK[1][0]},${LOOP_ROLLBACK[1][1]} L${LOOP_ROLLBACK[1][0] + 10},${LOOP_ROLLBACK[1][1] + 9}`} fill="none" stroke={C.green} strokeWidth={1.8 / s} />
              </g>
            ) : null}
          </svg>
          {LOOP_STEPS.map((_, i) => (
            <LoopStation key={i} i={i} t={t} cam={cam} />
          ))}
        </div>
      </div>
      {/* сцена панелей: каналы входа/выхода с трассами */}
      {mix > 0 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: chOn }}>
          <Field t={t} cam={identity} tracks={stageTracks} perChannel={8} width={1920} height={1080} />
          <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
            {cur.left ? <path d={roundedPath(CH_IN)} fill="none" stroke={C.ink} strokeWidth={1.4} opacity={0.06} /> : null}
            {cur.right ? <path d={roundedPath(CH_OUT)} fill="none" stroke={C.ink} strokeWidth={1.4} opacity={0.06} /> : null}
          </svg>
        </div>
      ) : null}
      {/* чипы-значения на каналах панелей — под карточками (не перекрывают текст и карточки) */}
      {mix > 0.5
        ? stageChips(t).map((ch, i) => {
            const p = along(ch.pts, smoother(ch.k));
            return <ValueChip key={`${ch.text}-${i}`} text={ch.text} x={p[0]} y={p[1]} a={chOn * seg(ch.k, 0.1, 0.2) * (1 - seg(ch.k, 0.85, 0.95))} />;
          })
        : null}
      {/* карточки узлов (панель — поверх соседей) */}
      {[...cards].sort((a, z) => a.z - z.z).map((c) => (
        <Card key={c.n.id} n={c.n} t={t} rect={c.rect} open={c.open} labelPx={c.labelPx} detailPx={c.detailPx} readable={c.readable} cut={c.cut} opacity={c.opacity} active={c.active} conflict={c.conflict} greenFill={c.greenFill} />
      ))}
      {/* бусина договора блока 5 (мир → экран), только вне узлов */}
      {contractOn && !insideNode ? (
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
          <circle cx={cPos[0] * s + cam.ox} cy={cPos[1] * s + cam.oy} r={12} fill={C.tight} />
          <circle cx={cPos[0] * s + cam.ox} cy={cPos[1] * s + cam.oy} r={4.5} fill={C.paper} />
          {conflict > 0 ? <circle cx={cPos[0] * s + cam.ox} cy={cPos[1] * s + cam.oy} r={17 + 9 * conflict} fill="none" stroke={C.crit} strokeWidth={2.4} opacity={conflict} /> : null}
        </svg>
      ) : null}

      {/* блок 2: картка аптеки на стенде — план → договір → скан, охровые рамки по словам (запись видео — шаг 6) */}
      {b.id === 'b2' ? <Block2Stand t={t} x={960} y={ZONE.work.y0 + 30} h={600} /> : null}

      {/* зона заголовка: подложка, индикатор прогресса по блокам, заголовок сцены (Source Serif 4) */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 205, background: 'linear-gradient(rgba(249,243,232,1) 0%, rgba(249,243,232,1) 88%, rgba(249,243,232,0) 100%)' }} />
      <div style={{ position: 'absolute', left: ZONE.marginX, top: ZONE.title.y0, display: 'flex', gap: 6 }}>
        {BLOCKS.map((bb) => {
          const k = clamp((t - bb.from) / (bb.to - bb.from));
          return (
            <div key={bb.id} style={{ width: 54, height: 3, background: C.line, position: 'relative' }} {...TEXTURE_ATTR}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: 3, width: `${k * 100}%`, background: C.ink, opacity: 0.55 }} />
            </div>
          );
        })}
      </div>
      {titleA > 0 && b.title ? (
        <div style={{ position: 'absolute', left: ZONE.marginX, top: ZONE.title.y0 + 16, opacity: titleA, transform: `translateY(${(1 - titleA) * 8}px)` }}>
          <div style={{ ...TYPE.title, whiteSpace: 'nowrap' }}>
            <Readable id={`title.${b.id}`} text={b.title}>
              {b.title}
            </Readable>
          </div>
          {b.id === 'b3a' ? (
            <div style={{ fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: 26, color: C.muted, marginTop: 2 }}>
              <Readable id="title.b3a.note" text="спостереження на пілоті">
                спостереження на пілоті
              </Readable>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* зона субтитров: нижние 16 %, Source Serif 4 Regular 42 px */}
      <div style={{ position: 'absolute', left: 0, top: ZONE.subs.y0 - 40, width: 1920, height: 1080 - ZONE.subs.y0 + 40, background: 'linear-gradient(rgba(249,243,232,0) 0%, rgba(249,243,232,0.96) 35%, rgba(249,243,232,0.98) 100%)' }} />
      {subtitle ? (
        <div style={{ position: 'absolute', left: 960, top: ZONE.subs.y0 + 4, width: 1560, transform: 'translateX(-50%)', textAlign: 'center', ...TYPE.voice }}>
          <Readable id={`sub.${b.id}.${subtitle.slice(0, 24)}`} text={subtitle}>
            {subtitle}
          </Readable>
        </div>
      ) : null}
    </div>
  );
};
const STAGE_EV_HUMAN = APPEAR.human1 + 0.35;

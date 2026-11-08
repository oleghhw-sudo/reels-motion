// Схема архитектуры «Юридичний контур» как живой прибор (задача 031, режим hud, светлый вариант).
// Один непрерывный кадр: узлы появляются на слова диктора (timeline.ts), камера вписывает новый узел + 2–3 соседа (camera.ts).
// Правила композиции (brief.md): под узлами и текстом нет линий поля (подложка --paper с мягким краем); читаемые названия
// узлов ≥ 32 px и пояснения ≥ 24 px — только при близкой камере, иначе узел подписан фактурой; заголовок сцены — в своей зоне
// сверху, субтитры — в нижних 16 %; трассы ортогональные со скруглёнными углами.
// Всё — функция времени t (секунды), которое обёртки получают из useCurrentFrame() (гейт 1).
import React from 'react';
import { clamp, expoOut, seg, smoother, type Pt } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { camAt, ZONE, type Cam } from './camera.ts';
import { along, Field, type Track } from './Field.tsx';
import { CARD_FIELDS, CHIP, CONTRACT_HUMAN_K, CONTRACT_ROUTE, EDGES, FLOW, LOOP_CHIPS, LOOP_PTS, LOOP_ROLLBACK, LOOP_STEPS, NODES, type Node } from './schema.ts';
import { APPEAR, BLOCKS, CONTRACT, FLASH, LOOP_DRAW, STAGES, block, blockAt, densityAt, subtitleAt } from './timeline.ts';
import { C, FONT, TEXTURE_ATTR } from './tokens.ts';

/** Порог «камера близко»: название 24 px мира · s ≥ 32 px, пояснение 18 px мира · s ≥ 24 px. */
const LABEL_PX = 24;
const DETAIL_PX = 18;
export const READ_S = Math.max(32 / LABEL_PX, 24 / DETAIL_PX);
/** Чип петли: 28 px мира · s ≥ 32 px. */
const CHIP_READ_S = 32 / CHIP.font;

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

// ---------------------------------------------------------------- узел
const NodeBox: React.FC<{ n: Node; t: number; cam: Cam; hot: number; crit: number }> = ({ n, t, cam, hot, crit }) => {
  const v = visOf(n.id, t, true);
  if (v.live <= 0 && v.ghost <= 0) return null;
  const human = n.kind === 'human';
  const fr = frameOf(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2, cam);
  const readable = cam.s >= READ_S && v.live > 0.5 && fr === 'in';
  const tone = human ? C.accent : C.ink;
  const borderCol = crit > 0 ? C.crit : v.live > 0 ? tone : C.line2;
  const borderA = v.live > 0 ? 0.55 + 0.45 * Math.max(v.fresh, hot) : 0.55 + 0.45 * v.flash;
  const scale = v.live > 0 ? 0.94 + 0.06 * v.live : 1;
  const fields = n.id === 'card';
  const pad = v.live > 0 ? 1 : 0.85;
  return (
    <div
      style={{
        position: 'absolute',
        left: n.x - n.w / 2,
        top: n.y - n.h / 2,
        width: n.w,
        height: n.h,
        transform: `scale(${scale})`,
        opacity: Math.max(v.live, v.ghost * (0.5 + 0.5 * v.flash)) * v.dim,
        boxSizing: 'border-box',
        borderRadius: 8,
        border: `${v.live > 0 ? 1.6 : 1.2}px ${v.live > 0 || v.flash > 0.2 ? 'solid' : 'dashed'} ${borderCol}`,
        background: v.live > 0 && Math.max(v.fresh, hot) > 0.05 ? (human ? '#EEF0EA' : C.accentSoft) : C.paper,
        // подложка с мягким краем: линии поля под узлом и его текстом не проходят
        boxShadow: `0 0 16px 9px rgba(249,243,232,${0.97 * pad})`,
        padding: '12px 14px',
        outline: v.flash > 0 ? `${3 * v.flash}px solid rgba(28,32,30,${0.85 * v.flash})` : undefined,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 8, border: `1.6px solid ${borderCol}`, opacity: borderA - 0.55 }} />
      {v.live > 0 && fr !== 'cut' ? (
        readable ? (
          <>
            <div style={{ fontFamily: FONT.ui, fontSize: LABEL_PX, fontWeight: 600, lineHeight: 1.15, color: human ? C.accent : C.ink }}>
              <Readable id={`node.${n.id}`} text={n.label}>
                {n.label}
              </Readable>
            </div>
            {fields ? (
              <div style={{ marginTop: 8 }}>
                {CARD_FIELDS.map((f) => {
                  const at = APPEAR[`field:${f}`];
                  const a = at === undefined ? 0 : expoOut(seg(t, at, at + 0.4));
                  return (
                    <div key={f} style={{ fontFamily: FONT.ui, fontSize: DETAIL_PX, lineHeight: 1.35, color: C.ink, opacity: a, transform: `translateX(${(1 - a) * -8}px)`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: C.tight, opacity: 0.9 }} />
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
            ) : (
              <div style={{ marginTop: 6, fontFamily: FONT.ui, fontSize: DETAIL_PX, lineHeight: 1.3, color: C.muted }}>
                <Readable id={`node.${n.id}.detail`} text={n.detail}>
                  {n.detail}
                </Readable>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 600, letterSpacing: 0.6, lineHeight: 1.3, color: human ? C.accent : C.ink, opacity: 0.4 }} {...TEXTURE_ATTR}>
            {n.label.toUpperCase()}
            {!fields ? <div style={{ marginTop: 6, fontWeight: 400, fontSize: 11, lineHeight: 1.45, color: C.muted }}>{n.detail}</div> : null}
            {fields ? (
              <div style={{ marginTop: 6, fontWeight: 400, fontSize: 11 }}>
                {CARD_FIELDS.filter((f) => t >= (APPEAR[`field:${f}`] ?? Infinity)).map((f) => (
                  <div key={f}>· {f}</div>
                ))}
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- станция петли
const Chip: React.FC<{ i: number; t: number; cam: Cam }> = ({ i, t, cam }) => {
  const v = visOf(`chip:${i}`, t, false);
  if (v.live <= 0) return null;
  const [x, y] = LOOP_CHIPS[i];
  const fr = frameOf(x - CHIP.w / 2, y - CHIP.h / 2, x + CHIP.w / 2, y + CHIP.h / 2, cam);
  const readable = cam.s >= CHIP_READ_S && v.live > 0.5 && fr === 'in';
  const text = LOOP_STEPS[i];
  return (
    <div
      style={{
        position: 'absolute',
        left: x - CHIP.w / 2,
        top: y - CHIP.h / 2,
        width: CHIP.w,
        height: CHIP.h,
        boxSizing: 'border-box',
        borderRadius: 42,
        border: `1.6px solid ${C.accent}`,
        background: v.fresh > 0.05 ? C.accentSoft : C.paper,
        boxShadow: `0 0 16px 9px rgba(249,243,232,0.97)`,
        opacity: v.live * v.dim,
        transform: `scale(${0.9 + 0.1 * v.live})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 16px',
      }}
    >
      {fr === 'cut' ? null : readable ? (
        <div style={{ fontFamily: FONT.ui, fontSize: CHIP.font, fontWeight: 500, lineHeight: 1.1, color: C.accent }}>
          <Readable id={`loop.${i}`} text={text}>
            {text}
          </Readable>
        </div>
      ) : (
        <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.accent, opacity: 0.4 }} {...TEXTURE_ATTR}>
          {text.toUpperCase()}
        </div>
      )}
    </div>
  );
};

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

  // рёбра: канал включается при появлении узла `to`
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
  const trail = subPolyline(CONTRACT_ROUTE, Math.max(0, ck - 0.07), ck);
  const conflict = contractOn ? clamp(1 - Math.abs(ck - CONTRACT_HUMAN_K) / 0.05) : 0;

  const lastFlow = FLOW.reduce((k, n, i) => (t >= (APPEAR[n.id] ?? Infinity) ? i : k), -1);
  const flowBand: Pt[] = lastFlow >= 1 ? FLOW.slice(0, lastFlow + 1).map((n) => [n.x, n.y] as Pt) : [];
  const tracks: Track[] = [
    { pts: flowBand, w: flowBand.length ? 0.9 * Math.min(...FLOW.slice(0, lastFlow + 1).map((n) => visOf(n.id, t, true).dim)) : 0, particles: 'ink' },
    ...edges.map(({ e, p, dim }) => ({ pts: e.pts, w: p * dim * (b5 ? 1 : 0.8), particles: (e.human ? 'accent' : 'ink') as Track['particles'] })),
    { pts: loopPts, w: loopP > 0 ? 0.9 : 0, particles: 'accent' },
  ];

  const nearestNode = (p: Pt): string | null => {
    for (const n of NODES) if (Math.abs(p[0] - n.x) <= n.w / 2 && Math.abs(p[1] - n.y) <= n.h / 2) return n.id;
    return null;
  };
  const hotNode = contractOn ? nearestNode(cPos) : null;
  const insideNode = NODES.some((n) => Math.abs(cPos[0] - n.x) <= n.w / 2 + 16 && Math.abs(cPos[1] - n.y) <= n.h / 2 + 16);

  const subtitle = subtitleAt(t);
  const titleFrom = TITLE_FROM[b.id];
  const titleA = b.title && titleFrom !== undefined ? seg(t, titleFrom, titleFrom + 0.5) * (1 - seg(t, b.to - 0.5, b.to)) : 0;
  const placeholderA = b.id === 'b2' ? seg(t, FLASH.ghostBy + 0.6, FLASH.ghostBy + 1.2) * (1 - seg(t, b.to - 0.8, b.to - 0.2)) : 0;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, background: C.paper, overflow: 'hidden' }}>
      <Field t={t} cam={cam} tracks={tracks} density={densityAt(t)} width={1920} height={1080} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${cam.ox}px, ${cam.oy}px) scale(${s})` }}>
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
          {edges.map(({ e, p, ghost, flash, dim }) => (
            <g key={e.id} opacity={dim}>
              {ghost > 0 && p < 1 ? <path d={roundedPath(e.pts)} fill="none" stroke={C.ink} strokeWidth={1.2 + 1.8 * flash} strokeDasharray={flash > 0.2 ? undefined : '3 6'} opacity={0.22 + 0.6 * flash} /> : null}
              {p > 0 ? <path d={roundedPath(e.pts)} pathLength={1} fill="none" stroke={e.human ? C.accent : C.ink} strokeWidth={1.8} strokeDasharray={e.human ? undefined : '1'} strokeDashoffset={e.human ? undefined : 1 - p} opacity={(e.human ? 0.85 : 0.7) * p} /> : null}
            </g>
          ))}
          {/* договор блока 5: охровая трасса-хвост — под узлами (не пересекает текст) */}
          {contractOn ? <path d={roundedPath(trail, 12)} fill="none" stroke={C.tight} strokeWidth={6} strokeLinecap="round" opacity={0.95} /> : null}
          {/* петля навчання («так працюватиме») — пунктир */}
          {loopPts.length > 1 ? <path d={roundedPath(loopPts, 22)} fill="none" stroke={C.accent} strokeWidth={2} strokeDasharray="8 7" opacity={0.85 * visOf('chip:0', t, false).dim} /> : null}
          {loopPts.length > 1
            ? [0.1, 0.3, 0.5, 0.68, 0.9].filter((k) => k < loopP - 0.02).map((k) => {
                const p = along(LOOP_PTS, k);
                const q = along(LOOP_PTS, k + 0.005);
                const ang = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
                return <path key={k} d="M-7,-8 L4,0 L-7,8" transform={`translate(${p[0]},${p[1]}) rotate(${ang})`} fill="none" stroke={C.accent} strokeWidth={2.4} opacity={0.9} />;
              })
            : null}
          {rollP > 0 ? (
            <g opacity={rollP}>
              <path d={roundedPath(LOOP_ROLLBACK)} fill="none" stroke={C.accent} strokeWidth={2} strokeDasharray="8 7" />
              <path d={`M${LOOP_ROLLBACK[1][0] + 10},${LOOP_ROLLBACK[1][1] - 9} L${LOOP_ROLLBACK[1][0]},${LOOP_ROLLBACK[1][1]} L${LOOP_ROLLBACK[1][0] + 10},${LOOP_ROLLBACK[1][1] + 9}`} fill="none" stroke={C.accent} strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        {NODES.map((n) => (
          <NodeBox key={n.id} n={n} t={t} cam={cam} hot={hotNode === n.id ? 1 : 0} crit={n.id === 'human2' ? conflict : 0} />
        ))}
        {LOOP_STEPS.map((_, i) => (
          <Chip key={i} i={i} t={t} cam={cam} />
        ))}
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
          {/* бусина договора — поверх, только вне узлов; конфликт — кольцо на подходе к людині №2 */}
          {contractOn && !insideNode ? (
            <g>
              <circle cx={cPos[0]} cy={cPos[1]} r={13} fill={C.tight} />
              <circle cx={cPos[0]} cy={cPos[1]} r={5} fill={C.paper} />
              {conflict > 0 ? <circle cx={cPos[0]} cy={cPos[1]} r={18 + 10 * conflict} fill="none" stroke={C.crit} strokeWidth={2.4} opacity={conflict} /> : null}
            </g>
          ) : null}
        </svg>
      </div>

      {/* блок 2: место записи стенда (шаг 6 задачи) — в аниматике заглушка */}
      {placeholderA > 0 ? (
        <div style={{ position: 'absolute', left: 960 - 560, top: ZONE.work.y0 + 30, width: 1120, height: 630, opacity: placeholderA, border: `1.5px dashed ${C.muted}`, borderRadius: 10, background: 'rgba(249,243,232,0.94)', boxShadow: '0 0 30px 22px rgba(249,243,232,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, color: C.muted, textAlign: 'center', lineHeight: 1.6, opacity: 0.4 }} {...TEXTURE_ATTR}>
            ЗАПИС СТЕНДА (КРОК 6)
            <br />
            #/card/ANC-0412/plan → «Договір» → «Показати в скані»
          </div>
        </div>
      ) : null}

      {/* зона заголовка: подложка, заголовок сцены, индикатор прогресса по блокам */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 200, background: 'linear-gradient(rgba(249,243,232,1) 0%, rgba(249,243,232,1) 80%, rgba(249,243,232,0) 100%)' }} />
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
        <div style={{ position: 'absolute', left: ZONE.marginX, top: ZONE.title.y0 + 22, opacity: titleA, transform: `translateY(${(1 - titleA) * 8}px)` }}>
          <div style={{ fontFamily: FONT.ui, fontSize: 40, fontWeight: 600, color: C.ink, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
            <Readable id={`title.${b.id}`} text={b.title}>
              {b.title}
            </Readable>
          </div>
          {b.id === 'b3a' ? (
            <div style={{ fontFamily: FONT.ui, fontSize: 28, color: C.muted, marginTop: 2 }}>
              <Readable id="title.b3a.note" text="спостереження на пілоті">
                спостереження на пілоті
              </Readable>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* зона субтитров: нижние 16 % */}
      <div style={{ position: 'absolute', left: 0, top: ZONE.subs.y0 - 40, width: 1920, height: 1080 - ZONE.subs.y0 + 40, background: 'linear-gradient(rgba(249,243,232,0) 0%, rgba(249,243,232,0.96) 35%, rgba(249,243,232,0.98) 100%)' }} />
      {subtitle ? (
        <div style={{ position: 'absolute', left: 960, top: ZONE.subs.y0 + 4, width: 1560, transform: 'translateX(-50%)', textAlign: 'center', fontFamily: FONT.ui, fontSize: 40, fontWeight: 500, lineHeight: 1.25, color: C.ink }}>
          <Readable id={`sub.${b.id}.${subtitle.slice(0, 24)}`} text={subtitle}>
            {subtitle}
          </Readable>
        </div>
      ) : null}
    </div>
  );
};

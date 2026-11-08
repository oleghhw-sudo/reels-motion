// Схема архитектуры «Юридичний контур» как живой прибор (задача 031, режим hud, светлый вариант).
// Один непрерывный кадр: узлы появляются на слова диктора (timeline.ts), камера вписывает новый узел + 2–3 соседа (camera.ts).
// Правила (brief.md): типографика по ролям (tokens.ts TYPE), границы карточек (BORDER), заливка --paper непрозрачная;
// живые панели в блоках 1 и 3а (stage.ts, panels.tsx), в остальных блоках — мировые координаты с камерой; заголовок сцены —
// в своей зоне сверху, субтитры — в нижних 16 %; трассы ортогональные со скруглёнными углами, по каналам едут чипы-значения.
// Раскладка карточек — layout.ts (одна функция и для кадра, и для проверки скачков jumps.test.ts).
// Всё — функция времени t (секунды), которое обёртки получают из useCurrentFrame() (гейт 1).
import React from 'react';
import { clamp, expoOut, seg, smoother, type Pt } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { camAt, ZONE, type Cam } from './camera.ts';
import { Field, type Track } from './Field.tsx';
import { along, roundedPath } from './geom.ts';
import { cardLayout, contractAt, frameAmt, visOf, type CardLayout } from './layout.ts';
import { CARD_FIELDS, CHIP, CONTRACT_ROUTE, EDGES, LOOP_CHIPS, LOOP_PTS, LOOP_ROLLBACK, LOOP_STEPS, NODES, nodeById } from './schema.ts';
import { CH_IN, CH_OUT, EV, STAGE_LIST, stageAt, stageMix, windowStart } from './stage.ts';
import { APPEAR, BLOCKS, CONTRACT, FLASH, LOOP_DRAW, LOOP_EV, LOOP_ON, block, blockAt, densityAt, subtitleAt } from './timeline.ts';
import { Block1Legacy, Block2Stand, CONTENT, PANEL_CONTENT, ValueChip } from './panels.tsx';
import { BORDER, C, TEXTURE_ATTR, TYPE, bcolor, fitLetterSpacing, mixBorder, rgba, type Border } from './tokens.ts';

/** Подпись станции петли: Inter 30 px мира · s ≥ 24 px. */
const CHIP_READ_S = 24 / CHIP.font;

// ---------------------------------------------------------------- геометрия трасс
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

// ---------------------------------------------------------------- карточка узла (экранные координаты)
const Card: React.FC<{ c: CardLayout; t: number }> = ({ c, t }) => {
  const { n, rect, open, labelPx, detailPx, textA, readA, detailA, opacity, active, conflict, greenFill } = c;
  const v = visOf(n.id, t, true);
  if ((v.live <= 0 && v.ghost <= 0) || opacity <= 0.01) return null;
  const human = n.kind === 'human';
  const live = v.live > 0;
  // обводка: призрак → обычная/«Людина» → активная → конфлікт, всё плавно
  let b = mixBorder(BORDER.ghost, human ? BORDER.human : BORDER.normal, v.live);
  b = mixBorder(b, BORDER.active, active);
  b = mixBorder(b, BORDER.conflict, conflict);
  const flashB = v.flash > 0.05 && !live ? { ...BORDER.normal, a: 0.3 + 0.6 * v.flash, width: BORDER.normal.width + 2 * v.flash } : b;
  const pad = Math.max(8, Math.min(28, rect.w * 0.05));
  const ls = fitLetterSpacing(n.label, labelPx, rect.w - pad * 2 - 4);
  const Content = open > 0.01 ? PANEL_CONTENT[n.id] : undefined;
  const fields = n.id === 'card';
  const readable = readA > 0.5;
  const labelStyle: React.CSSProperties = { fontFamily: TYPE.node.fontFamily, fontWeight: TYPE.node.fontWeight, textTransform: TYPE.node.textTransform, letterSpacing: `${ls}em`, lineHeight: TYPE.node.lineHeight, fontSize: labelPx, color: human ? C.green : C.ink, opacity: (0.4 + 0.6 * readA) * textA };
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
        border: `${flashB.width}px ${live || v.flash > 0.2 ? 'solid' : 'dashed'} ${bcolor(flashB)}`,
        background: C.paper,
        overflow: 'hidden',
      }}
    >
      {greenFill > 0 ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${greenFill * 100}%`, background: C.green }} /> : null}
      {live && textA > 0.01 ? (
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
          {detailA > 0.01 && (!fields || open > 0.3) ? (
            <div style={{ marginTop: 6, fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: detailPx, lineHeight: TYPE.detail.lineHeight, color: C.muted, opacity: detailA * textA }}>
              {/* читаемой подпись становится только в полном размере (на переходе мир → панель она мельче 24 px) */}
              {detailA > 0.5 && detailPx >= 24 ? (
                <Readable id={`node.${n.id}.detail`} text={n.detail}>
                  {n.detail}
                </Readable>
              ) : (
                n.detail
              )}
            </div>
          ) : null}
          {fields && detailA > 0.01 && open < 0.3 ? (
            <div style={{ marginTop: 8, opacity: detailA * textA }}>
              {CARD_FIELDS.map((f) => {
                const at = APPEAR[`field:${f}`];
                const a = at === undefined ? 0 : expoOut(seg(t, at, at + 0.4));
                return (
                  <div key={f} style={{ fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: detailPx, lineHeight: 1.35, color: C.ink, opacity: a, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: C.tight }} />
                    {a > 0.5 && detailA > 0.5 ? (
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
      {greenFill > 0 && live && textA > 0.01 ? (
        <div {...TEXTURE_ATTR} style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - greenFill) * 100}% 0 0)` }}>
          <div style={{ position: 'absolute', left: pad, top: Math.min(pad, 18), right: pad, ...labelStyle, color: C.paper }}>{n.label}</div>
        </div>
      ) : null}
      {Content && live ? (
        <div style={{ position: 'absolute', left: CONTENT.x, top: CONTENT.y, width: CONTENT.w, height: CONTENT.h, opacity: smoother(seg(open, 0.75, 1)) }}>
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
  const fa = frameAmt(x - CHIP.w / 2, y - CHIP.h / 2, x + CHIP.w / 2, y + CHIP.h / 2, cam);
  const readA = smoother(seg(cam.s, CHIP_READ_S - 0.2, CHIP_READ_S)) * fa.inA * v.live;
  const text = LOOP_STEPS[i];
  const b = mixBorder(BORDER.human, BORDER.active, v.fresh);
  return (
    <div style={{ position: 'absolute', left: x - CHIP.w / 2, top: y - CHIP.h / 2, width: CHIP.w, height: CHIP.h, boxSizing: 'border-box', borderRadius: 42, border: `${b.width / cam.s}px solid ${bcolor(b)}`, background: C.paper, opacity: v.live * v.dim, transform: `scale(${0.9 + 0.1 * v.live})`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 16px' }}>
      <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: CHIP.font, fontWeight: 400, lineHeight: 1.1, color: C.green, opacity: (0.4 + 0.6 * readA) * fa.shownA }} {...(readA > 0.5 ? {} : TEXTURE_ATTR)}>
        {readA > 0.5 ? (
          <Readable id={`loop.${i}`} text={text}>
            {text}
          </Readable>
        ) : (
          text
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- блок 4: события петли между станциями (032)
/** Импульс-кольцо вокруг узла мира (обводка расходится и гаснет за 1.2 с). */
const NodePulse: React.FC<{ id: string; at: number; color: string; t: number; cam: Cam }> = ({ id, at, color, t, cam }) => {
  const u = seg(t, at, at + 1.2);
  if (u <= 0 || u >= 1) return null;
  const n = nodeById(id);
  const g = 6 + 22 * expoOut(u);
  return <div style={{ position: 'absolute', left: n.x - n.w / 2 - g, top: n.y - n.h / 2 - g, width: n.w + g * 2, height: n.h + g * 2, boxSizing: 'border-box', borderRadius: 8 + g * 0.5, border: `${3 / cam.s}px solid ${color}`, opacity: 1 - u }} />;
};
/** «доповнити словник, бібліотеку формулювань чи навичку читання» — метки-предложения (охра) над станцией «пропозиція». */
const PROPOSAL_TAGS = ['словник', 'бібліотека формулювань', 'навичка читання'] as const;
const LoopTags: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const [x, y] = LOOP_CHIPS[3];
  // метки держатся, пока камера не уйдёт к «перевірці на еталоні» (время чтения последней метки)
  const out = smoother(seg(t, APPEAR['chip:4'] + 0.5, APPEAR['chip:4'] + 1.0));
  return (
    <>
      {PROPOSAL_TAGS.map((tag, i) => {
        const at = LOOP_EV.tags[i];
        const a = expoOut(seg(t, at, at + 0.4)) * (1 - out);
        if (a <= 0) return null;
        const px = 24; // px мира; на кадре 24 · s ≥ 24 при s ≥ 1
        return (
          <div key={tag} style={{ position: 'absolute', left: x + 20, top: y - CHIP.h / 2 - 60 - (2 - i) * 52, transform: `translate(-50%, ${(1 - a) * 8}px)`, opacity: a, fontFamily: TYPE.detail.fontFamily, fontSize: px, lineHeight: 1.2, color: C.ink, background: C.warnBg, border: `${2 / cam.s}px solid ${rgba(C.tight, 0.85)}`, borderRadius: 20, padding: '4px 14px', whiteSpace: 'nowrap' }}>
            {px * cam.s >= 24 ? (
              <Readable id={`loop.tag.${i}`} text={tag}>
                {tag}
              </Readable>
            ) : (
              tag
            )}
          </div>
        );
      })}
    </>
  );
};
/** «перевірка на еталоні»: кольцо проверки прорисовывается вокруг станции, рядом — «без нових помилок у критичних полях». */
const LoopCheck: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const [x, y] = LOOP_CHIPS[4];
  const p = smoother(seg(t, LOOP_EV.check, LOOP_EV.critical + 0.3));
  const done = smoother(seg(t, LOOP_EV.critical + 0.2, LOOP_EV.critical + 0.6));
  const capA = expoOut(seg(t, LOOP_EV.noErr, LOOP_EV.noErr + 0.4)) * (1 - smoother(seg(t, APPEAR['chip:5'] + 0.6, APPEAR['chip:5'] + 1.2)));
  if (p <= 0) return null;
  const pad = 10;
  const lines = ['без нових помилок', 'у критичних полях'];
  return (
    <>
      <svg style={{ position: 'absolute', left: x - CHIP.w / 2 - pad, top: y - CHIP.h / 2 - pad, overflow: 'visible' }} width={CHIP.w + pad * 2} height={CHIP.h + pad * 2}>
        <rect x={1} y={1} width={CHIP.w + pad * 2 - 2} height={CHIP.h + pad * 2 - 2} rx={(CHIP.h + pad * 2) / 2} pathLength={1} fill="none" stroke={done > 0 ? rgba(C.green, 0.4 + 0.5 * done) : rgba(C.tight, 0.9)} strokeWidth={3 / cam.s} strokeDasharray="1" strokeDashoffset={1 - p} opacity={1 - smoother(seg(t, APPEAR['chip:5'] + 0.6, APPEAR['chip:5'] + 1.2))} />
      </svg>
      {capA > 0 ? (
        <div style={{ position: 'absolute', left: x + CHIP.w / 2 + 26, top: y - 30, opacity: capA, fontFamily: TYPE.detail.fontFamily, fontSize: 24, lineHeight: 1.25, color: C.green, whiteSpace: 'nowrap' }}>
          {lines.map((l, i) => (
            <div key={i}>
              {24 * cam.s >= 24 ? (
                <Readable id={`loop.check.${i}`} text={l}>
                  {l}
                </Readable>
              ) : (
                l
              )}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};
/** «Юридичних висновків система не вчиться ніколи» — отдельный кадр: граница двумя колонками поверх приглушённой схемы. */
const BOUND_LEARN = ['словник', 'бібліотека формулювань', 'навичка читання'] as const;
const LoopBoundary: React.FC<{ t: number }> = ({ t }) => {
  const a = smoother(seg(t, LOOP_EV.bound, LOOP_EV.bound + 0.5)) * (1 - smoother(seg(t, block('b4').to - 0.3, block('b4').to + 0.3)));
  if (a <= 0) return null;
  const col = (x: number, w: number, b: Border, extra: React.CSSProperties = {}): React.CSSProperties => ({ position: 'absolute', left: x, top: 350, width: w, height: 330, boxSizing: 'border-box', border: `${b.width}px solid ${bcolor(b)}`, borderRadius: 8, background: C.paper, padding: '34px 40px', ...extra });
  const item = (i: number) => expoOut(seg(t, LOOP_EV.bound + 0.25 + i * 0.12, LOOP_EV.bound + 0.65 + i * 0.12));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: a }}>
      {/* схема (мир и карточки) приглушается бумагой под кадром-границей */}
      <div style={{ position: 'absolute', inset: 0, background: C.paper, opacity: 0.9 }} />
      <div style={col(300, 640, BORDER.human)}>
        <div style={{ fontFamily: TYPE.node.fontFamily, fontWeight: TYPE.node.fontWeight, textTransform: TYPE.node.textTransform, lineHeight: TYPE.node.lineHeight, fontSize: 36, color: C.green, letterSpacing: '0.1em' }}>
          <Readable id="bound.learn" text="ВЧИТЬСЯ">
            ВЧИТЬСЯ
          </Readable>
        </div>
        {BOUND_LEARN.map((w, i) => (
          <div key={w} style={{ marginTop: i === 0 ? 34 : 18, opacity: item(i), fontFamily: TYPE.detail.fontFamily, fontSize: 30, color: C.ink, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: C.green, flex: 'none' }} />
            <Readable id={`bound.learn.${i}`} text={w}>
              {w}
            </Readable>
          </div>
        ))}
      </div>
      <div style={col(980, 640, BORDER.normal)}>
        <div style={{ fontFamily: TYPE.node.fontFamily, fontWeight: TYPE.node.fontWeight, textTransform: TYPE.node.textTransform, lineHeight: TYPE.node.lineHeight, fontSize: 36, color: C.ink, letterSpacing: '0.1em' }}>
          <Readable id="bound.never" text="НЕ ВЧИТЬСЯ НІКОЛИ">
            НЕ ВЧИТЬСЯ НІКОЛИ
          </Readable>
        </div>
        <div style={{ marginTop: 34, opacity: item(0), fontFamily: TYPE.detail.fontFamily, fontSize: 30, color: C.ink, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: C.ink, flex: 'none' }} />
          <Readable id="bound.never.0" text="юридичні висновки">
            юридичні висновки
          </Readable>
        </div>
        <div style={{ marginTop: 18, opacity: item(1), fontFamily: TYPE.detail.fontFamily, fontSize: 26, color: C.green }}>
          <Readable id="bound.never.note" text="тільки у людини">
            тільки у людини
          </Readable>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- чипы-значения на каналах сцены панелей
/** Значения — только сверенные числа (NUMBERS_CHECK стр. 9: 24 700 → 43 155 → 48 355, даты 01.03.2015 / 01.09.2015;
 * стр. 18: 7 450,00 грн) и дата договора doc1 05.12.2013 (стенд, таблица экранов задачи). */
type ChipDef = { text: string; at?: number; tone?: 'ochre' | 'crit' | 'green' };
const STAGE_VALUES: Record<string, { in?: ChipDef; out?: ChipDef[] }> = {
  ocr: { in: { text: '05.12.2013' }, out: [{ text: '7 450,00 грн' }] },
  read2: { in: { text: '7 450,00 грн' }, out: [{ text: '24 700,00 грн' }, { text: '01.03.2015' }] },
  code: { in: { text: '24 700,00 грн' }, out: [{ text: '43 155,00 грн' }] },
  queue: { in: { text: '43 155,00 грн' }, out: [{ text: '48 355,00 грн' }] },
  // 3б–3в: ставка ланцюга идёт в картку; конфлікт площі — красным к «Людина №2» на словах о конфликте
  chain: { in: { text: '24 700,00 грн' }, out: [{ text: '48 355,00 грн' }] },
  card: { in: { text: '48 355,00 грн' }, out: [{ text: 'площа · конфлікт', at: EV.card.conflict + 0.2, tone: 'crit' }] },
  deadlines: { in: { text: '20.11.2028' } },
  deviations: { out: [{ text: 'вердикт', at: EV.deviations.lawyer - 0.6 }] },
};
const CHIP_TRAVEL = 1.3;
function stageChips(t: number): { text: string; pts: Pt[]; k: number; tone?: ChipDef['tone'] }[] {
  const { cur } = stageAt(t);
  const vals = STAGE_VALUES[cur.center];
  if (!vals) return [];
  const next = STAGE_LIST[STAGE_LIST.indexOf(cur) + 1]?.from ?? block('b3c').to - 0.4;
  const out: { text: string; pts: Pt[]; k: number; tone?: ChipDef['tone'] }[] = [];
  if (vals.in) {
    const at = vals.in.at ?? cur.from + 0.6;
    out.push({ text: vals.in.text, pts: CH_IN, k: seg(t, at, at + CHIP_TRAVEL), tone: vals.in.tone });
  }
  (vals.out ?? []).forEach((v, i) => {
    const at = v.at ?? next - CHIP_TRAVEL - 0.3 - (vals.out!.length - 1 - i) * 1.1;
    out.push({ text: v.text, pts: CH_OUT, k: seg(t, at, at + CHIP_TRAVEL), tone: v.tone });
  });
  return out.filter((c) => c.k > 0 && c.k < 1);
}

// ---------------------------------------------------------------- кадр
const TITLE_FROM: Record<string, number> = {
  b2: FLASH.ghostBy + 0.3,
  b3a: APPEAR.read2,
  b3b: APPEAR.chain + 0.6,
  // 032 п. 0.4: заголовок вердиктов — в момент раскрытия «Відхилення від еталона», не на панели «Строки»
  b3c: EV.deviations.stand,
  b4: block('b4').from + 0.8,
};

/** Подпись под заголовком сцены (Inter 26): 3а — оговорка к числам; 3б — цепочка ставки (NUMBERS_CHECK стр. 9). */
const TITLE_NOTE: Record<string, string> = {
  b3a: 'спостереження на пілоті',
  b3b: '24 700 → 43 155 → 48 355 грн · три угоди «№ 1»',
};

export const Scheme: React.FC<{ t: number }> = ({ t }) => {
  const cam = camAt(t);
  const s = cam.s;
  const b = blockAt(t);
  const mix = stageMix(t);
  const { cur, prev, u: stageU } = stageAt(t);
  const ct = contractAt(t);

  // рёбра мира: канал включается при появлении узла `to`
  const edges = EDGES.map((e) => {
    const at = APPEAR[e.to];
    const p = at === undefined ? 0 : smoother(seg(t, at - 0.35, at + 0.25));
    const vTo = visOf(e.to, t, true);
    return { e, p, ghost: vTo.ghost, flash: vTo.flash, dim: Math.min(visOf(e.from, t, true).dim, vTo.dim) };
  });
  const loopP = smoother(seg(t, LOOP_DRAW.from, LOOP_DRAW.to));
  const loopOn = t >= LOOP_ON ? 1 : 0;
  const loopFlash = t < LOOP_ON + 0.3 ? seg(t, LOOP_ON, LOOP_ON + 0.3) : 1 - smoother(seg(t, LOOP_ON + 0.3, LOOP_ON + 1.8));

  const loopPts = subPolyline(LOOP_PTS, 0, loopP);
  const rollP = smoother(seg(t, APPEAR['chip:5'] + 0.2, APPEAR['chip:5'] + 0.8));
  const insideNode = NODES.some((n) => Math.abs(ct.pos[0] - n.x) <= n.w / 2 + 16 && Math.abs(ct.pos[1] - n.y) <= n.h / 2 + 16);

  const perChannel = 6 + Math.round(4 * clamp((densityAt(t) - 0.25) / 0.75));
  const worldTracks: Track[] = [
    ...edges.map(({ e, dim }): Track => ({ pts: e.pts, on: APPEAR[e.to] === undefined ? null : APPEAR[e.to] - 0.35, kind: 'flow', alpha: dim })),
    { pts: LOOP_PTS, on: LOOP_DRAW.from, kind: 'loop', maxK: loopP, alpha: visOf('chip:0', t, false).dim },
    { pts: LOOP_ROLLBACK, on: APPEAR['chip:5'] + 0.2, kind: 'loop', alpha: visOf('chip:5', t, false).dim },
    ...(ct.on ? [{ pts: CONTRACT_ROUTE, on: CONTRACT.from, kind: 'contract', headK: ct.k } as Track] : []),
  ];
  // каналы сцены панелей (экранные координаты): трассы идут непрерывно с начала окна; канал виден, если есть сосед —
  // при смене панели видимость канала интерполируется вместе с раскладкой
  const has = (side: 'left' | 'right') => (cur[side] ? 1 : 0) * stageU + (prev ? (prev[side] ? 1 : 0) : cur[side] ? 1 : 0) * (1 - stageU);
  const inA = mix * has('left');
  const outA = mix * has('right');
  const won = windowStart(t) + 0.3;
  const identity: Cam = { s: 1, ox: 0, oy: 0 };
  const cards = cardLayout(t, { humanFillAt: EV.queue.human });

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
            {/* «І головне» (M): вся петля вспыхивает зелёным призраком и гаснет до контура — дальше прорисовывается по станциям */}
            {loopOn > 0 ? <path d={roundedPath(LOOP_PTS, 14)} fill="none" stroke={C.green} strokeWidth={(1.6 + 2.4 * loopFlash) / s} strokeDasharray={loopFlash > 0.3 ? undefined : '6 7'} opacity={(0.1 + 0.75 * loopFlash) * loopOn * visOf('chip:0', t, false).dim} /> : null}
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
          {/* блок 4: импульсы «рішенні юриста» / «Модель пропонує», метки предложения, кольцо проверки на эталоне */}
          <NodePulse id="human2" at={LOOP_EV.jurist} color={rgba(C.green, 0.85)} t={t} cam={cam} />
          <NodePulse id="deviations" at={LOOP_EV.model} color={rgba(C.tight, 0.9)} t={t} cam={cam} />
          <LoopTags t={t} cam={cam} />
          <LoopCheck t={t} cam={cam} />
        </div>
      </div>
      {/* сцена панелей: каналы входа/выхода — бледная нить и трассы */}
      {mix > 0 ? (
        <>
          <div style={{ position: 'absolute', inset: 0, opacity: inA }}>
            <Field t={t} cam={identity} tracks={[{ pts: CH_IN, on: won, kind: 'flow' }]} perChannel={8} width={1920} height={1080} />
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: outA }}>
            <Field t={t} cam={identity} tracks={[{ pts: CH_OUT, on: won, kind: 'flow' }]} perChannel={8} width={1920} height={1080} />
          </div>
          <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
            <path d={roundedPath(CH_IN)} fill="none" stroke={C.ink} strokeWidth={1.4} opacity={0.06 * inA} />
            <path d={roundedPath(CH_OUT)} fill="none" stroke={C.ink} strokeWidth={1.4} opacity={0.06 * outA} />
          </svg>
        </>
      ) : null}
      {/* чипы-значения на каналах панелей — под карточками (не перекрывают текст и карточки) */}
      {mix > 0.5
        ? stageChips(t).map((ch, i) => {
            const p = along(ch.pts, smoother(ch.k));
            return <ValueChip key={`${ch.text}-${i}`} text={ch.text} x={p[0]} y={p[1]} tone={ch.tone} a={mix * seg(ch.k, 0.1, 0.2) * (1 - seg(ch.k, 0.85, 0.95))} />;
          })
        : null}
      {/* карточки узлов (панель — поверх соседей) */}
      {[...cards].sort((a, z) => a.z - z.z).map((c) => (
        <Card key={c.n.id} c={c} t={t} />
      ))}
      {/* бусина договора блока 5 (мир → экран), только вне узлов */}
      {ct.on && !insideNode ? (
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
          <circle cx={ct.pos[0] * s + cam.ox} cy={ct.pos[1] * s + cam.oy} r={12} fill={C.tight} />
          <circle cx={ct.pos[0] * s + cam.ox} cy={ct.pos[1] * s + cam.oy} r={4.5} fill={C.paper} />
          {ct.conflict > 0 ? <circle cx={ct.pos[0] * s + cam.ox} cy={ct.pos[1] * s + cam.oy} r={17 + 9 * ct.conflict} fill="none" stroke={C.crit} strokeWidth={2.4} opacity={ct.conflict} /> : null}
        </svg>
      ) : null}

      {/* блок 4: кадр-граница «вчиться / не вчиться ніколи» */}
      <LoopBoundary t={t} />

      {/* блок 1: старая база плоско → экраны расходятся → файлы падают в «Скани» мёртвой схемы */}
      {t < block('b1').to + 0.2 ? <Block1Legacy t={t} scansAt={{ x: nodeById('scans').x * s + cam.ox, y: nodeById('scans').y * s + cam.oy }} /> : null}

      {/* блок 2: окно стенда — крупные фрагменты (план → «Договір» → скан), охровые рамки по словам; уходит вместе с появлением «Скани» */}
      {t >= EV.b2.open && t < EV.b2.close + 1 ? <Block2Stand t={t} /> : null}

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
          {TITLE_NOTE[b.id] ? (
            <div style={{ fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: 26, color: C.muted, marginTop: 2 }}>
              <Readable id={`title.${b.id}.note`} text={TITLE_NOTE[b.id]}>
                {TITLE_NOTE[b.id]}
              </Readable>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* зона субтитров: нижние 16 %, Source Serif 4 Regular 42 px */}
      <div style={{ position: 'absolute', left: 0, top: ZONE.subs.y0 - 40, width: 1920, height: 1080 - ZONE.subs.y0 + 40, background: 'linear-gradient(rgba(249,243,232,0) 0%, rgba(249,243,232,0.96) 35%, rgba(249,243,232,0.98) 100%)' }} />
      {subtitle ? (
        <div style={{ position: 'absolute', left: 960, top: ZONE.subs.y0 + 4, width: 1560, transform: 'translateX(-50%)', textAlign: 'center', ...TYPE.voice }}>
          <Readable id={`sub.${b.id}.${subtitle.slice(0, 24)}`} text={subtitle} voiced>
            {subtitle}
          </Readable>
        </div>
      ) : null}
    </div>
  );
};

// Содержимое живых панелей (правки Олега 08.11) — работа модуля на реальных фрагментах; новых интерфейсов не рисуем.
// Анимируются только накладки: обводка, курсор, позеленение, перемещение вырезок, чипы-значения.
// Ассеты — public/videos/yurkontur (npm run yur:prepare, videos/yurkontur/assets.manifest.json).
// Координаты кнопки и значений внутри карточки стенда — из public/videos/yurkontur/stand-queue-card.json (prepare-assets).
import React from 'react';
import { Img, staticFile } from 'remotion';
import { clamp, expoOut, lerp, seg, smoother } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { EV } from './stage.ts';
import { BORDER, C, TEXTURE_ATTR, TYPE, rgba } from './tokens.ts';

const A = (f: string) => staticFile(`videos/yurkontur/${f}`);
/** Область содержимого панели (под заголовком). */
export const CONTENT = { x: 28, y: 116, w: 1000, h: 476 } as const;

const ValueChip: React.FC<{ text: string; x: number; y: number; tone?: 'ochre' | 'crit' | 'green'; a?: number; scale?: number }> = ({ text, x, y, tone = 'ochre', a = 1, scale = 1 }) => {
  const col = tone === 'crit' ? C.crit : tone === 'green' ? C.green : C.tight;
  return (
    <div
      {...TEXTURE_ATTR}
      style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${scale})`, opacity: a, ...TYPE.chip, color: C.ink, background: tone === 'crit' ? rgba(C.crit, 0.08) : C.warnBg, border: `2px solid ${rgba(col, 0.85)}`, borderRadius: 8, padding: '4px 12px', whiteSpace: 'nowrap' }}
    >
      {text}
    </div>
  );
};
export { ValueChip };

const Caption: React.FC<{ id: string; text: string; x: number; y: number; a?: number; color?: string; anchor?: 'left' | 'center' }> = ({ id, text, x, y, a = 1, color = C.muted, anchor = 'left' }) => (
  <div style={{ position: 'absolute', left: x, top: y, transform: anchor === 'center' ? 'translateX(-50%)' : undefined, opacity: a, fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: 24, lineHeight: 1.3, color, whiteSpace: 'nowrap' }}>
    <Readable id={id} text={text}>
      {text}
    </Readable>
  </div>
);

/** Обводка, прорисовываемая по периметру (pathLength = 1). */
const Outline: React.FC<{ w: number; h: number; p: number; color: string; width?: number }> = ({ w, h, p, color, width = 3 }) => (
  <svg style={{ position: 'absolute', left: -6, top: -6, overflow: 'visible' }} width={w + 12} height={h + 12}>
    <rect x={1} y={1} width={w + 10} height={h + 10} rx={6} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeDasharray="1" strokeDashoffset={1 - p} />
  </svg>
);

// ---------------------------------------------------------------- Скани: 25 названий файлов → стопка сканов
const ScansPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.scans;
  const listW = 560;
  const listH = Math.round((906 / 900) * listW); // 564
  const reveal = smoother(seg(t, e.list, e.scroll[0])); // строки проявляются
  const scroll = smoother(seg(t, e.scroll[0], e.scroll[1]));
  const gone = smoother(seg(t, e.pages[0] - 0.4, e.pages[3] + 0.4)); // список уходит в стопку
  const winH = CONTENT.h;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: listW, height: winH, overflow: 'hidden', border: `${BORDER.normal.width}px solid ${BORDER.normal.color}`, borderRadius: 6, opacity: 1 - 0.85 * gone, transform: `translateX(${gone * 120}px) scale(${1 - 0.25 * gone})`, transformOrigin: '100% 50%' }}>
        <div style={{ position: 'absolute', left: 0, top: -scroll * (listH - winH), width: listW, height: listH, clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}>
          <Img src={A('legacy2-files.png')} style={{ width: listW, height: listH }} />
        </div>
      </div>
      {e.pages.map((at, i) => {
        const k = expoOut(seg(t, at, at + 0.5));
        if (k <= 0) return null;
        const w = 250;
        const h = Math.round((847 / 600) * w);
        const rot = [-4, 3, -2, 5][i];
        return (
          <div key={i} style={{ position: 'absolute', left: 660 + i * 14, top: 40 + i * 10 - (1 - k) * 80, width: w, height: h, opacity: k, transform: `rotate(${rot * k}deg)`, boxShadow: '0 6px 18px rgba(28,32,30,0.18)', border: `${BORDER.normal.width}px solid ${BORDER.normal.color}`, background: C.paper }}>
            <Img src={A(`s5_ctx_${i + 1}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- Розпізнавання: непрочитана ділянка → обвести охрой → лоток «людині»
const OcrPanel: React.FC<{ t: number }> = ({ t }) => {
  const tray = { x: 700, y: 250, w: 300, h: 226 };
  return (
    <>
      <div style={{ position: 'absolute', left: tray.x, top: tray.y, width: tray.w, height: tray.h, border: `${BORDER.human.width}px solid ${BORDER.human.color}`, borderRadius: 8, background: rgba(C.green, 0.05) }} />
      <Caption id="ocr.tray" text="людині" x={tray.x + 16} y={tray.y + tray.h - 44} color={C.green} />
      {EV.ocr.map((c, i) => {
        if (t < c.at) return null;
        const next = EV.ocr[i + 1]?.at ?? Infinity;
        const fly = smoother(seg(t, c.at + 1.4, c.at + 2.1));
        const appear = expoOut(seg(t, c.at, c.at + 0.35));
        // большой вид: вписать в 640×230
        const k = Math.min(640 / c.w, 230 / c.h, 2.2);
        const bh = c.h * k;
        const bx = 0;
        const by = 40;
        // в лотке: мини 120 px по ширине, стопка
        const mk = Math.min(250 / c.w, 44 / c.h);
        const tx = tray.x + 20;
        const ty = tray.y + 18 + i * 38;
        const x = lerp(bx, tx, fly);
        const y = lerp(by, ty, fly);
        const sc = lerp(k, mk, fly);
        const outline = smoother(seg(t, c.at + 0.35, c.at + 1.0));
        return (
          <React.Fragment key={c.crop}>
            <div style={{ position: 'absolute', left: x, top: y, width: c.w * sc, height: c.h * sc, opacity: appear }}>
              <Img src={A(c.crop)} style={{ width: '100%', height: '100%', display: 'block', border: `1px solid ${C.line2}` }} />
              {fly < 1 ? <Outline w={c.w * sc} h={c.h * sc} p={outline} color={rgba(C.tight, 0.9)} /> : null}
            </div>
            {t < next && fly < 0.2 ? <Caption id={`ocr.cause.${i}`} text={c.cause} x={0} y={by + bh + 22} a={appear * (1 - fly * 5)} color={C.tight} /> : null}
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- Два читання: потоки A и B, совпавшие сливаются, расхождение → черга
const READ_PAIRS = [
  { a: '24 700,00 грн', b: '24 700,00 грн' },
  { a: '01.03.2015', b: '01.03.2015' },
];
const Read2Panel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.read2;
  const laneA = 70;
  const laneB = 210;
  const mid = (laneA + laneB) / 2;
  const diverged = t >= e.diverge;
  const cropW = 474 * 1.12; // stand-readings-match.png 474×341 (поля 10 CSS px)
  const cropH = 341 * 1.12;
  const diffH = 440;
  const diffW = (474 / 652) * diffH; // stand-readings-diff.png 474×652
  const swap = smoother(seg(t, e.diverge, e.diverge + 0.4));
  const queue = { x: 40, y: 360, w: 340, h: 100 };
  return (
    <>
      <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: 0, top: laneA - 16, ...TYPE.chip, color: C.muted }}>A</div>
      <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: 0, top: laneB - 16, ...TYPE.chip, color: C.muted }}>B</div>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={420} height={300}>
        <path d={`M30,${laneA} L230,${laneA} Q260,${laneA} 280,${mid} L400,${mid}`} fill="none" stroke={rgba(C.ink, 0.12)} strokeWidth={2} />
        <path d={`M30,${laneB} L230,${laneB} Q260,${laneB} 280,${mid} L400,${mid}`} fill="none" stroke={rgba(C.ink, 0.12)} strokeWidth={2} />
      </svg>
      {READ_PAIRS.map((p, i) => {
        const at = e.pairs[i];
        const run = seg(t, at - 1.0, at); // подход по полосам
        const join = smoother(seg(t, at, at + 0.35));
        const leave = smoother(seg(t, at + 0.35, at + 1.1));
        if (t < at - 1.0 || leave >= 1) return null;
        const x = lerp(70, 250, run) + leave * 160;
        const yA = lerp(laneA, mid, join);
        const yB = lerp(laneB, mid, join);
        return (
          <React.Fragment key={i}>
            <ValueChip text={p.a} x={x} y={yA} a={1 - leave} />
            {join < 1 ? <ValueChip text={p.b} x={x} y={yB} a={1 - join} /> : null}
          </React.Fragment>
        );
      })}
      {/* расхождение: реальный пример стенда — читання взяли різні пункти 6.1 і 6.14 */}
      {t >= e.diverge - 1.0
        ? (() => {
            const run = seg(t, e.diverge - 1.0, e.diverge);
            const drop = smoother(seg(t, e.toQueue - 0.3, e.toQueue + 0.4));
            const x = lerp(70, 230, run);
            const tone = diverged ? 'crit' : 'ochre';
            return (
              <>
                <ValueChip text="п. 6.1" x={lerp(x, queue.x + 90, drop)} y={lerp(laneA, queue.y + queue.h / 2, drop)} tone={tone} />
                <ValueChip text="п. 6.14" x={lerp(x, queue.x + 250, drop)} y={lerp(laneB, queue.y + queue.h / 2, drop)} tone={tone} />
              </>
            );
          })()
        : null}
      <div style={{ position: 'absolute', left: queue.x, top: queue.y, width: queue.w, height: queue.h, border: `${BORDER.conflict.width}px dashed ${BORDER.conflict.color}`, borderRadius: 8, opacity: seg(t, e.diverge, e.diverge + 0.3) }} />
      <Caption id="read2.queue" text="у чергу перевірки" x={queue.x} y={queue.y + queue.h + 8} a={seg(t, e.diverge, e.diverge + 0.3)} color={C.crit} />
      {/* реальные фрагменты стенда: «Два незалежних читання» — совпали; после расхождения — следующая задача, где разошлись */}
      <div style={{ position: 'absolute', left: 1000 - cropW, top: 20, width: cropW, height: cropH, opacity: 1 - swap, border: `${BORDER.normal.width}px solid ${BORDER.normal.color}`, borderRadius: 6, overflow: 'hidden', background: C.paper }}>
        <Img src={A('stand-readings-match.png')} style={{ width: '100%', height: '100%' }} />
      </div>
      {swap > 0 ? (
        <div style={{ position: 'absolute', left: 1000 - diffW, top: 18, width: diffW, height: diffH, opacity: swap, border: `${BORDER.conflict.width}px solid ${BORDER.conflict.color}`, borderRadius: 6, overflow: 'hidden', background: C.paper }}>
          <Img src={A('stand-readings-diff.png')} style={{ width: '100%', height: '100%' }} />
        </div>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- Перевірки кодом: 4 строки, галочки по очереди, одна красная → черга
const CODE_ROWS = ['ЄДРПОУ', 'дата', 'сума прописом = цифрами', 'цитата є в скані'];
const CodePanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.code;
  return (
    <>
      {CODE_ROWS.map((r, i) => {
        const at = e.rows[i];
        const done = t >= at;
        const fail = i === e.failRow && done;
        const out = fail ? smoother(seg(t, e.out, e.out + 0.6)) : 0;
        const pop = expoOut(seg(t, at, at + 0.3));
        return (
          <div
            key={r}
            style={{ position: 'absolute', left: 60 + out * 520, top: 24 + i * 108, width: 760, height: 84, opacity: 1 - out * 0.9, boxSizing: 'border-box', borderRadius: 8, border: `${fail ? BORDER.conflict.width : BORDER.normal.width}px solid ${fail ? BORDER.conflict.color : done ? BORDER.human.color : BORDER.normal.color}`, background: fail ? rgba(C.crit, 0.06) : C.paper, display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}
          >
            <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 32, fontWeight: 400, color: C.ink }}>
              <Readable id={`code.row.${i}`} text={r}>
                {r}
              </Readable>
            </div>
            <div {...TEXTURE_ATTR} style={{ ...TYPE.chip, fontSize: 34, color: fail ? C.crit : C.green, opacity: pop, transform: `scale(${0.6 + 0.4 * pop})` }}>
              {done ? (fail ? '✕' : '✓') : ''}
            </div>
          </div>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- Черга перевірки: карточка задачи стенда, курсор жмёт «Підтвердити»
/** Геометрия карточки стенда (CSS px; stand-queue-card.json): карточка, кнопка «Підтвердити», блок читаний. */
const CARD = { w: 646, h: 501.09, confirm: { x: 19, y: 447.17, w: 138.59, h: 40.92 }, readings: { x: 331, y: 76.39, w: 296, h: 207.19 } };
const QueuePanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.queue;
  const k = CONTENT.h / CARD.h; // CSS px → px кадра
  const w = CARD.w * k;
  const left = (CONTENT.w - w) / 2;
  const btn = { x: left + CARD.confirm.x * k, y: CARD.confirm.y * k, w: CARD.confirm.w * k, h: CARD.confirm.h * k };
  const rd = { x: left + CARD.readings.x * k, y: CARD.readings.y * k, w: CARD.readings.w * k, h: CARD.readings.h * k };
  const cu = smoother(seg(t, e.cursor[0], e.cursor[1]));
  const cx = lerp(left + w * 0.82, btn.x + btn.w * 0.55, cu);
  const cy = lerp(CONTENT.h * 0.35, btn.y + btn.h * 0.6, cu);
  const press = clamp(1 - Math.abs(t - e.click) / 0.12);
  const green = smoother(seg(t, e.green, e.green + 0.35));
  return (
    <>
      <div style={{ position: 'absolute', left, top: 0, width: w, height: CONTENT.h, border: `${BORDER.normal.width}px solid ${BORDER.normal.color}`, borderRadius: 6, overflow: 'hidden' }}>
        <Img src={A('stand-queue-card.png')} style={{ width: '100%', height: '100%' }} />
      </div>
      {/* нажатие кнопки — затемнение её прямоугольника */}
      <div style={{ position: 'absolute', left: btn.x, top: btn.y, width: btn.w, height: btn.h, borderRadius: 6, background: rgba(C.ink, 0.25 * press) }} />
      {/* значение подтверждено — зелёная накладка на блоке читаний */}
      <div style={{ position: 'absolute', left: rd.x - 4, top: rd.y - 4, width: rd.w + 8, height: rd.h + 8, borderRadius: 8, border: `${BORDER.human.width + 0.6}px solid ${rgba(C.green, 0.85 * green)}`, background: rgba(C.green, 0.16 * green) }} />
      {green > 0 ? <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: rd.x + rd.w - 30, top: rd.y - 22, width: 44, height: 44, borderRadius: 22, background: C.green, color: C.paper, ...TYPE.chip, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${green})` }}>✓</div> : null}
      {/* курсор (накладка) */}
      <svg style={{ position: 'absolute', left: cx, top: cy, overflow: 'visible', opacity: seg(t, e.cursor[0], e.cursor[0] + 0.15), transform: `scale(${1 - 0.12 * press})`, transformOrigin: '0 0' }} width={1} height={1}>
        <path d="M0,0 L0,30 L8,23 L13,35 L18,33 L13,21 L23,21 Z" fill={C.ink} stroke={C.paper} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </>
  );
};

// ---------------------------------------------------------------- Блок 2: картка аптеки на стенде (план → договір → скан)
/** Геометрия кадров стенда блока 2 (CSS px внутри клипа 990×720; public/videos/yurkontur/stand-b2.json из prepare-assets). */
const B2 = { w: 990, h: 720, tabs: { x: 14, y: 129.86, w: 920, h: 28.25 }, plan: { x: 15, y: 194, w: 918, h: 457.84 }, rate: { x: 15, y: 226.69, w: 305.33, h: 135.27 } };
export const Block2Stand: React.FC<{ t: number; x: number; y: number; h: number }> = ({ t, x, y, h }) => {
  const e = EV.b2;
  const k = h / B2.h;
  const w = B2.w * k;
  const a = seg(t, e.open, e.open + 0.5) * (1 - seg(t, e.close, e.close + 0.5));
  if (a <= 0) return null;
  const toContract = smoother(seg(t, e.contract, e.contract + 0.4));
  const toScan = smoother(seg(t, e.scan, e.scan + 0.4));
  const box = (r: { x: number; y: number; w: number; h: number }, from: number, until: number, key: string) => {
    const p = smoother(seg(t, from, from + 0.5));
    const off = 1 - seg(t, until - 0.2, until);
    if (p <= 0 || off <= 0) return null;
    return (
      <div key={key} style={{ position: 'absolute', left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k, opacity: off }}>
        <Outline w={r.w * k} h={r.h * k} p={p} color={rgba(C.tight, 0.9)} />
      </div>
    );
  };
  return (
    <div style={{ position: 'absolute', left: x - w / 2, top: y, width: w, height: h, opacity: a, borderRadius: BORDER.radius, border: `${BORDER.normal.width}px solid ${BORDER.normal.color}`, background: C.paper, overflow: 'hidden' }}>
      <Img src={A('stand-b2-plan.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <Img src={A('stand-b2-contract.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: toContract }} />
      <Img src={A('stand-b2-scan.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: toScan }} />
      {box(B2.tabs, e.tabs, e.plan, 'tabs')}
      {box(B2.plan, e.plan, e.contract, 'plan')}
      {box(B2.rate, e.rate, e.scan, 'rate')}
    </div>
  );
};

export const PANEL_CONTENT: Record<string, React.FC<{ t: number }>> = { scans: ScansPanel, ocr: OcrPanel, read2: Read2Panel, code: CodePanel, queue: QueuePanel };

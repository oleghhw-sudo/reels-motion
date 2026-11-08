// Содержимое живых панелей и окно стенда блока 2 (правки Олега 08.11) — работа модуля на реальных фрагментах; новых
// интерфейсов не рисуем, анимируются только накладки (обводка, курсор, позеленение, перемещение вырезок, чипы).
// Читаемость (правка 2): страницу стенда целиком в уменьшенном виде не вставляем — показываем крупный фрагмент с нужным
// полем, мелкий текст интерфейса на кадре 1920×1080 ≥ 20 px; камера проезжает по фрагменту (PanView).
//   стенд: самый мелкий текст 9.5–10 CSS px → масштаб 2.1 CSS (кадры DPR 3 → 0.7 px кадра на px картинки);
//   список файлов legacy_2: шрифт ≈ 22 px картинки → 0.92; скан (1132×1600): шрифт ≈ 18 px → 1.1; план (подписи ≈ 14 px) → 1.45.
// Ассеты — public/videos/yurkontur (npm run yur:prepare); геометрия фрагментов — videos/yurkontur/stand-geometry.json.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { clamp, expoOut, lerp, seg, smoother } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import GEO from '../../../videos/yurkontur/stand-geometry.json';
import { EV } from './stage.ts';
import { BORDER, C, TEXTURE_ATTR, TYPE, bcolor, rgba } from './tokens.ts';

const A = (f: string) => staticFile(`videos/yurkontur/${f}`);
/** Область содержимого панели (под заголовком). */
export const CONTENT = { x: 28, y: 116, w: 1000, h: 476 } as const;
/** Масштаб кадров стенда: 2.1 CSS-пикселя на кадре на 1 CSS px (мелкий текст 9.5 px → 20 px); картинки сняты с DPR 3. */
const STAND_K = 2.1 / GEO.dpr;

type R = { x: number; y: number; w: number; h: number };
type Key = { at: number; x: number; y: number; dur?: number };

/** Проезд камеры по крупному фрагменту: картинка imgW×imgH в масштабе k (px кадра на px картинки) в окне w×h. */
const PanView: React.FC<{ t: number; src: string; imgW: number; imgH: number; k: number; w: number; h: number; keys: Key[]; opacity?: number; children?: (toScreen: (r: R) => R) => React.ReactNode }> = ({ t, src, imgW, imgH, k, w, h, keys, opacity = 1, children }) => {
  const vw = w / k;
  const vh = h / k;
  const cx = (x: number) => (imgW <= vw ? (imgW - vw) / 2 : clamp(x, 0, imgW - vw));
  const cy = (y: number) => (imgH <= vh ? (imgH - vh) / 2 : clamp(y, 0, imgH - vh));
  let vx = cx(keys[0].x);
  let vy = cy(keys[0].y);
  for (let i = 1; i < keys.length; i++) {
    const kk = keys[i];
    const u = smoother(seg(t, kk.at, kk.at + (kk.dur ?? 0.5)));
    vx = lerp(vx, cx(kk.x), u);
    vy = lerp(vy, cy(kk.y), u);
  }
  const toScreen = (r: R): R => ({ x: (r.x - vx) * k, y: (r.y - vy) * k, w: r.w * k, h: r.h * k });
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden', opacity }}>
      <Img src={src} style={{ position: 'absolute', left: -vx * k, top: -vy * k, width: imgW * k, height: imgH * k, maxWidth: 'none' }} />
      {children ? children(toScreen) : null}
    </div>
  );
};

export const ValueChip: React.FC<{ text: string; x: number; y: number; tone?: 'ochre' | 'crit' | 'green'; a?: number }> = ({ text, x, y, tone = 'ochre', a = 1 }) => {
  const col = tone === 'crit' ? C.crit : tone === 'green' ? C.green : C.tight;
  return (
    <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', opacity: a, ...TYPE.chip, color: C.ink, background: tone === 'crit' ? rgba(C.crit, 0.08) : C.warnBg, border: `2px solid ${rgba(col, 0.85)}`, borderRadius: 8, padding: '4px 12px', whiteSpace: 'nowrap' }}>
      {text}
    </div>
  );
};

const Caption: React.FC<{ id: string; text: string; x: number; y: number; a?: number; color?: string }> = ({ id, text, x, y, a = 1, color = C.muted }) => (
  <div style={{ position: 'absolute', left: x, top: y, opacity: a, fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: 24, lineHeight: 1.3, color, whiteSpace: 'nowrap' }}>
    <Readable id={id} text={text}>
      {text}
    </Readable>
  </div>
);

/** Обводка, прорисовываемая по периметру (pathLength = 1). */
const Outline: React.FC<{ r: R; p: number; color: string; width?: number; a?: number }> = ({ r, p, color, width = 3, a = 1 }) =>
  p <= 0 || a <= 0 ? null : (
    <svg style={{ position: 'absolute', left: r.x - 6, top: r.y - 6, overflow: 'visible', opacity: a }} width={r.w + 12} height={r.h + 12}>
      <rect x={1} y={1} width={r.w + 10} height={r.h + 10} rx={6} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeDasharray="1" strokeDashoffset={1 - p} />
    </svg>
  );
const frameBox = (w: number, h: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ position: 'absolute', width: w, height: h, border: `${BORDER.normal.width}px solid ${bcolor(BORDER.normal)}`, borderRadius: 6, overflow: 'hidden', background: C.paper, ...extra });

// ---------------------------------------------------------------- Скани: 25 названий файлов → стопка сканов
const LIST_K = 0.92; // шрифт списка ≈ 22 px картинки → ≈ 20 px на кадре
const ScansPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = t > 25 ? EV.scans.b3a : EV.scans.b1;
  const listW = 900 * LIST_K;
  const listH = 906 * LIST_K;
  const reveal = smoother(seg(t, e.list, e.scroll[0]));
  const scroll = smoother(seg(t, e.scroll[0], e.scroll[1]));
  const gone = smoother(seg(t, e.pages[0] - 0.2, e.pages[3] + 0.3)); // список уходит в стопку
  return (
    <>
      <div style={frameBox(listW, CONTENT.h, { left: 0, top: 0, opacity: 1 - 0.85 * gone, transform: `translateX(${-gone * 60}px)` })}>
        <div style={{ position: 'absolute', left: 0, top: -scroll * (listH - CONTENT.h), width: listW, height: listH, clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}>
          <Img src={A('legacy2-files.png')} style={{ width: listW, height: listH }} />
        </div>
      </div>
      {/* стопка сканов — предметы (4 страницы s5_ctx), не текст для чтения */}
      {e.pages.map((at, i) => {
        const k = expoOut(seg(t, at, at + 0.45));
        if (k <= 0) return null;
        const w = 250;
        const h = Math.round((847 / 600) * w);
        return (
          <div key={i} style={frameBox(w, h, { left: 700 + i * 12, top: 50 + i * 10 - (1 - k) * 80, opacity: k, transform: `rotate(${[-4, 3, -2, 5][i] * k}deg)`, boxShadow: '0 6px 18px rgba(28,32,30,0.18)', borderRadius: 2 })}>
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
      <div style={{ position: 'absolute', left: tray.x, top: tray.y, width: tray.w, height: tray.h, border: `${BORDER.human.width}px solid ${bcolor(BORDER.human)}`, borderRadius: 8, background: rgba(C.green, 0.05) }} />
      <Caption id="ocr.tray" text="людині" x={tray.x + 16} y={tray.y + tray.h - 44} color={C.green} />
      {EV.ocr.map((c, i) => {
        if (t < c.at) return null;
        const next = EV.ocr[i + 1]?.at ?? Infinity;
        const fly = smoother(seg(t, c.at + 1.4, c.at + 2.1));
        const appear = expoOut(seg(t, c.at, c.at + 0.35));
        const bh = c.h * c.k;
        const mk = Math.min(250 / c.w, 44 / c.h);
        const x = lerp(0, tray.x + 20, fly);
        const y = lerp(30, tray.y + 18 + i * 38, fly);
        const sc = lerp(c.k, mk, fly);
        const outline = smoother(seg(t, c.at + 0.35, c.at + 1.0));
        return (
          <React.Fragment key={c.crop}>
            <div style={{ position: 'absolute', left: x, top: y, width: c.w * sc, height: c.h * sc, opacity: appear }}>
              <Img src={A(c.crop)} style={{ width: '100%', height: '100%', display: 'block', border: `1px solid ${C.line2}` }} />
              <Outline r={{ x: 0, y: 0, w: c.w * sc, h: c.h * sc }} p={outline} color={rgba(C.tight, 0.9)} a={1 - fly} />
            </div>
            {t < next && fly < 0.2 ? <Caption id={`ocr.cause.${i}`} text={c.cause} x={0} y={30 + bh + 18} a={appear * (1 - fly * 5)} color={C.tight} /> : null}
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
  const laneA = 80;
  const laneB = 200;
  const mid = (laneA + laneB) / 2;
  const diverged = t >= e.diverge;
  const k = CONTENT.h / GEO.readingsMatch.h; // ≈ 0.7 → мелкий текст стенда ≥ 20 px
  const cw = GEO.readingsMatch.w * k;
  const cropX = CONTENT.w - cw;
  const swap = smoother(seg(t, e.diverge, e.diverge + 0.4));
  const queue = { x: 20, y: 320, w: 300, h: 96 };
  return (
    <>
      <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: 0, top: laneA - 16, ...TYPE.chip, color: C.muted }}>A</div>
      <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: 0, top: laneB - 16, ...TYPE.chip, color: C.muted }}>B</div>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={cropX} height={300}>
        <path d={`M30,${laneA} L190,${laneA} Q225,${laneA} 245,${mid} L${cropX},${mid}`} fill="none" stroke={rgba(C.ink, 0.12)} strokeWidth={2} />
        <path d={`M30,${laneB} L190,${laneB} Q225,${laneB} 245,${mid} L${cropX},${mid}`} fill="none" stroke={rgba(C.ink, 0.12)} strokeWidth={2} />
      </svg>
      {READ_PAIRS.map((p, i) => {
        const at = e.pairs[i];
        const run = seg(t, at - 1.0, at);
        const join = smoother(seg(t, at, at + 0.35));
        const leave = smoother(seg(t, at + 0.35, at + 1.0));
        if (t < at - 1.0 || leave >= 1) return null;
        // чипы проявляются внутри панели (не выезжают из-под границы), сходятся; слившийся уходит под вырезку стенда
        const x = lerp(140, 190, run) + leave * 260;
        const inA = smoother(seg(t, at - 1.0, at - 0.7));
        return (
          <React.Fragment key={i}>
            <ValueChip text={p.a} x={x} y={lerp(laneA, mid, join)} a={inA} />
            {join < 1 ? <ValueChip text={p.b} x={x} y={lerp(laneB, mid, join)} a={inA * (1 - join)} /> : null}
          </React.Fragment>
        );
      })}
      {/* расхождение: реальный пример стенда — «читання взяли різні пункти 6.1 і 6.14» */}
      {t >= e.diverge - 1.0
        ? (() => {
            const run = seg(t, e.diverge - 1.0, e.diverge);
            const drop = smoother(seg(t, e.toQueue - 0.3, e.toQueue + 0.4));
            const x = lerp(120, 170, run);
            const inA = smoother(seg(t, e.diverge - 1.0, e.diverge - 0.7));
            const tone = diverged ? 'crit' : 'ochre';
            return (
              <>
                <ValueChip text="п. 6.1" x={lerp(x, queue.x + 80, drop)} y={lerp(laneA, queue.y + queue.h / 2, drop)} tone={tone} a={inA} />
                <ValueChip text="п. 6.14" x={lerp(x, queue.x + 220, drop)} y={lerp(laneB, queue.y + queue.h / 2, drop)} tone={tone} a={inA} />
              </>
            );
          })()
        : null}
      <div style={{ position: 'absolute', left: queue.x, top: queue.y, width: queue.w, height: queue.h, border: `${BORDER.conflict.width}px dashed ${bcolor(BORDER.conflict)}`, borderRadius: 8, opacity: seg(t, e.diverge, e.diverge + 0.3) }} />
      <Caption id="read2.queue" text="у чергу перевірки" x={queue.x} y={queue.y + queue.h + 8} a={seg(t, e.diverge, e.diverge + 0.3)} color={C.crit} />
      {/* вырезки стенда крупно: «Два незалежних читання» — совпали; после расхождения — задача, где разошлись (проезд вниз) */}
      <div style={frameBox(cw, CONTENT.h, { left: cropX, top: 0 })}>
        <PanView t={t} src={A('stand-readings-match.png')} imgW={GEO.readingsMatch.w} imgH={GEO.readingsMatch.h} k={k} w={cw} h={CONTENT.h} keys={[{ at: 0, x: 0, y: 0 }]} opacity={1 - swap} />
        {swap > 0 ? <PanView t={t} src={A('stand-readings-diff.png')} imgW={GEO.readingsDiff.w} imgH={GEO.readingsDiff.h} k={k} w={cw} h={CONTENT.h} keys={[{ at: 0, x: 0, y: 0 }, { at: e.diverge + 0.3, x: 0, y: GEO.readingsDiff.h, dur: 1.5 }]} opacity={swap} /> : null}
      </div>
      {swap > 0 ? <div style={{ position: 'absolute', left: cropX, top: 0, width: cw, height: CONTENT.h, boxSizing: 'border-box', border: `${BORDER.conflict.width}px solid ${bcolor(BORDER.conflict)}`, borderRadius: 6, opacity: swap }} /> : null}
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
        const b = fail ? BORDER.conflict : done ? BORDER.human : BORDER.normal;
        return (
          <div key={r} style={{ position: 'absolute', left: 60 + out * 520, top: 24 + i * 108, width: 760, height: 84, opacity: 1 - out * 0.9, boxSizing: 'border-box', borderRadius: 8, border: `${b.width}px solid ${bcolor(b)}`, background: fail ? rgba(C.crit, 0.06) : C.paper, display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
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

// ---------------------------------------------------------------- Черга перевірки: карточка задачи стенда крупно, проезд к «Підтвердити»
const QueuePanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.queue;
  const g = GEO.card;
  const k = STAND_K;
  const vw = CONTENT.w / k;
  const vh = CONTENT.h / k;
  const atReadings = { x: g.w - vw, y: Math.max(0, g.readings.y - 30) };
  const atButton = { x: 0, y: g.h - vh };
  const press = clamp(1 - Math.abs(t - e.click) / 0.12);
  const green = smoother(seg(t, e.green, e.green + 0.35));
  const cu = smoother(seg(t, e.cursor[0], e.cursor[1]));
  return (
    <div style={frameBox(CONTENT.w, CONTENT.h, { left: 0, top: 0 })}>
      <PanView t={t} src={A('stand-queue-card.png')} imgW={g.w} imgH={g.h} k={k} w={CONTENT.w} h={CONTENT.h} keys={[{ at: 0, ...atReadings }, { at: e.toButton, ...atButton, dur: 0.45 }, { at: e.back, ...atReadings, dur: 0.45 }]}>
        {(S) => {
          const btn = S(g.confirm);
          const rd = S(g.readings);
          // курсор: из центра блока значений к кнопке «Підтвердити» (координаты картинки → кадр)
          const from = S({ x: g.readings.x + g.readings.w * 0.4, y: g.readings.y + g.readings.h * 0.9, w: 0, h: 0 });
          const to = S({ x: g.confirm.x + g.confirm.w * 0.55, y: g.confirm.y + g.confirm.h * 0.6, w: 0, h: 0 });
          const cx = lerp(from.x, to.x, cu);
          const cy = lerp(from.y, to.y, cu);
          const cursorA = seg(t, e.cursor[0], e.cursor[0] + 0.15) * (1 - seg(t, e.back + 0.3, e.back + 0.5));
          return (
            <>
              <div style={{ position: 'absolute', left: btn.x, top: btn.y, width: btn.w, height: btn.h, borderRadius: 8, background: rgba(C.ink, 0.25 * press) }} />
              <div style={{ position: 'absolute', left: rd.x - 4, top: rd.y - 4, width: rd.w + 8, height: rd.h + 8, borderRadius: 10, border: `${BORDER.human.width + 0.6}px solid ${rgba(C.green, 0.85 * green)}`, background: rgba(C.green, 0.16 * green) }} />
              {green > 0 ? <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: rd.x + rd.w - 34, top: rd.y - 18, width: 48, height: 48, borderRadius: 24, background: C.green, color: C.paper, ...TYPE.chip, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${green})` }}>✓</div> : null}
              {cursorA > 0 ? (
                <svg style={{ position: 'absolute', left: cx, top: cy, overflow: 'visible', opacity: cursorA, transform: `scale(${1.3 - 0.15 * press})`, transformOrigin: '0 0' }} width={1} height={1}>
                  <path d="M0,0 L0,30 L8,23 L13,35 L18,33 L13,21 L23,21 Z" fill={C.ink} stroke={C.paper} strokeWidth={1.6} strokeLinejoin="round" />
                </svg>
              ) : null}
            </>
          );
        }}
      </PanView>
    </div>
  );
};

// ---------------------------------------------------------------- Блок 2: картка аптеки на стенде — план → «Договір» → скан
/** Окно стенда блока 2 на кадре (рабочая зона, под заголовком). */
const B2_WIN = { x: 340, y: 232, w: 1240, h: 620 };
const PLAN_K = 1.45; // подписи плана ≈ 14 px картинки → ≈ 20 px
const SCAN_K = 1.1; // шрифт скана ≈ 18 px картинки → ≈ 20 px
/** «Торгова зала» на плане (px обрезанной картинки плана) — рамка охрой на «поруч планування». */
const PLAN_ROOM: R = { x: 56, y: 466, w: 316, h: 352 };
export const Block2Stand: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.b2;
  const a = seg(t, e.open, e.open + 0.5) * (1 - smoother(seg(t, e.close, e.close + 0.6)));
  if (a <= 0) return null;
  const toContract = smoother(seg(t, e.contract, e.contract + 0.4));
  const toScan = smoother(seg(t, e.scan, e.scan + 0.4));
  const W = B2_WIN.w;
  const H = B2_WIN.h;
  const box = GEO.scan.boxes[0];
  const scanVY = box.y + box.h / 2 - H / SCAN_K / 2;
  const ck = STAND_K;
  return (
    <div style={frameBox(W, H, { left: B2_WIN.x, top: B2_WIN.y, opacity: a, borderRadius: BORDER.radius })}>
      {/* план приміщення (вкладка «План», встроенная картинка, без меню ALI) — проезд сверху вниз */}
      <PanView t={t} src={A('stand-b2-plan.png')} imgW={GEO.plan.w} imgH={GEO.plan.h} k={PLAN_K} w={W} h={H} keys={[{ at: 0, x: 0, y: 0 }, { at: e.planPan[0], x: 0, y: GEO.plan.h, dur: e.planPan[1] - e.planPan[0] }]} opacity={1 - toContract}>
        {(S) => <Outline r={S(PLAN_ROOM)} p={smoother(seg(t, e.room, e.room + 0.5))} color={rgba(C.tight, 0.9)} />}
      </PanView>
      {/* вкладка «Договір» крупно: вкладки + «Ставка чинна · Діє до · Останній день заяви» */}
      {toContract > 0 ? (
        <PanView t={t} src={A('stand-b2-contract.png')} imgW={GEO.contract.w} imgH={GEO.contract.h} k={ck} w={W} h={H} keys={[{ at: 0, x: 0, y: GEO.contract.tabs.y - 80 }, { at: e.contract, x: 60, y: GEO.contract.tabs.y - 60, dur: e.scan - e.contract }]} opacity={toContract * (1 - toScan)}>
          {(S) => <Outline r={S(GEO.contract.rate)} p={smoother(seg(t, e.rate, e.rate + 0.5))} color={rgba(C.tight, 0.9)} width={3.5} />}
        </PanView>
      ) : null}
      {/* скан с рамкой стенда (поле «Ставка за договором», стор. договору) — исходная картинка из стенда */}
      {toScan > 0 ? (
        <PanView t={t} src={A(GEO.scan.file)} imgW={GEO.scan.w} imgH={GEO.scan.h} k={SCAN_K} w={W} h={H} keys={[{ at: 0, x: 0, y: scanVY - 40 }, { at: e.scan, x: 0, y: scanVY, dur: 1.2 }]} opacity={toScan}>
          {(S) => <Outline r={S(box)} p={smoother(seg(t, e.scan + 0.3, e.scan + 0.8))} color={rgba(C.tight, 0.95)} width={3} />}
        </PanView>
      ) : null}
    </div>
  );
};

export const PANEL_CONTENT: Record<string, React.FC<{ t: number }>> = { scans: ScansPanel, ocr: OcrPanel, read2: Read2Panel, code: CodePanel, queue: QueuePanel };

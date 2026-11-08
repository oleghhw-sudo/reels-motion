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
import { APPEAR, DEAD } from './timeline.ts';
import { roundedPath } from './geom.ts';
import { BORDER, C, TEXTURE_ATTR, TYPE, bcolor, mixBorder, rgba } from './tokens.ts';

const A = (f: string) => staticFile(`videos/yurkontur/${f}`);
/** Область содержимого панели (под заголовком). */
export const CONTENT = { x: 28, y: 116, w: 1000, h: 476 } as const;
/** Масштаб кадров стенда: 2.1 CSS-пикселя на кадре на 1 CSS px (мелкий текст 9.5 px → 20 px); картинки сняты с DPR 3. */
const STAND_K = 2.1 / GEO.dpr;

type R = { x: number; y: number; w: number; h: number };
type Key = { at: number; x: number; y: number; dur?: number };

/** Проезд камеры по крупному фрагменту: картинка imgW×imgH в масштабе k (px кадра на px картинки) в окне w×h. */
/** src не задан — только слой накладок с той же камерой (над несколькими картинками, сменяющимися растворением). */
const PanView: React.FC<{ t: number; src?: string; imgW: number; imgH: number; k: number; w: number; h: number; keys: Key[]; opacity?: number; overscanY?: boolean; children?: (toScreen: (r: R) => R) => React.ReactNode }> = ({ t, src, imgW, imgH, k, w, h, keys, opacity = 1, overscanY = false, children }) => {
  const vw = w / k;
  const vh = h / k;
  const cx = (x: number) => (imgW <= vw ? (imgW - vw) / 2 : clamp(x, 0, imgW - vw));
  // overscanY — окно может уйти ниже картинки (под таблицей бумага): кадр по границе строки, без среза текста сверху
  const cy = (y: number) => (overscanY ? Math.max(0, y) : imgH <= vh ? (imgH - vh) / 2 : clamp(y, 0, imgH - vh));
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
      {src ? <Img src={src} style={{ position: 'absolute', left: -vx * k, top: -vy * k, width: imgW * k, height: imgH * k, maxWidth: 'none' }} /> : null}
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

// ---------------------------------------------------------------- Блок 1: старая база (legacy_1…4) плоско
// Скрины учётной системы подаются как есть, без HUD-обработки: окно 1688×660 в рабочей зоне, масштаб 1:1 (шрифт ≈ 21 px
// исходника ≥ 20 px на кадре). Все четыре скрина одной геометрии (3024×1964, одна шапка и ряд вкладок) — одна траектория
// камеры по исходным пикселям, скрины сменяются растворением. Фрагменты выбраны без телефона и ФИО; координаты — px исходника.
const LEG = { w: 3024, h: 1964 } as const;
const LEG_WIN = { x: 116, y: 214, w: 1688, h: 660 } as const;
/** 13 вкладок карточки договора (Основное … Файлы): x-границы в px исходника, строка y 471–503. */
const LEG_TABS: [number, number][] = [[15, 130], [133, 373], [380, 562], [566, 737], [743, 957], [963, 1129], [1135, 1300], [1305, 1536], [1540, 1646], [1650, 1996], [2001, 2229], [2235, 2461], [2467, 2549]];
const LEG_ROW0 = 627; // верх первой строки списка файлов legacy_2
const LEG_ROW_H = 36;
/** Финальные места миниатюр (центр) после «екрани розходяться»: legacy_2 — над «Скани», куда падают файлы. */
const THUMBS: { f: string; x: number; y: number }[] = [
  { f: 'legacy_1.png', x: 720, y: 270 },
  { f: 'legacy_2.png', x: 300, y: 270 },
  { f: 'legacy_3.png', x: 420, y: 800 },
  { f: 'legacy_4.png', x: 900, y: 800 },
];
const THUMB_W = 380; // промежуточный размер (раскладка по четвертям), финальный ×0.6
/** Детерминированный «случайный» сдвиг падения (гейт 1: без Math.random). */
const jitter = (i: number) => Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453) - 0.5;

export const Block1Legacy: React.FC<{ t: number; scansAt: { x: number; y: number } }> = ({ t, scansAt }) => {
  const e = EV.b1;
  const gone = smoother(seg(t, e.out, e.out + 0.6));
  if (gone >= 1) return null;
  const spread = smoother(seg(t, e.spread, e.spread + 0.9));
  // экран по словам: legacy_1 → (строки, ставка) legacy_3 → (юридичні умови) legacy_4 → (перелік файлів) legacy_2
  const shots: { f: string; at: number }[] = [
    { f: 'legacy_1.png', at: 0 },
    { f: 'legacy_3.png', at: e.rent },
    { f: 'legacy_4.png', at: e.legal },
    { f: 'legacy_2.png', at: e.files },
  ];
  const keys: Key[] = [
    { at: 0, x: 0, y: 68 }, // верх — заголовок окна, без чёрной полосы скрина
    { at: e.tabs - 0.2, x: 0, y: 300, dur: 0.6 },
    { at: e.sweep, x: LEG_TABS[12][1] + 40 - LEG_WIN.w, y: 300, dur: Math.max(0.5, e.rent - e.sweep - 0.15) },
    { at: e.rent - 0.1, x: 0, y: 540, dur: 0.6 },
    { at: e.legal - 0.1, x: 0, y: 532, dur: 0.5 }, // подвкладки «Общая инфо …» целиком
    { at: e.files - 0.1, x: 0, y: 540, dur: 0.5 },
    // проезд по списку: верх кадра встаёт на границу строки 7 — строки не режутся пополам
    { at: e.scroll, x: 0, y: LEG_ROW0 + LEG_ROW_H * 7 - 2, dur: e.names - e.scroll + 0.2 },
  ];
  const ochre = rgba(C.tight, 0.9);
  const frameA = (1 - spread) * expoOut(seg(t, e.in, e.in + 0.5));
  const tick = (i: number) => smoother(seg(t, e.sweep + i * 0.065, e.sweep + i * 0.065 + 0.2)) * (1 - seg(t, e.rent - 0.2, e.rent));
  return (
    <>
      {frameA > 0 ? (
        <div style={frameBox(LEG_WIN.w, LEG_WIN.h, { left: LEG_WIN.x, top: LEG_WIN.y, opacity: frameA, transform: `scale(${1 - 0.06 * spread})` })}>
          {shots.map((sh, i) => {
            const next = shots[i + 1]?.at ?? Infinity;
            if (t < sh.at || t > next + 0.4) return null;
            return <PanView key={sh.f} t={t} src={A(sh.f)} imgW={LEG.w} imgH={LEG.h} k={1} w={LEG_WIN.w} h={LEG_WIN.h} keys={keys} opacity={i === 0 ? 1 : smoother(seg(t, sh.at, sh.at + 0.35))} />;
          })}
          <PanView t={t} imgW={LEG.w} imgH={LEG.h} k={1} w={LEG_WIN.w} h={LEG_WIN.h} keys={keys} opacity={1}>
            {(S) => (
              <>
                {/* «в обліковій системі» — заголовок окна учётной системы */}
                <Outline r={S({ x: 40, y: 72, w: 560, h: 34 })} p={smoother(seg(t, e.title, e.title + 0.4))} color={ochre} a={1 - seg(t, e.tabs - 0.3, e.tabs)} />
                {/* «тринадцять вкладок» — подчёркивание бежит по вкладкам за камерой */}
                {LEG_TABS.map(([x0, x1], i) => {
                  const p = tick(i);
                  if (p <= 0) return null;
                  const r = S({ x: x0, y: 505, w: x1 - x0, h: 0 });
                  return <div key={i} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w * p, height: 4, borderRadius: 2, background: C.tight }} />;
                })}
                {/* «ставка» — порядок изменения оплаты свободным текстом */}
                <Outline r={S({ x: 83, y: 672, w: 1405, h: 68 })} p={smoother(seg(t, e.rate, e.rate + 0.4))} color={ochre} a={1 - seg(t, e.legal - 0.2, e.legal)} />
                {/* «юридичні умови» — оригиналы в физическом архиве: № коробки 79 · № папки 637 */}
                <Outline r={S({ x: 60, y: 636, w: 780, h: 40 })} p={smoother(seg(t, e.box, e.box + 0.4))} color={ochre} a={1 - seg(t, e.files - 0.2, e.files)} />
                {/* «додаткова угода» — смысл документа только в названии файла */}
                <Outline r={S({ x: 752, y: LEG_ROW0 + LEG_ROW_H * 3, w: 890, h: LEG_ROW_H })} p={smoother(seg(t, e.du, e.du + 0.4))} color={ochre} a={1 - seg(t, e.names - 0.2, e.names)} />
                {/* «лише з назви файлу» — весь столбец названий */}
                <Outline r={S({ x: 752, y: LEG_ROW0 + LEG_ROW_H * 7, w: 890, h: LEG_ROW_H * 18 })} p={smoother(seg(t, e.names, e.names + 0.5))} color={ochre} />
              </>
            )}
          </PanView>
        </div>
      ) : null}
      {/* «Цілої картини з цього не скласти»: четыре экрана расходятся плоскими карточками и не соединяются */}
      {spread > 0
        ? THUMBS.map((th, i) => {
            const u = smoother(seg(t, e.spread + i * 0.08, e.spread + i * 0.08 + 0.9));
            const v = smoother(seg(t, DEAD.at, DEAD.at + 0.9)); // уходят к краям, открывая «мёртвую» схему
            const quad = { x: i % 2 === 0 ? 560 : 1360, y: i < 2 ? 380 : 700 };
            const cx = lerp(lerp(960, quad.x, u), th.x, v);
            const cy = lerp(lerp(544, quad.y, u), th.y, v);
            const w = THUMB_W * lerp(lerp(1.4, 1, u), 0.6, v);
            const h = (w * LEG.h) / LEG.w;
            return (
              <div key={th.f} style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, opacity: u * (1 - 0.35 * v) * (1 - gone), border: `${BORDER.normal.width}px solid ${bcolor(BORDER.normal)}`, borderRadius: 6, overflow: 'hidden', background: C.paper }}>
                <Img src={A(th.f)} style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
            );
          })
        : null}
      {/* «ні нагадувань… ні аналітики»: 25 строк списка файлов отрываются и падают в «Скани» мёртвой схемы — ничего не течёт */}
      {Array.from({ length: 25 }, (_, i) => {
        const [f0, f1] = e.fall;
        const at = f0 + (i / 24) * (f1 - f0 - 0.7);
        const u = seg(t, at, at + 0.7);
        if (u <= 0 || u >= 1) return null;
        const g = u * u; // падение с ускорением
        const from = { x: THUMBS[1].x + jitter(i) * 120, y: THUMBS[1].y + 30 };
        const x = lerp(from.x, scansAt.x + jitter(i + 7) * 40, u);
        const y = lerp(from.y, scansAt.y, g);
        const sw = 190;
        const sh = (sw / 900) * LEG_ROW_H;
        return (
          <div key={i} style={{ position: 'absolute', left: x - sw / 2, top: y - sh / 2, width: sw, height: sh, overflow: 'hidden', opacity: (1 - seg(u, 0.8, 1)) * (1 - gone), transform: `rotate(${jitter(i + 3) * 10 * u}deg)`, boxShadow: `0 0 0 1px ${C.line2}`, background: C.paper }}>
            <Img src={A('legacy2-files.png')} style={{ position: 'absolute', left: 0, top: -i * sh, width: sw, height: (sw / 900) * 906, maxWidth: 'none' }} />
          </div>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------- Скани: 25 названий файлов → стопка сканов
const LIST_K = 0.92; // шрифт списка ≈ 22 px картинки → ≈ 20 px на кадре
const ScansPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.scans.b3a;
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
/** Список причин под вырезками: ниже самой высокой вырезки (30 + 242 px) с запасом. */
const CAUSE_Y = 300;
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
            {/* решение Олега (031/032): причина держится не меньше чем до следующей вырезки. Реальные паузы озвучки 0.8–1.5 с
                короче времени чтения, поэтому причины копятся списком под вырезками и держатся до смены панели;
                текущая — охрой, прежние — серым */}
            <Caption id={`ocr.cause.${i}`} text={c.cause} x={0} y={CAUSE_Y + i * 36} a={appear} color={t < next ? C.tight : C.muted} />
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
        // красная строка отъезжает к правому краю (в сторону «Черги») и держится там до смены панели (решение Олега)
        const out = fail ? smoother(seg(t, e.out, e.out + 0.6)) : 0;
        const pop = expoOut(seg(t, at, at + 0.3));
        const b = fail ? BORDER.conflict : done ? BORDER.human : BORDER.normal;
        return (
          <div key={r} style={{ position: 'absolute', left: 60 + out * 180, top: 24 + i * 108, width: 760, height: 84, opacity: 1, boxSizing: 'border-box', borderRadius: 8, border: `${b.width}px solid ${bcolor(b)}`, background: fail ? rgba(C.crit, 0.06) : C.paper, display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
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

// ---------------------------------------------------------------- Розбір ланцюга: шкала «Чинна редакція на дату» (doc1)
/** Три редакции: 05.12.2013 → 24 700, 01.03.2015 → 43 155, 01.09.2015 → 48 355 (NUMBERS_CHECK стр. 9) — кадры стенда. */
const ChainPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.chain;
  const k = STAND_K;
  const st = e.states;
  const idx = t >= st[2] ? 2 : t >= st[1] ? 1 : 0;
  const scaleH = GEO.chain[0].scale.h * k;
  const vw = CONTENT.w / k;
  const btnX = (i: number) => clamp(GEO.chain[i].scale.btn.x - vw * 0.42, 0, GEO.chain[i].scale.w - vw);
  const keys: Key[] = [{ at: 0, x: btnX(0), y: 0 }, { at: st[1], x: btnX(1), y: 0, dur: 0.7 }, { at: st[2], x: btnX(2), y: 0, dur: 0.7 }];
  const fade = (i: number) => (i === 0 ? 1 - smoother(seg(t, st[1], st[1] + 0.35)) : i === 1 ? smoother(seg(t, st[1], st[1] + 0.35)) * (1 - smoother(seg(t, st[2], st[2] + 0.35))) : smoother(seg(t, st[2], st[2] + 0.35)));
  const rateTop = scaleH + 28;
  const rateH = CONTENT.h - rateTop;
  return (
    <>
      <div style={frameBox(CONTENT.w, scaleH, { left: 0, top: 0 })}>
        {[0, 1, 2].map((i) =>
          fade(i) > 0 ? (
            <PanView key={i} t={t} src={A(`chain-scale-${i}.png`)} imgW={GEO.chain[i].scale.w} imgH={GEO.chain[i].scale.h} k={k} w={CONTENT.w} h={scaleH} keys={keys} opacity={fade(i)}>
              {(S) => <Outline r={S(GEO.chain[i].scale.btn)} p={smoother(seg(t, st[i], st[i] + 0.4))} color={rgba(C.tight, 0.9)} a={i === idx ? 1 : 0} />}
            </PanView>
          ) : null,
        )}
      </div>
      <div style={frameBox(CONTENT.w, rateH, { left: 0, top: rateTop })}>
        {[0, 1, 2].map((i) =>
          fade(i) > 0 ? (
            <PanView key={i} t={t} src={A(`chain-rate-${i}.png`)} imgW={GEO.chain[i].rate.w} imgH={GEO.chain[i].rate.h} k={k} w={CONTENT.w} h={rateH} keys={[{ at: 0, x: 0, y: 0 }]} opacity={fade(i)}>
              {(S) => <Outline r={S(GEO.chain[i].rate.value)} p={smoother(seg(t, Math.max(st[i], i === 2 ? e.rate : st[i]), Math.max(st[i], i === 2 ? e.rate : st[i]) + 0.4))} color={rgba(C.tight, 0.9)} width={3.5} />}
            </PanView>
          ) : null,
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------- Картка чинних умов: 6 полей, нитки к документам, площа тричі
/** Документы ланцюга doc1 (стенд: договір № 2 від 05.12.2013; допугоди № 1 — NUMBERS_CHECK стр. 9). */
const DOCS = ['Договір суборенди · 05.12.2013', 'Допугода № 1 · 01.03.2015', 'Допугода № 1 · 01.09.2015'];
/** Поле → документ-источник (стенд doc1: «Ставка чинна» — допугода від 01.09.2015 · стор. 6; остальные — договір). */
const FIELDS: { name: string; doc: number }[] = [
  { name: 'Ставка', doc: 2 },
  { name: 'Діє до', doc: 0 },
  { name: 'Останній день заяви', doc: 0 },
  { name: 'Площа', doc: 0 },
  { name: 'Комунальні', doc: 0 },
  { name: 'Орендодавець', doc: 0 },
];
const CardPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.card;
  // поля — колонка слева, документы — колонка справа; нитки выходят из правого края поля и входят в левый край документа
  // (ортогональные, по своим вертикальным дорожкам между колонками — не пересекают текст и карточки)
  const field = (i: number) => ({ x: 0, y: i * 72, w: 340, h: 60 });
  const doc = (j: number) => ({ x: 650, y: 20 + j * 150, w: 350, h: 100 });
  const area = smoother(seg(t, e.area, e.area + 0.5));
  const conflict = smoother(seg(t, e.conflict, e.conflict + 0.4)) * (1 - smoother(seg(t, e.resolve, e.resolve + 0.6)));
  const resolved = smoother(seg(t, e.resolve, e.resolve + 0.6));
  const ak = STAND_K;
  const aH = GEO.area.h * ak;
  // 032 п. 0.2: вырезка площади целиком — три значения, «підтверджено» и «БТІ відрізняється від договору»
  // (x 410…1430 картинки ≈ 714 px кадра); карточки полей 3–5 (под окном) сужаются, освобождая место слева
  const AREA_X0 = 410;
  const AREA_X1 = 1440;
  const aW = Math.ceil((AREA_X1 - AREA_X0) * ak);
  const aLeft = CONTENT.w - aW;
  const FIELD_NARROW = aLeft - 20;
  const entries = [0, 0, 0, 0, 0, 0];
  const entryIdx = FIELDS.map((f) => entries[f.doc]++);
  return (
    <>
      {FIELDS.map((f, i) => {
        const at = APPEAR[`field:${f.name}`] ?? Infinity;
        const a = expoOut(seg(t, at, at + 0.4));
        if (a <= 0) return null;
        const r0 = field(i);
        // поля под окном площади (строки 3–5) сужаются вместе с его появлением; подписи короткие и помещаются
        const r = i >= 3 ? { ...r0, w: lerp(r0.w, FIELD_NARROW, area) } : r0;
        const isArea = f.name === 'Площа';
        const b = isArea && conflict > 0 ? mixBorder(BORDER.normal, BORDER.conflict, conflict) : isArea && resolved > 0 ? mixBorder(BORDER.normal, BORDER.human, resolved) : BORDER.normal;
        return (
          <div key={f.name} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity: a, transform: `translateX(${(1 - a) * -10}px)`, boxSizing: 'border-box', border: `${b.width}px solid ${bcolor(b)}`, borderRadius: 8, background: C.paper, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: C.tight, flex: 'none' }} />
            <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 26, fontWeight: 400, color: C.ink, whiteSpace: 'nowrap' }}>
              <Readable id={`card.field.${i}`} text={f.name}>
                {f.name}
              </Readable>
            </div>
          </div>
        );
      })}
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: 1 - area }} width={CONTENT.w} height={CONTENT.h}>
        {FIELDS.map((f, i) => {
          const at = APPEAR[`field:${f.name}`] ?? Infinity;
          const p = smoother(seg(t, at + 0.2, at + 0.8));
          if (p <= 0) return null;
          const r = field(i);
          const d = doc(f.doc);
          const lane = 380 + i * 42;
          const ey = d.y + 18 + entryIdx[i] * 13;
          const pts: [number, number][] = [[r.x + r.w, r.y + r.h / 2], [lane, r.y + r.h / 2], [lane, ey], [d.x, ey]];
          return <path key={f.name} d={roundedPath(pts, 10)} pathLength={1} fill="none" stroke={rgba(C.tight, 0.9)} strokeWidth={2.6} strokeDasharray="1" strokeDashoffset={1 - p} />;
        })}
      </svg>
      {DOCS.map((name, j) => {
        const a = expoOut(seg(t, e.docs + j * 0.15, e.docs + j * 0.15 + 0.4)) * (1 - area);
        if (a <= 0) return null;
        const r = doc(j);
        return (
          <div key={name} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity: a, boxSizing: 'border-box', border: `${BORDER.normal.width}px solid ${bcolor(BORDER.normal)}`, borderRadius: 8, background: C.paper, display: 'flex', alignItems: 'center', padding: '0 18px' }}>
            <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 24, fontWeight: 400, color: C.ink, lineHeight: 1.25 }}>
              <Readable id={`card.doc.${j}`} text={name}>
                {name}
              </Readable>
            </div>
          </div>
        );
      })}
      {/* площа тричі (стенд ANC-0412): договір · план БТІ · ліцензія — «БТІ відрізняється від договору» → конфлікт */}
      {area > 0 ? (
        <div style={frameBox(aW, aH, { left: aLeft, top: 3 * 72 + 30, opacity: area, borderColor: bcolor(mixBorder(BORDER.normal, BORDER.conflict, conflict)) })}>
          <PanView t={t} src={A('card-area.png')} imgW={GEO.area.w} imgH={GEO.area.h} k={ak} w={aW} h={aH} keys={[{ at: 0, x: AREA_X0, y: 0 }]}>
            {(S) => (
              <>
                <Outline r={S(GEO.area.bti)} p={smoother(seg(t, e.conflict, e.conflict + 0.4))} color={resolved > 0.5 ? rgba(C.green, 0.9) : rgba(C.crit, 0.9)} width={3.5} />
                <Outline r={S(GEO.area.note)} p={smoother(seg(t, e.conflict + 0.9, e.conflict + 1.3))} color={resolved > 0.5 ? rgba(C.green, 0.9) : rgba(C.crit, 0.9)} />
              </>
            )}
          </PanView>
        </div>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- Строки: вікна → «Останній день заяви» → «Автопролонгація»
const DeadlinesPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.deadlines;
  const g = GEO.deadlines;
  const k = STAND_K;
  const vh = CONTENT.h / k;
  const rowY = (i: number) => clamp(g.rows[i].y - 140, 0, g.h - vh);
  const vw = CONTENT.w / k;
  const windowsBox = { x: 40, y: 70, w: Math.min(vw - 80, 1300), h: 110 };
  // проезд вправо: от «Подія» к «Дата · Залишилось · Кому» (крупно не помещаются вместе с «Аптека»).
  // 032 п. 0.3: левый край кадра — по границе колонки «Дата» (названия событий кончаются раньше), без обрубков слов
  const colX = clamp(g.cols.date.x - 40, 0, g.w - vw);
  // заголовок группы «≤ 30 днів» — над первой строкой
  const groupBox = { x: 6, y: g.rows[0].y - 96, w: 620, h: 84 };
  const rowBox = (i: number) => ({ x: 6, y: g.rows[i].y + 6, w: g.cols.who.x + g.cols.who.w - 12, h: g.rows[i].h - 12 });
  return (
    <div style={frameBox(CONTENT.w, CONTENT.h, { left: 0, top: 0 })}>
      <PanView t={t} src={A('deadlines.png')} imgW={g.w} imgH={g.h} k={k} w={CONTENT.w} h={CONTENT.h} keys={[{ at: 0, x: 0, y: 0 }, { at: e.last - 0.5, x: 0, y: rowY(0), dur: 0.6 }, { at: e.last + 0.8, x: colX, y: rowY(0), dur: 0.7 }, { at: e.auto - 0.5, x: colX, y: rowY(2), dur: 0.6 }]}>
        {(S) => (
          <>
            <Outline r={S(windowsBox)} p={smoother(seg(t, e.windows, e.windows + 0.5))} color={rgba(C.tight, 0.9)} a={1 - seg(t, e.group - 0.3, e.group)} />
            <Outline r={S(groupBox)} p={smoother(seg(t, e.group, e.group + 0.5))} color={rgba(C.tight, 0.9)} a={1 - seg(t, e.last - 0.6, e.last - 0.3)} />
            <Outline r={S(rowBox(0))} p={smoother(seg(t, e.last, e.last + 0.5))} color={rgba(C.tight, 0.9)} a={1 - seg(t, e.auto - 0.6, e.auto - 0.3)} />
            <Outline r={S(rowBox(2))} p={smoother(seg(t, e.auto, e.auto + 0.5))} color={rgba(C.tight, 0.9)} />
          </>
        )}
      </PanView>
    </div>
  );
};

// ---------------------------------------------------------------- Відхилення від еталона: экран стенда → 4 твердження → вердикты
/** Умовний приклад из ответа архитектора (п. 6, не з реального договору); вердикты — иллюстрация четырёх видов. */
const CLAUSE = 'Орендар має право достроково розірвати договір в односторонньому порядку, письмово попередивши Орендодавця не пізніше ніж за 60 днів.';
const STATEMENTS: { text: string; verdict: string; tone: 'crit' | 'green' | 'ochre' | 'muted' }[] = [
  { text: 'Право ініціювати розірвання належить орендарю.', verdict: 'неприйнятно', tone: 'crit' },
  { text: 'Розірвання можливе без згоди орендодавця.', verdict: 'рівнозначно', tone: 'green' },
  { text: 'Попередження — письмове.', verdict: 'допустимо', tone: 'ochre' },
  { text: 'Строк попередження — не менше 60 днів.', verdict: 'не знайдено', tone: 'muted' },
];
const DeviationsPanel: React.FC<{ t: number }> = ({ t }) => {
  const e = EV.deviations;
  const g = GEO.deviations;
  const k = STAND_K;
  const split = smoother(seg(t, e.split, e.split + 0.5));
  const chip = g.chip;
  const n = GEO.deviationsNew;
  const fresh = smoother(seg(t, e.fresh, e.fresh + 0.4));
  // кадр строки п. 4.15: от «Назва» до конца «Позиція» (ширина окна 1000 / 0.7 ≈ 1428 px картинки)
  const [, name, , pos] = n.cells;
  // левый край — в отступе ячейки «Назва» (текст начинается ≈ +44 px), правый — после чипа «неприйнятне»
  const rowX = name.x + 24;
  const rowBox = { x: name.x + 32, y: n.row.y + 6, w: Math.min(pos.x + pos.w, rowX + CONTENT.w / k) - name.x - 48, h: n.row.h - 12 };
  // верх кадра — граница предыдущей строки (п. 3.3.2): обе строки целиком, ниже таблицы — бумага
  const rowTop = n.rows[n.rows.length - 2].y - 4;
  const toneC = { crit: C.crit, green: C.green, ochre: C.tight, muted: C.muted } as const;
  return (
    <>
      {split < 1 ? (
        <div style={frameBox(CONTENT.w, CONTENT.h, { left: 0, top: 0, opacity: 1 - split })}>
          {/* «і чинний» — старі договори, рамка на «18 відхилення» */}
          {fresh < 1 ? (
            <PanView t={t} src={A('deviations.png')} imgW={g.w} imgH={g.h} k={k} w={CONTENT.w} h={CONTENT.h} keys={[{ at: 0, x: 0, y: (g.tabsY ?? 260) - 16 }]} opacity={1 - fresh}>
              {(S) => (chip ? <Outline r={S(chip)} p={smoother(seg(t, e.current, e.current + 0.4))} color={rgba(C.tight, 0.9)} /> : null)}
            </PanView>
          ) : null}
          {/* «і новий на його бланку» — вкладка «Новий договір на бланку орендодавця» (проєкт від орендодавця, демо-приклад);
              «порівнює з типовим» — проезд к п. 4.15: пункт · що в проєкті · позиція (демо-счётчики крупно не берём) */}
          {fresh > 0 ? (
            <PanView t={t} src={A('deviations-new.png')} imgW={n.w} imgH={n.h} k={k} w={CONTENT.w} h={CONTENT.h} opacity={fresh} overscanY keys={[{ at: 0, x: 0, y: n.tab.y - 20 }, { at: e.compare - 0.2, x: rowX, y: rowTop, dur: 0.7 }]}>
              {(S) => (
                <>
                  <Outline r={S({ x: n.tab.x, y: n.tab.y, w: n.tab.w, h: n.tab.h })} p={smoother(seg(t, e.fresh + 0.2, e.fresh + 0.6))} color={rgba(C.tight, 0.9)} a={1 - seg(t, e.compare - 0.3, e.compare)} />
                  <Outline r={S(rowBox)} p={smoother(seg(t, e.compare + 0.5, e.compare + 0.9))} color={rgba(C.crit, 0.85)} />
                </>
              )}
            </PanView>
          ) : null}
        </div>
      ) : null}
      {split > 0 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: split }}>
          {/* пункт — контекст (фактура): длинная цитата не читается за время блока, читаются твердження */}
          <div {...TEXTURE_ATTR} style={{ position: 'absolute', left: 0, top: 0, width: CONTENT.w, fontFamily: TYPE.detail.fontFamily, fontSize: 24, lineHeight: 1.3, color: C.muted }}>
            «{CLAUSE}»
          </div>
          <Caption id="dev.note" text="умовний приклад" x={CONTENT.w - 190} y={CONTENT.h - 34} />
          {STATEMENTS.map((s, i) => {
            const at = e.split + 0.3 + i * 0.35;
            const a = expoOut(seg(t, at, at + 0.4));
            const vAt = e.verdicts + i * 0.2;
            const v = expoOut(seg(t, vAt, vAt + 0.35));
            const crit = i === 0 ? smoother(seg(t, e.critical, e.critical + 0.4)) : 0;
            // остальные строки чуть отступают (0.92 — выше порога читаемости 0.9): критична умова первой
            const dim = i === 0 ? 1 : 1 - 0.08 * smoother(seg(t, e.critical, e.critical + 0.4));
            const b = i === 0 ? mixBorder(BORDER.normal, BORDER.conflict, crit) : BORDER.normal;
            return (
              <div key={i} style={{ position: 'absolute', left: 0, top: 96 + i * 82, width: CONTENT.w, height: 70, overflow: 'hidden', opacity: a * dim, transform: `translateY(${(1 - a) * 10}px)`, boxSizing: 'border-box', border: `${b.width}px solid ${bcolor(b)}`, borderRadius: 8, background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
                {/* поиск твердження по всему договору: охровая полоса проходит по строке */}
                <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${smoother(seg(t, e.search + i * 0.3, e.search + i * 0.3 + 0.5)) * 100}%`, background: C.tight, opacity: 1 - smoother(seg(t, e.search + i * 0.3 + 0.6, e.search + i * 0.3 + 1.0)) }} />
                <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 26, fontWeight: 400, color: C.ink }}>
                  <Readable id={`dev.s.${i}`} text={s.text}>
                    {s.text}
                  </Readable>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {crit > 0 ? (
                    <div style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 24, color: C.crit, opacity: crit, whiteSpace: 'nowrap' }}>
                      <Readable id="dev.critical" text="критична умова">
                        критична умова
                      </Readable>
                    </div>
                  ) : null}
                  {v > 0 ? (
                    <div style={{ opacity: v, transform: `scale(${0.85 + 0.15 * v})`, fontFamily: TYPE.detail.fontFamily, fontSize: 24, color: toneC[s.tone], border: `2px solid ${rgba(toneC[s.tone], 0.8)}`, borderRadius: 18, padding: '2px 14px', whiteSpace: 'nowrap' }}>
                      <Readable id={`dev.v.${i}`} text={s.verdict}>
                        {s.verdict}
                      </Readable>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
};

export const PANEL_CONTENT: Record<string, React.FC<{ t: number }>> = { scans: ScansPanel, ocr: OcrPanel, read2: Read2Panel, code: CodePanel, queue: QueuePanel, chain: ChainPanel, card: CardPanel, deadlines: DeadlinesPanel, deviations: DeviationsPanel };

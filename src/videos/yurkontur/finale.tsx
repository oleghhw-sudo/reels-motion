// Блоки 5–6 (задача 032): «Ось увесь контур разом» и дорожная карта с локапом. Всё — функция времени t (гейт 1).
// Блок 5: 25 файлов блока 1 (столбец «Название файла» legacy_2) встают в цепочку и уходят в «Скани»; на «з доказом на скані» —
// нитка картка → скан; на «уся мережа в одному реєстрі» — вырезка реестра стенда #/contracts (только заголовок и колонки от
// «ТИП · СТАН»: без адресов, ФИО арендодателей и KPI демо). Бусина договора и конфлікт → Людина №2 — Scheme.tsx / layout.ts.
// Блок 6: этапы дорожной карты в зоне заголовка (на слова диктора), последняя нитка собирает локап.
import React from 'react';
import { expoOut, hash, lerp, seg, smoother, type Pt } from '../../motion/index.ts';
import { Readable } from '../../qa/Readable.tsx';
import { ZONE, type Cam } from './camera.ts';
import { along, roundedPath } from './geom.ts';
import { A, GEO, frameBox } from './panels.tsx';
import { LOOP_CHIPS, nodeById } from './schema.ts';
import { CONTRACT, DURATION, LOCKUP, STAGES, block } from './timeline.ts';
import { BORDER, C, TEXTURE_ATTR, TYPE, bcolor } from './tokens.ts';
import MUSIC from '../../../videos/yurkontur/music/candidates.json';

/** Атрибуция CC BY 3.0 выбранного трека (решение Олега 09.11) — строка из манифеста музыки. */
const CREDIT = MUSIC.chosen.credit;

const toS = (p: Pt, cam: Cam): Pt => [p[0] * cam.s + cam.ox, p[1] * cam.s + cam.oy];

// ---------------------------------------------------------------- блок 5: 25 файлов → цепочка → «Скани»
const FILES = 25;
const LEG2 = { w: 900, h: 906 } as const; // legacy2-files.png: столбец «Название файла», 25 строк
const ROW_H = LEG2.h / FILES;
const STRIP_W = 300;
const SK = STRIP_W / LEG2.w;
export const ContractFiles: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const t0 = CONTRACT.files;
  if (t < t0 || t > CONTRACT.from + 0.6) return null;
  const scans = nodeById('scans');
  const [sx, sy] = toS([scans.x, scans.y], cam);
  const chainX = sx + 40;
  const chainY0 = sy - 170;
  return (
    <div {...TEXTURE_ATTR} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: FILES }, (_, i) => {
        // разброс → цепочка (по порядку списка) → по одному в «Скани»
        const appear = expoOut(seg(t, t0 + i * 0.012, t0 + 0.35 + i * 0.012));
        const line = smoother(seg(t, t0 + 0.45, t0 + 1.0));
        const go0 = t0 + 1.05 + i * ((CONTRACT.from - t0 - 1.15) / FILES);
        const go = smoother(seg(t, go0, go0 + 0.35));
        const rx = 260 + hash(i * 7 + 1) * 1300;
        const ry = 250 + hash(i * 13 + 5) * 560;
        const cx = chainX + 200;
        const cy = chainY0 + i * 13;
        const x = lerp(lerp(rx, cx, line), sx, go);
        const y = lerp(lerp(ry, cy, line), sy, go);
        const sc = 1 - 0.7 * go;
        return (
          <div key={i} style={{ position: 'absolute', left: x - (STRIP_W * sc) / 2, top: y - (ROW_H * SK * sc) / 2, width: STRIP_W * sc, height: ROW_H * SK * sc, overflow: 'hidden', opacity: appear * (1 - seg(go, 0.85, 1)), background: C.paper, boxShadow: '0 1px 3px rgba(28,32,30,0.18)', transform: `rotate(${(1 - line) * (hash(i * 3) - 0.5) * 16}deg)` }}>
            <img src={A('legacy2-files.png')} style={{ position: 'absolute', left: 0, top: -i * ROW_H * SK * sc, width: LEG2.w * SK * sc, height: LEG2.h * SK * sc, maxWidth: 'none' }} />
          </div>
        );
      })}
    </div>
  );
};

/** «з доказом на скані»: охровая нитка от картки к «Скани» поверх потока (мир). */
export const ProofThread: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const p = smoother(seg(t, CONTRACT.proof, CONTRACT.proof + 0.6));
  const out = smoother(seg(t, CONTRACT.registry + 0.2, CONTRACT.registry + 0.6));
  if (p <= 0 || out >= 1) return null;
  const card = nodeById('card');
  const scans = nodeById('scans');
  const Y = 318;
  const pts: Pt[] = [toS([card.x - 40, card.y - card.h / 2], cam), toS([card.x - 40, Y], cam), toS([scans.x, Y], cam), toS([scans.x, scans.y - scans.h / 2], cam)];
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: 1 - out }} width={1920} height={1080}>
      <path d={roundedPath(pts, 14)} pathLength={1} fill="none" stroke={C.tight} strokeWidth={3} strokeDasharray="1" strokeDashoffset={1 - p} />
      {p > 0.02 && p < 1 ? <circle cx={along(pts, p)[0]} cy={along(pts, p)[1]} r={6} fill={C.tight} /> : null}
    </svg>
  );
};

/** «уся мережа в одному реєстрі»: окно реестра стенда — заголовок и таблица (колонки от «ТИП · СТАН»), медленный проезд вниз. */
const REG_WIN = { x: 340, y: 228, w: 1240, h: 640 } as const;
const HEAD_K = 0.62;
const TABLE_K = 0.5;
export const Registry: React.FC<{ t: number }> = ({ t }) => {
  // уход в две ступени (как у кадра-границы): окно гаснет на бумаге, затем бумага открывает механизм — тексты не накладываются
  const inA = expoOut(seg(t, CONTRACT.registry, CONTRACT.registry + 0.45));
  const a = inA * (1 - smoother(seg(t, CONTRACT.registryOut - 0.3, CONTRACT.registryOut)));
  const paperA = inA * (0.8 + 0.2 * smoother(seg(t, CONTRACT.registryOut - 0.45, CONTRACT.registryOut - 0.3))) * (1 - smoother(seg(t, CONTRACT.registryOut, CONTRACT.registryOut + 0.35)));
  if (paperA <= 0) return null;
  const head = GEO.contractsHead;
  const tbl = GEO.contractsTable;
  const headH = head.h * HEAD_K;
  const viewH = REG_WIN.h - headH - 40;
  const maxScroll = tbl.h * TABLE_K - viewH;
  const scroll = Math.min(maxScroll, 1100 * TABLE_K) * smoother(seg(t, CONTRACT.registry + 0.6, CONTRACT.registryOut));
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: C.paper, opacity: paperA }} />
      <div style={frameBox(REG_WIN.w, REG_WIN.h, { left: REG_WIN.x, top: REG_WIN.y, opacity: a, transform: `scale(${0.97 + 0.03 * a})`, borderRadius: BORDER.radius, border: `${BORDER.active.width}px solid ${bcolor(BORDER.active)}` })}>
        <img src={A('contracts-head.png')} style={{ position: 'absolute', left: 24, top: 20, width: head.w * HEAD_K, height: headH, maxWidth: 'none' }} />
        <div style={{ position: 'absolute', left: (REG_WIN.w - tbl.w * TABLE_K) / 2, top: headH + 34, width: tbl.w * TABLE_K, height: viewH, overflow: 'hidden', borderTop: `1.5px solid ${C.line}` }}>
          <img src={A('contracts-table.png')} style={{ position: 'absolute', left: 0, top: -scroll, width: tbl.w * TABLE_K, height: tbl.h * TABLE_K, maxWidth: 'none' }} />
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- блок 6: дорожная карта и локап
const ROAD_LABELS = ['еталон і калібровка', 'пілот на найгірших сканах', 'оцифрування всього корпусу', 'модуль в ALI'] as const;
/** Этапы — в зоне заголовка (заголовка у блока 6 нет): 4 отрезка, каждый загорается на свои слова. */
export const Roadmap: React.FC<{ t: number }> = ({ t }) => {
  const b6 = block('b6').from;
  const a = smoother(seg(t, b6 + 0.2, b6 + 0.8));
  if (a <= 0) return null;
  const W = (ZONE.work.x1 - ZONE.work.x0 - 3 * 24) / 4;
  return (
    <div style={{ position: 'absolute', left: ZONE.marginX, top: ZONE.title.y0 + 30, width: ZONE.work.x1 - ZONE.work.x0, height: 120, opacity: a }}>
      {ROAD_LABELS.map((l, i) => {
        const on = expoOut(seg(t, STAGES[i].at, STAGES[i].at + 0.45));
        return (
          <div key={l} style={{ position: 'absolute', left: i * (W + 24), top: 0, width: W }}>
            <div style={{ height: 4, background: C.line, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: 4, width: `${smoother(seg(t, STAGES[i].at - 0.1, STAGES[i].at + 0.5)) * 100}%`, background: i === 3 ? C.green : C.tight }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 12, opacity: 0.25 + 0.75 * on, transform: `translateY(${(1 - on) * 8}px)` }}>
              <span {...TEXTURE_ATTR} style={{ ...TYPE.chip, fontSize: 24, color: C.muted }}>
                0{i + 1}
              </span>
              <span style={{ fontFamily: TYPE.detail.fontFamily, fontSize: 28, lineHeight: 1.15, color: C.ink, width: W - 52 }} {...(on > 0.5 ? {} : TEXTURE_ATTR)}>
                {on > 0.5 ? (
                  <Readable id={`road.${i}`} text={l}>
                    {l}
                  </Readable>
                ) : (
                  l
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Последняя нитка: от станции «нова версія» петли (этап «модуль в ALI») вниз и через кадр — собирает локап. */
export const Lockup: React.FC<{ t: number; cam: Cam }> = ({ t, cam }) => {
  const dim = smoother(seg(t, LOCKUP.thread, LOCKUP.thread + 0.8));
  if (dim <= 0) return null;
  const Y = 640;
  const start = toS(LOOP_CHIPS[5], cam);
  const pts: Pt[] = [start, [start[0], Y], [1540, Y]];
  const p = smoother(seg(t, LOCKUP.thread, LOCKUP.text + 0.2));
  const txt = expoOut(seg(t, LOCKUP.text, LOCKUP.text + 0.6));
  const sub = expoOut(seg(t, LOCKUP.text + 0.1, LOCKUP.text + 0.6));
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: C.paper, opacity: 0.96 * dim }} />
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
        <path d={roundedPath(pts, 18)} pathLength={1} fill="none" stroke={C.green} strokeWidth={3} strokeDasharray="1" strokeDashoffset={1 - p} />
        {p > 0.01 && p < 0.999 ? <circle cx={along(pts, p)[0]} cy={along(pts, p)[1]} r={7} fill={C.tight} /> : null}
      </svg>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: 470, textAlign: 'center', opacity: txt, transform: `translateY(${(1 - txt) * 14}px)`, ...TYPE.title, fontSize: 96 }}>
        <Readable id="lockup.title" text="Юридичний контур АНЦ">
          Юридичний контур АНЦ
        </Readable>
      </div>
      <div style={{ position: 'absolute', left: 0, width: 1920, top: Y + 28, textAlign: 'center', opacity: sub, transform: `translateY(${(1 - sub) * 10}px)`, fontFamily: TYPE.detail.fontFamily, fontSize: 40, color: C.muted }}>
        <Readable id="lockup.sub" text="модуль до ANC Layout Intelligence">
          модуль до ANC Layout Intelligence
        </Readable>
      </div>
    </>
  );
};

/** Атрибуция музыки CC BY 3.0 (решение Олега 09.11): последние 3 с ролика, Inter Regular 20 px, --muted, правый нижний угол
 *  в пределах полей 6 %. Рисуется последним слоем — поверх бумажной подложки зоны субтитров. */
export const MusicCredit: React.FC<{ t: number }> = ({ t }) =>
  t >= DURATION - 3 ? (
    <div style={{ position: 'absolute', right: 1920 - ZONE.work.x1, bottom: 1080 - 1012, opacity: smoother(seg(t, DURATION - 3, DURATION - 2.7)), fontFamily: TYPE.detail.fontFamily, fontWeight: 400, fontSize: 20, lineHeight: 1.2, color: C.muted, whiteSpace: 'nowrap' }}>
      <Readable id="credit.music" text={CREDIT} credit>
        {CREDIT}
      </Readable>
    </div>
  ) : null;

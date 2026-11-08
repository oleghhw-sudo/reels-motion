// Раскладка карточек узлов в экранных координатах — одна чистая функция времени для кадра (Scheme.tsx) и для проверки
// скачков (jumps.test.ts). Мировой режим (камера) и сцена панелей смешиваются непрерывно; всё, что меняет вид карточки
// (позиция, размер, раскрытость, размер названия, видимость текста, обводка), — непрерывная функция t, без порогов.
import { clamp, expoOut, seg, smoother } from '../../motion/index.ts';
import { camAt, ZONE, type Cam } from './camera.ts';
import { along } from './geom.ts';
import { CONTRACT_HUMAN_K, CONTRACT_ROUTE, NODES, type Node } from './schema.ts';
import { EV, stageMix, stageRectOf, STAGE_MOVE, type Rect } from './stage.ts';
import { APPEAR, CONTRACT, DEAD, FLASH, STAGES, block } from './timeline.ts';

/** Мировой режим: название 20 px мира (≥ 32 px экрана при s ≥ 1.6), пояснение 18 px мира (≥ 24 px при s ≥ 1.34). */
export const WORLD_LABEL = 20;
export const WORLD_DETAIL = 18;
export const READ_S = Math.max(32 / WORLD_LABEL, 24 / WORLD_DETAIL);
/** Сцена панелей: название в карточке-соседе 32 px, в заголовке панели 36 px; пояснение 24 px. */
export const STAGE_LABEL = 32;
export const PANEL_LABEL = 36;
export const PANEL_DETAIL = 24;

export type Vis = { live: number; ghost: number; flash: number; fresh: number; dim: number };
export function visOf(id: string, t: number, ghostable: boolean): Vis {
  const at = APPEAR[id];
  const live = at === undefined || t < at ? 0 : expoOut(seg(t, at, at + 0.55));
  // призраки: «мёртвая» схема конца блока 1 (DEAD) и после вспышки блока 2 — непрерывно, без порога
  const ghost = ghostable ? smoother(seg(t, DEAD.at, DEAD.at + 0.8)) : 0;
  const flash = ghostable ? (t < FLASH.peak ? seg(t, FLASH.at, FLASH.peak) : 1 - smoother(seg(t, FLASH.peak, FLASH.ghostBy))) : 0;
  const fresh = at === undefined || t < at ? 0 : smoother(seg(t, at, at + 0.3)) * (1 - smoother(seg(t, at + 2.2, at + 3.2)));
  const b6 = block('b6').from;
  let dim = 1;
  if (t >= b6) {
    const stage = STAGES.find((s) => s.ids.includes(id) || (id.startsWith('chip:') && s.ids.includes('chips')));
    const down = smoother(seg(t, b6, b6 + 0.8));
    const up = stage ? smoother(seg(t, stage.at, stage.at + 0.6)) : 0;
    dim = 1 - 0.65 * down * (1 - up);
  }
  return { live, ghost, flash, fresh, dim };
}

/** Насколько прямоугольник мира в кадре: in — внутри рабочей зоны (1 — текст читаемый), shown — не задет краем кадра. */
export function frameAmt(x0: number, y0: number, x1: number, y1: number, cam: Cam): { inA: number; shownA: number } {
  const X0 = x0 * cam.s + cam.ox;
  const X1 = x1 * cam.s + cam.ox;
  const Y0 = y0 * cam.s + cam.oy;
  const Y1 = y1 * cam.s + cam.oy;
  const dc = Math.min(X0 - 4, 1916 - X1, Y0 - 4, 1076 - Y1);
  const dz = Math.min(X0 - (ZONE.marginX - 40), 1920 - ZONE.marginX + 40 - X1, Y0 - ZONE.title.y1, ZONE.subs.y0 - Y1);
  // полосы по 60 px: при проезде камеры текст гаснет/проявляется за несколько кадров, а не в один
  return { shownA: clamp((dc + 30) / 60), inA: clamp((dz + 30) / 60) };
}

export type CardLayout = {
  n: Node;
  rect: Rect;
  open: number;
  labelPx: number;
  detailPx: number;
  /** видимость текста: 0 — нет (задет краем кадра), 1 — есть */
  textA: number;
  /** читаемость названия: 0 — фактура (40 %), 1 — читаемый */
  readA: number;
  detailA: number;
  opacity: number;
  active: number;
  conflict: number;
  greenFill: number;
  z: number;
  /** видимость карточки целиком (для проверки скачков) и «живость» (появилась ли) */
  vis: number;
  live: number;
};

/** Договор блока 5 (бусина на маршруте) — для подсветки узлов и конфликта. */
export function contractAt(t: number): { on: boolean; k: number; pos: [number, number]; conflict: number; hot: string | null } {
  const b5 = t >= block('b5').from && t < block('b6').from;
  const k = smoother(seg(t, CONTRACT.from, CONTRACT.to));
  const on = b5 && t >= CONTRACT.from;
  const pos = along(CONTRACT_ROUTE, k);
  const conflict = on ? clamp(1 - Math.abs(k - CONTRACT_HUMAN_K) / 0.05) : 0;
  const hot = on ? NODES.find((n) => Math.abs(pos[0] - n.x) <= n.w / 2 && Math.abs(pos[1] - n.y) <= n.h / 2)?.id ?? null : null;
  return { on, k, pos, conflict, hot };
}

export function cardLayout(t: number, opts: { move?: number; humanFillAt?: number } = {}): CardLayout[] {
  const move = opts.move ?? STAGE_MOVE;
  const cam = camAt(t);
  const s = cam.s;
  const mix = stageMix(t, move);
  const ct = contractAt(t);
  const readS = smoother(seg(s, READ_S - 0.3, READ_S));
  return NODES.map((n) => {
    const wr: Rect = { x: (n.x - n.w / 2) * s + cam.ox, y: (n.y - n.h / 2) * s + cam.oy, w: n.w * s, h: n.h * s };
    const fa = frameAmt(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2, cam);
    const st = mix > 0 ? stageRectOf(n.id, t, move) : null;
    const m = st ? mix : 0;
    const L = (a: number, b: number) => a + (b - a) * m;
    const rect: Rect = st ? { x: L(wr.x, st.rect.x), y: L(wr.y, st.rect.y), w: L(wr.w, st.rect.w), h: L(wr.h, st.rect.h) } : wr;
    const stOpen = st ? st.open : 0;
    const labelPx = L(WORLD_LABEL * s, STAGE_LABEL + (PANEL_LABEL - STAGE_LABEL) * stOpen);
    const detailPx = L(WORLD_DETAIL * s, PANEL_DETAIL);
    const worldRead = readS * fa.inA;
    const readA = L(worldRead, st ? st.shown : 0);
    const textA = L(fa.shownA, 1);
    const detailA = L(worldRead, smoother(seg(stOpen, 0.5, 0.9)));
    // уходящая за кадр карточка гаснет быстрее, чем уезжает (shown³): текст не задерживается у края поля
    const opacity = mix > 0 && !st ? 1 - mix : st ? L(1, st.shown ** 3) : 1;
    const v = visOf(n.id, t, true);
    const active = L(Math.max(v.fresh, ct.hot === n.id ? 1 : 0), Math.max(stOpen, v.fresh));
    const fillAt = opts.humanFillAt;
    const greenFill = n.id === 'human1' && fillAt !== undefined ? smoother(seg(t, fillAt, fillAt + 0.6)) * (1 - smoother(seg(t, block('b3b').from + 0.6, block('b3b').from + 1.4))) : 0;
    return { n, rect, open: stOpen * m, labelPx, detailPx, textA, readA, detailA, opacity, active, conflict: n.id === 'human2' ? Math.max(ct.conflict, smoother(seg(t, EV.card.conflict, EV.card.conflict + 0.4)) * (1 - smoother(seg(t, EV.card.resolve, EV.card.resolve + 0.6)))) : 0, greenFill, z: stOpen > 0.1 ? 2 : 1, vis: Math.max(v.live, v.ghost * (0.5 + 0.5 * v.flash)) * v.dim * opacity, live: v.live };
  });
}

// Типизированный доступ к данным пакета (копии в ./data, их кладёт videos/agent-terminal/prepare-assets.mjs).
// Разрешённые источники чисел (задача 020, решение 4): results.json, scale.json, real_examples.json, stats.json,
// frames/OXX/geometry.json, truth.json. Все строки с числами на экране — ТОЛЬКО из реестра screenNumbers():
// компоненты не форматируют числа сами, тест numbers.test.ts сверяет реестр с json независимо.
import geomO02 from './data/geometry-O02.json' with { type: 'json' };
import geomO07 from './data/geometry-O07.json' with { type: 'json' };
import realExamples from './data/real_examples.json' with { type: 'json' };
import results from './data/results.json' with { type: 'json' };
import scale from './data/scale.json' with { type: 'json' };
import stats from './data/stats.json' with { type: 'json' };
import truth from './data/truth.json' with { type: 'json' };
import { area, areaBare, int, metres, pctInt, pctSigned, px, share } from './format.ts';

// ---------------------------------------------------------------- типы пакета
export type Pt = readonly [number, number];
export type Ring = readonly Pt[];
export type Route = 'чернетка' | 'до людини';
export type Check = { label: string; value_m: number; span_px: number; measured_m: number; err_pct: number } | { label: string; failed: true } | null;
export type ResultRow = {
  id: string;
  name: string;
  area: number | null;
  truth: number | null;
  err: number | null;
  route: Route;
  reasons: string[];
  check: Check;
};
export type ScaleLine = { label: string; value_m: number; axis: 'h' | 'v'; at: number; seed: number };
export type ScaleEntry = { primary: ScaleLine; check: ScaleLine };
export type Geometry = {
  object: string;
  walls: { thin_px: number; thick_px: number };
  scale: { value_m: number; seg: readonly [Pt, Pt]; check: { value_m: number; seg: readonly [Pt, Pt]; measured_m: number; err_pct: number } };
  outline: { vertices: number; polygon_px: Ring; area_m2: number };
  rooms: { id: number; area_m2: number; polygon_px: Ring; centroid_px: Pt }[];
  crop: readonly [number, number, number, number];
  checks: { c_rooms: { label: string; truth_m2: number; room_id: number | null }[] };
};
export type TruthEntry = { total_m2: number | null; rooms: { label: string; m2: number }[] };
export type ZoneList = readonly (readonly [string, readonly Ring[]])[];
export type Sumy = { title: string; S: number; contour: readonly Ring[]; ent: Pt; truth: ZoneList; g2: ZoneList; G2: { acc: number } };
export type Stats = {
  zones_median_acc: { value: number; n: number };
  sumy: { bucket: string; S: number; target_shares: Record<string, number>; G2_acc: number; san_polygon_m: readonly Ring[] };
};
export type Pack = {
  results: ResultRow[];
  scale: Record<string, ScaleEntry>;
  real: { sumy: Sumy };
  stats: Stats;
  truth: Record<string, TruthEntry>;
  geometry: Record<string, Geometry>;
};

/** Ключ счётчика «Зони: збіг» в stats.json (решение Олега 1): медиана Г2-точка, n аптек. */
export const ZONES_MEDIAN_KEY = 'zones_median_acc' as const;
/** Страницы ролика: полный разбор, «система знає, коли не знає», и аптека плана зон. */
export const PAGE_FULL = 'O02';
export const PAGE_FAIL = 'O07';
export const SUMY_KEY = 'sumy';
/** Санвузел O02: комната экспликации с меткой «2» (truth.json), её id в geometry — через checks.c_rooms. */
export const O02_SAN_TRUTH_LABEL = '2';
/** Порядок зон на плане и в строке долей. */
export const ZONE_ORDER = ['trade_hall', 'sanitary', 'storage', 'staff_room'] as const;
export type ZoneId = (typeof ZONE_ORDER)[number];
const SHARE_LABEL: Record<ZoneId, string> = { trade_hall: 'зал', storage: 'склад', staff_room: 'персонал', sanitary: 'санвузол' };

export const PACK: Pack = {
  results: results as unknown as ResultRow[],
  scale: scale as unknown as Record<string, ScaleEntry>,
  real: realExamples as unknown as { sumy: Sumy },
  stats: stats as unknown as Stats,
  truth: truth as unknown as Record<string, TruthEntry>,
  geometry: { [PAGE_FULL]: geomO02 as unknown as Geometry, [PAGE_FAIL]: geomO07 as unknown as Geometry },
};

// ---------------------------------------------------------------- страницы
export const pageIds = (p: Pack = PACK): string[] => p.results.map((r) => r.id);
export const row = (id: string, p: Pack = PACK): ResultRow => {
  const r = p.results.find((x) => x.id === id);
  if (!r) throw new Error(`results.json: нет страницы ${id}`);
  return r;
};
const measured = (c: Check): { value_m: number; measured_m: number; err_pct: number } => {
  if (!c || 'failed' in c) throw new Error('check без измерения');
  return c;
};
const need = <T,>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new Error(`нет значения: ${what}`);
  return v;
};

// ---------------------------------------------------------------- реестр строк с числами
export type ScreenNumbers = Record<string, string>;

/** Все строки с числами, которые видит зритель. Ключи стабильны — их проверяет numbers.test.ts. */
export function screenNumbersFrom(p: Pack): ScreenNumbers {
  const S: ScreenNumbers = {};
  const total = p.results.length;
  const draft = p.results.filter((r) => r.route === 'чернетка').length;
  const human = p.results.filter((r) => r.route === 'до людини').length;
  S['pages.total'] = int(total);
  S['counter.draft'] = int(draft);
  S['counter.human'] = int(human);
  S['start'] = `старт · ${int(total)} сторінок у черзі`;
  S['page.none'] = `— / ${int(total)}`;
  for (let n = 1; n <= total; n++) S[`page.${n}`] = `сторінка ${int(n)} / ${int(total)}`;

  const zm = p.stats[ZONES_MEDIAN_KEY];
  S['zones.median'] = pctInt(zm.value);
  S['zones.note'] = `медіана, ${int(zm.n)} аптек`;

  // O02 — полный разбор
  const g2 = p.geometry[PAGE_FULL];
  const r2 = row(PAGE_FULL, p);
  const c2 = measured(r2.check);
  S['o02.accept'] = `сторінка прийнята · ${r2.name}`;
  S['o02.walls'] = `стіни: перегородки ~${px(g2.walls.thin_px)} px, капітальні ~${px(g2.walls.thick_px)} px`;
  S['o02.outline'] = `контур знайдено · ${int(g2.outline.vertices)} вершин`;
  S['o02.scale.label'] = metres(p.scale[PAGE_FULL].primary.value_m);
  S['o02.scale.log'] = `масштаб: ${metres(p.scale[PAGE_FULL].primary.value_m)} з підпису на плані`;
  S['o02.check.label'] = metres(c2.value_m);
  S['o02.check.result'] = `виміряно ${metres(c2.measured_m)} · ${pctSigned(c2.err_pct)}`;
  S['o02.area'] = `площа ${area(need(r2.area, 'O02.area'))} · експлікація ${area(need(r2.truth, 'O02.truth'))} · ${pctSigned(need(r2.err, 'O02.err'))}`;
  const sanRoomId = need(g2.checks.c_rooms.find((c) => c.label === O02_SAN_TRUTH_LABEL)?.room_id, 'O02 c_rooms label 2');
  const sanRoom = need(g2.rooms.find((rm) => rm.id === sanRoomId), `O02 room ${sanRoomId}`);
  const sanTruth = need(p.truth[PAGE_FULL].rooms.find((rm) => rm.label === O02_SAN_TRUTH_LABEL), 'truth O02 label 2');
  S['o02.san'] = `с/у: ${area(sanRoom.area_m2)} проти ${areaBare(sanTruth.m2)} — сантехніка дробить приміщення · позначено`;

  // чипы и строки быстрого прогона — по всем страницам
  for (const r of p.results) {
    const ok = r.route === 'чернетка';
    S[`chip.${r.id}`] = ok ? `✓ ${pctSigned(need(r.err, `${r.id}.err`))}` : 'до людини';
    const tail = ok ? S[`chip.${r.id}`] : need(r.reasons[0], `${r.id}.reasons[0]`);
    S[`pass.${r.id}`] = `${r.name} · ${r.route} · ${tail}`;
  }

  // O07 — провал проверки
  const r7 = row(PAGE_FAIL, p);
  const c7 = measured(r7.check);
  S['o07.accept'] = `сторінка прийнята · ${r7.name}`;
  S['o07.scale.label'] = metres(p.scale[PAGE_FAIL].primary.value_m);
  S['o07.scale.log'] = `масштаб: ${metres(p.scale[PAGE_FAIL].primary.value_m)} з підпису на плані`;
  S['o07.check.label'] = metres(c7.value_m);
  S['o07.check.result'] = `виміряно ${metres(c7.measured_m)} · ${pctSigned(c7.err_pct)}`;
  S['o07.area'] = `площа ${area(need(r7.area, 'O07.area'))} · експлікація ${area(need(r7.truth, 'O07.truth'))} · ${pctSigned(need(r7.err, 'O07.err'))}`;

  // Суми — зоны
  const sumy = p.real[SUMY_KEY];
  const st = p.stats[SUMY_KEY];
  S['sumy.title'] = `${sumy.title} · ${area(sumy.S)}`;
  S['sumy.shares.log'] = `частки мережі для ${st.bucket} м²`;
  S['sumy.shares'] = ZONE_ORDER.map((z) => `${SHARE_LABEL[z]} ${share(need(st.target_shares[z], `target_shares.${z}`))}`).join(' · ');
  S['sumy.truth'] = `звірка з креслярем: збіг ${pctInt(sumy.G2.acc)} площі`;

  // финал: «2», «11», «9» — из results.json (route)
  S['final'] = `${int(draft)} з ${int(total)} сторінок — чернетка автоматично · ${int(human)} — до людини з причиною · жодна хибна не пройшла`;
  return S;
}

let cache: ScreenNumbers | null = null;
export const screenNumbers = (): ScreenNumbers => (cache ??= screenNumbersFrom(PACK));

// ---------------------------------------------------------------- геометрия полотна (кадры после crop)
/** Размер кадра страницы после crop (geometry.crop = [x0, y0, x1, y1]). */
export const frameSize = (id: string, p: Pack = PACK): { w: number; h: number } => {
  const [x0, y0, x1, y1] = p.geometry[id].crop;
  return { w: x1 - x0, h: y1 - y0 };
};
const uncrop = (pt: Pt, crop: readonly [number, number, number, number]): [number, number] => [pt[0] - crop[0], pt[1] - crop[1]];
/** Линия масштаба (primary) или проверки (check) в px кадра после crop. */
export const segOnFrame = (id: string, which: 'primary' | 'check', p: Pack = PACK): [[number, number], [number, number]] => {
  const g = p.geometry[id];
  const seg = which === 'primary' ? g.scale.seg : g.scale.check.seg;
  return [uncrop(seg[0], g.crop), uncrop(seg[1], g.crop)];
};
/** Контур outline.polygon_px в px кадра после crop. */
export const outlineOnFrame = (id: string, p: Pack = PACK): [number, number][] => {
  const g = p.geometry[id];
  return g.outline.polygon_px.map((pt) => uncrop(pt, g.crop));
};
/** Полигон комнаты-санузла O02 (rooms[id ← c_rooms label «2»]) в px кадра после crop. */
export const sanRoomOnFrame = (p: Pack = PACK): [number, number][] => {
  const g = p.geometry[PAGE_FULL];
  const id = need(g.checks.c_rooms.find((c) => c.label === O02_SAN_TRUTH_LABEL)?.room_id, 'O02 c_rooms label 2');
  const rm = need(g.rooms.find((r) => r.id === id), `O02 room ${id}`);
  return rm.polygon_px.map((pt) => uncrop(pt, g.crop));
};

// ---------------------------------------------------------------- план Сум: метры → экран
export type PlanMap = {
  /** Поворот плана на бумаге (градусы, против часовой) до перевода на экран (ось y вниз). Без зеркала. */
  theta: 0 | 90 | 180 | 270;
  /** px на метр. */
  s: number;
  map: (pt: Pt) => [number, number];
  ent: [number, number];
  centroid: [number, number];
  /** Фасад = стена с входом: y на экране (низ плана). */
  facadeY: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

const polyCentroid = (ring: Ring): [number, number] => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) throw new Error('контур вырожден');
  return [cx / (3 * a), cy / (3 * a)];
};
const rot = (theta: number, [x, y]: Pt): [number, number] => {
  const r = (theta * Math.PI) / 180;
  const c = Math.round(Math.cos(r));
  const sn = Math.round(Math.sin(r));
  return [c * x - sn * y, sn * x + c * y];
};

/**
 * Преобразование метров плана в px области box: поворот (0/90/180/270) + равномерный масштаб, без зеркала;
 * поворот выбирается так, чтобы вход ent оказался НИЖЕ центроида контура на экране (как можно ниже).
 */
export function planMap(box: { x: number; y: number; w: number; h: number }, p: Pack = PACK): PlanMap {
  const sumy = p.real[SUMY_KEY];
  const ring = sumy.contour[0];
  const centroidM = polyCentroid(ring);
  // кандидат: paper (x, y) → rot(theta) → экран (x, −y)
  const cand = ([0, 90, 180, 270] as const).map((theta) => {
    const toScreen = (pt: Pt): [number, number] => {
      const [x, y] = rot(theta, pt);
      return [x, -y];
    };
    const e = toScreen(sumy.ent);
    const c = toScreen(centroidM);
    return { theta, toScreen, below: e[1] - c[1] };
  });
  const best = cand.reduce((a, b) => (b.below > a.below ? b : a));
  const pts = ring.map(best.toScreen);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const mx0 = Math.min(...xs);
  const mx1 = Math.max(...xs);
  const my0 = Math.min(...ys);
  const my1 = Math.max(...ys);
  const s = Math.min(box.w / (mx1 - mx0), box.h / (my1 - my0));
  const ox = box.x + (box.w - (mx1 - mx0) * s) / 2 - mx0 * s;
  const oy = box.y + (box.h - (my1 - my0) * s) / 2 - my0 * s;
  const map = (pt: Pt): [number, number] => {
    const [x, y] = best.toScreen(pt);
    return [ox + x * s, oy + y * s];
  };
  return {
    theta: best.theta,
    s,
    map,
    ent: map(sumy.ent),
    centroid: map(centroidM),
    facadeY: oy + my1 * s,
    bbox: { x0: ox + mx0 * s, y0: oy + my0 * s, x1: ox + mx1 * s, y1: oy + my1 * s },
  };
}

/** Зоны списка (g2 / truth) как кольца в метрах по ключу. */
export const zoneRings = (list: ZoneList, zone: string): readonly Ring[] => list.filter(([k]) => k === zone).flatMap(([, polys]) => polys);

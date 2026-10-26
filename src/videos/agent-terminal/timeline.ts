// Таймлайн ролика в кадрах (30 fps, 960 кадров) — задача 020, таблица «Таймлайн». Сцены читают тайминги ТОЛЬКО отсюда.
// Всё — функция номера кадра (гейт 1). Строки с числами — из реестра screenNumbers() (data.ts), здесь только их ключи.
import { PACK, PAGE_FAIL, PAGE_FULL, ZONE_ORDER, type Route, type ScreenNumbers, type ZoneId } from './data.ts';

export const FPS = 30;
export const FRAMES = 960;

/** Опорные кадры (с → кадры при 30 fps, как в таблице задачи). */
export const T = {
  start: 0,
  o02: { accept: 60, marks: 93, walls: 108, outline: 144, scale: 192, check: 225, area: 252, san: 282, drafter: 300 },
  pass: { from: 330, step: 10, to: 420 },
  o07: { mark: 420, outline: 444, scale: 465, check: 486, area: 519, stamp: 540 },
  sumy: { plan: 570, san: 588, zones: 618, zoneStep: 21, truth: 702, truthLog: 714, drafter: 780 },
  finale: 840,
  reset: 924,
  end: 960,
} as const;

/** Порядок быстрого прогона (O02 и O07 — отдельными сценами). */
export const PASS_ORDER = ['O01', 'O03', 'O04', 'O05', 'O06', 'O08', 'O09', 'O10', 'O11'] as const;
export const passFrame = (i: number): number => T.pass.from + i * T.pass.step;

// ---------------------------------------------------------------- модули
export type ModuleId = 'accept' | 'marks' | 'walls' | 'outline' | 'scale' | 'check' | 'zones' | 'drafter';
export const MODULES: readonly { id: ModuleId; name: string; hint: string }[] = [
  { id: 'accept', name: 'ПРИЙОМ', hint: 'скан сторінки' },
  { id: 'marks', name: 'ПОЗНАЧКИ', hint: 'позначка менеджера' },
  { id: 'walls', name: 'СТІНИ', hint: 'товщина ліній' },
  { id: 'outline', name: 'КОНТУР', hint: 'периметр приміщення' },
  { id: 'scale', name: 'МАСШТАБ', hint: 'підпис розміру' },
  { id: 'check', name: 'ПЕРЕВІРКА', hint: 'розмір · площа' },
  { id: 'zones', name: 'ЗОНИ', hint: 'частки мережі' },
  { id: 'drafter', name: 'КРЕСЛЯР', hint: 'маршрут сторінки' },
];

/** Активный модуль в кадре f (null — никакой). */
export function activeModule(f: number): ModuleId | null {
  if (f < T.o02.accept || f >= T.finale) return null;
  if (f < T.o02.marks) return 'accept';
  if (f < T.o02.walls) return 'marks';
  if (f < T.o02.outline) return 'walls';
  if (f < T.o02.scale) return 'outline';
  if (f < T.o02.check) return 'scale';
  if (f < T.o02.drafter) return 'check';
  if (f < T.pass.to) return 'drafter';
  if (f < T.o07.outline) return 'marks';
  if (f < T.o07.scale) return 'outline';
  if (f < T.o07.check) return 'scale';
  if (f < T.o07.stamp) return 'check';
  if (f < T.sumy.plan) return 'drafter';
  if (f < T.sumy.drafter) return 'zones';
  return 'drafter';
}
/** ПЕРЕВІРКА мигает бурштином при провале O07. */
export const checkFailing = (f: number): boolean => f >= T.o07.check && f < T.o07.stamp;
/** Статус модуля: очікує / працює / готово / провал. */
export function moduleStatus(f: number, id: ModuleId): 'wait' | 'run' | 'done' | 'fail' {
  if (f >= T.reset) return 'wait';
  if (activeModule(f) === id) return id === 'check' && checkFailing(f) ? 'fail' : 'run';
  if (id === 'check' && f >= T.o07.stamp && f < T.finale) return 'fail';
  const firstOn: Record<ModuleId, number> = { accept: T.o02.accept, marks: T.o02.marks, walls: T.o02.walls, outline: T.o02.outline, scale: T.o02.scale, check: T.o02.check, zones: T.sumy.plan, drafter: T.o02.drafter };
  return f >= firstOn[id] ? 'done' : 'wait';
}

// ---------------------------------------------------------------- страницы и счётчики
/** Кадр, в котором страница получила маршрут (чип в очереди, счётчик в шапке). */
export function doneFrame(id: string): number {
  if (id === PAGE_FULL) return T.o02.drafter;
  if (id === PAGE_FAIL) return T.o07.stamp;
  const i = PASS_ORDER.indexOf(id as (typeof PASS_ORDER)[number]);
  if (i < 0) throw new Error(`timeline: страница ${id} не в порядке прогона`);
  return passFrame(i);
}
/** Кадр начала обработки страницы (подсветка карточки). */
export function startFrame(id: string): number {
  if (id === PAGE_FULL) return T.o02.accept;
  if (id === PAGE_FAIL) return T.o07.mark;
  return doneFrame(id);
}
/** Порядковый номер обработки 1..11 (для «сторінка N / 11»). */
export function processingOrder(): string[] {
  return [PAGE_FULL, ...PASS_ORDER, PAGE_FAIL];
}
/** Страница, обрабатываемая в кадре f: null до старта и после отката; 'sumy' — сцена плана зон. */
export function pageAt(f: number): { id: string; n: number } | 'sumy' | null {
  if (f < T.o02.accept || f >= T.reset) return null;
  if (f >= T.sumy.plan && f < T.finale) return 'sumy';
  const order = processingOrder();
  if (f >= T.finale) return { id: PAGE_FAIL, n: order.length };
  if (f < T.pass.from) return { id: PAGE_FULL, n: 1 };
  if (f >= T.o07.mark) return { id: PAGE_FAIL, n: order.length };
  const i = Math.min(PASS_ORDER.length - 1, Math.floor((f - T.pass.from) / T.pass.step));
  return { id: PASS_ORDER[i], n: i + 2 };
}
/** Сколько страниц с маршрутом route получили его к кадру f; last — кадр последнего изменения (для «пинка»). */
export function routeCount(f: number, route: Route): { n: number; last: number | null } {
  let n = 0;
  let last: number | null = null;
  for (const r of PACK.results) {
    if (r.route !== route) continue;
    const d = doneFrame(r.id);
    if (d <= f) {
      n++;
      last = last === null ? d : Math.max(last, d);
    }
  }
  return { n, last };
}
/** «Зони: збіг» показан (65 %) с кадра truthLog до отката. */
export const zonesShown = (f: number): boolean => f >= T.sumy.truthLog && f < T.reset;

// ---------------------------------------------------------------- зоны Сум
export const zoneFrame = (z: ZoneId): number => T.sumy.zones + ZONE_ORDER.indexOf(z) * T.sumy.zoneStep;

// ---------------------------------------------------------------- лог
export type Tone = 'text' | 'teal' | 'amber' | 'muted';
export type LogEvent = { at: number; text: string; tone: Tone; key: string };

/** Строки лога по кадрам. Тексты с числами — из реестра S. */
export function logEvents(S: ScreenNumbers): LogEvent[] {
  const ev: LogEvent[] = [];
  const add = (at: number, key: string, text: string, tone: Tone = 'text') => ev.push({ at, key, text, tone });
  add(6, 'start', S['start'], 'muted');
  add(T.o02.accept, 'o02.accept', S['o02.accept']);
  add(T.o02.marks, 'o02.marks', 'позначки менеджера немає → уся сторінка = приміщення', 'muted');
  add(T.o02.walls, 'o02.walls', S['o02.walls']);
  add(T.o02.outline, 'o02.outline', S['o02.outline']);
  add(T.o02.scale, 'o02.scale', S['o02.scale.log']);
  add(T.o02.check, 'o02.check', `${S['o02.check.label']} → ${S['o02.check.result']} ✓`, 'teal');
  add(T.o02.area, 'o02.area', `${S['o02.area']} ✓`, 'teal');
  add(T.o02.san, 'o02.san', S['o02.san'], 'amber');
  add(T.o02.drafter, 'o02.route', `чернетка автоматично · ${S[`chip.${PAGE_FULL}`]}`, 'teal');
  PASS_ORDER.forEach((id, i) => add(passFrame(i), `pass.${id}`, S[`pass.${id}`], PACK.results.find((r) => r.id === id)?.route === 'чернетка' ? 'teal' : 'amber'));
  add(T.o07.mark, 'o07.accept', `${S['o07.accept']} · позначка менеджера: обвід`);
  add(T.o07.outline, 'o07.outline', 'контур знайдено', 'muted');
  add(T.o07.scale, 'o07.scale', S['o07.scale.log']);
  add(T.o07.check, 'o07.check', `${S['o07.check.label']} → ${S['o07.check.result']} ✗`, 'amber');
  add(T.o07.area, 'o07.area', `${S['o07.area']} ✗`, 'amber');
  add(T.o07.stamp, 'o07.route', 'бліді стіни скану → масштаб ліг не на ту стіну · відправлено креслярці', 'amber');
  add(T.sumy.plan, 'sumy.title', `зони · ${S['sumy.title']}`);
  add(T.sumy.san, 'sumy.facade', 'фасад = стіна з входом', 'muted');
  add(T.sumy.san + 15, 'sumy.san', 'санвузол — з позначки менеджера (обвід С/У)', 'amber');
  add(T.sumy.zones, 'sumy.shares.log', S['sumy.shares.log']);
  add(T.sumy.zones + 14, 'sumy.shares', S['sumy.shares'], 'muted');
  add(zoneFrame('storage'), 'sumy.deep', 'склад і персонал — у глибині', 'muted');
  add(T.sumy.truthLog, 'sumy.truth', S['sumy.truth'], 'teal');
  add(T.sumy.drafter, 'sumy.route', 'чернетка → креслярці на перевірку', 'teal');
  return ev;
}

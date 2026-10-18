// Ported from Rieranthony/product-film-skill @fe11efc4 · MIT (c) 2026 Rieranthony — plugins/product-film/skills/product-film/templates/kit/spring.ts (step, track, critical)
// Ported from Barty-Bart/motion-graphics @3d83d98 · MIT (c) 2026 Bart — skills/motion-broll/engine/motion.js (ctrack, vis)
// Пружины замкнутой формой: значение — чистая функция времени t (секунды), сколько бы раз ни менялась цель (гейт 1).
// Изменения при переносе:
//   - ctrack мешает каналы в OKLab (cinetic color.ts), а не в sRGB, как у Barty-Bart; конфиг — SpringConfig, не [w, z];
//   - vis: кривая eo оригинала = cubicOut из ./index.ts; значения по умолчанию как в источнике.
// Тексты лицензий — THIRD-PARTY-LICENSES.md.
import { cubicOut } from './index.ts';
import { fromLab, toLab, type Lab } from './color.ts';

export type SpringConfig = {
  stiffness: number;
  damping: number;
  mass?: number;
  /** Обрезать перелёт сверху (значение ≤ 1). */
  clamp?: boolean;
};

/** Переходная функция затухающей пружины, отпущенной в t = 0: из 0 к 1 (недо-, критическое и передемпфирование). */
export function step(t: number, { stiffness, damping, mass = 1, clamp = false }: SpringConfig): number {
  if (t <= 0) return 0;
  const natural = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let value: number;
  if (zeta < 1) {
    const damped = natural * Math.sqrt(1 - zeta * zeta);
    value = 1 - Math.exp(-zeta * natural * t) * (Math.cos(damped * t) + ((zeta * natural) / damped) * Math.sin(damped * t));
  } else if (zeta === 1) {
    value = 1 - Math.exp(-natural * t) * (1 + natural * t);
  } else {
    const damped = natural * Math.sqrt(zeta * zeta - 1);
    value = 1 - Math.exp(-zeta * natural * t) * (Math.cosh(damped * t) + ((zeta * natural) / damped) * Math.sinh(damped * t));
  }
  return clamp ? Math.min(value, 1) : value;
}

/** Ключ: [время смены цели, с; новая цель]. Первый ключ задаёт начальное значение. Ключи — по возрастанию времени. */
export type Key = readonly [time: number, value: number];

/** Значение, которое меняет цель в каждом ключе: первое значение + по пружине на каждую смену. */
export function track(t: number, keys: readonly Key[], config: SpringConfig): number {
  let value = keys[0][1];
  for (let index = 1; index < keys.length; index++) {
    value += (keys[index][1] - keys[index - 1][1]) * step(t - keys[index][0], config);
  }
  return value;
}

/** Критически демпфированная пружина с заданным откликом (рад/с). */
export const critical = (response: number): SpringConfig => ({ stiffness: response * response, damping: 2 * response });

/** Цветовой ключ: [время, с; цвет hex или 'rgb(...)']. */
export type ColorKey = readonly [time: number, color: string];

/**
 * Цвет, который меняет цель в каждом ключе: track по каждому каналу OKLab (L, a, b), округление в sRGB — один раз.
 * Без перелёта (calm/firm/soft/heavy) на одной смене совпадает с mixColor(c0, c1, step(t)).
 */
export function ctrack(t: number, keys: readonly ColorKey[], config: SpringConfig): string {
  const labs = keys.map(([, c]) => toLab(c));
  const ch = [0, 1, 2].map((i) => track(t, keys.map(([time], k) => [time, labs[k][i]] as const), config)) as Lab;
  const [r, g, b] = fromLab(ch);
  return `rgb(${r}, ${g}, ${b})`;
}

export type VisOpts = { din?: number; lin?: number; lout?: number; blur?: number };
export type Vis = { o: number; blur: number; s: number; a: number; b: number };

/**
 * Смена содержимого (Barty-Bart): выход быстро размывается, вход ждёт din и проявляется за lin — без наложения.
 * tin / tout — секунды входа и выхода (null — нет). o — непрозрачность, blur — px, s — масштаб.
 */
export function vis(t: number, tin: number | null, tout: number | null, o: VisOpts = {}): Vis {
  const din = o.din ?? 0.07;
  const lin = o.lin ?? 0.26;
  const lout = o.lout ?? 0.12;
  const bl = o.blur ?? 12;
  const a = tin == null ? 1 : cubicOut((t - tin - din) / lin);
  const b = tout == null ? 0 : cubicOut((t - tout) / lout);
  return { o: a * (1 - b), blur: (1 - a) * bl + b * bl * 0.8, s: (0.94 + 0.06 * a) * (1 - 0.03 * b), a, b };
}

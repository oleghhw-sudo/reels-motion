// Цветовая математика: OKLCH → sRGB, относительная яркость и контраст WCAG 2.x.
// Чистый TS без зависимостей: импортируется и из Remotion, и из node (type stripping).

export type RGB = { r: number; g: number; b: number }; // 0..1, гамма sRGB

export type OKLCH = { l: number; c: number; h: number; alpha: number };

/** Разбирает строку `oklch(L C H)` / `oklch(L C H / A)`. L — 0..1 или проценты. */
export function parseOklch(input: string): OKLCH {
  const m = input
    .trim()
    .match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i);
  if (!m) throw new Error(`Не OKLCH-строка: "${input}"`);
  const num = (s: string, pctScale: number) =>
    s.endsWith('%') ? (parseFloat(s) / 100) * pctScale : parseFloat(s);
  return {
    l: num(m[1], 1),
    c: parseFloat(m[2]),
    h: parseFloat(m[3]),
    alpha: m[4] === undefined ? 1 : num(m[4], 1),
  };
}

function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function oklchToLinear({ l, c, h }: OKLCH): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** OKLCH-строка → sRGB 0..1 (с отсечением по гамуту — так же поступает Chrome при выводе в sRGB-канвас). */
export function oklchToRgb(input: string): RGB {
  const [r, g, b] = oklchToLinear(parseOklch(input));
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return { r: clamp(linearToSrgb(r)), g: clamp(linearToSrgb(g)), b: clamp(linearToSrgb(b)) };
}

/** Проверка: укладывается ли цвет в sRGB без отсечения (для предупреждений в тесте). */
export function inSrgbGamut(input: string, eps = 0.002): boolean {
  const lin = oklchToLinear(parseOklch(input));
  return lin.every((x) => x >= -eps && x <= 1 + eps);
}

export function toHex(input: string): string {
  const { r, g, b } = oklchToRgb(input);
  const h = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Для Paper Shaders: их парсер не знает oklch — отдаём массив [r,g,b,a] 0..1. */
export function toShaderRgba(input: string, alpha?: number): [number, number, number, number] {
  const { r, g, b } = oklchToRgb(input);
  return [r, g, b, alpha ?? parseOklch(input).alpha];
}

/** OKLCH-строка с подменённой альфой (для полупрозрачных слоёв в CSS/SVG). */
export function withAlpha(input: string, alpha: number): string {
  const { l, c, h } = parseOklch(input);
  return `oklch(${l} ${c} ${h} / ${alpha})`;
}

/** Смешивание двух OKLCH-цветов в пространстве OKLab (t=0 → a, t=1 → b). */
export function mixOklch(a: string, b: string, t: number): string {
  const A = parseOklch(a);
  const B = parseOklch(b);
  const ax = A.c * Math.cos((A.h * Math.PI) / 180);
  const ay = A.c * Math.sin((A.h * Math.PI) / 180);
  const bx = B.c * Math.cos((B.h * Math.PI) / 180);
  const by = B.c * Math.sin((B.h * Math.PI) / 180);
  const x = ax + (bx - ax) * t;
  const y = ay + (by - ay) * t;
  const l = A.l + (B.l - A.l) * t;
  const c = Math.sqrt(x * x + y * y);
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) h += 360;
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/** Относительная яркость WCAG 2.x. */
export function relativeLuminance(input: string): number {
  const { r, g, b } = oklchToRgb(input);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Контраст WCAG 2.x (1..21). Порядок аргументов не важен. */
export function contrast(text: string, bg: string): number {
  const a = relativeLuminance(text);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

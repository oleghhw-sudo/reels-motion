// Форматтер чисел uk-UA для экрана (задача 020). Единственное место, где число превращается в строку.
// Десятичная запятая; минус U+2212; перед «%», «м», «м²» — неразрывный пробел U+00A0; тысячи — U+202F («1 038»).
export const NBSP = ' ';
export const THIN = ' ';
export const MINUS = '−';

/** Округление «от половины вверх» по модулю (Math.round на |x|), без артефактов toFixed. */
const roundAbs = (x: number, digits: number): number => {
  const k = Math.pow(10, digits);
  return Math.round(Math.abs(x) * k) / k;
};

/** Число с digits знаками после запятой; sign — явный «+» у положительных. Нуль после округления — без знака. */
export function num(x: number, digits: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(x)) throw new Error(`format.num: не число (${String(x)})`);
  const r = roundAbs(x, digits);
  const [int, frac] = r.toFixed(digits).split('.');
  const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  const body = frac ? `${intGrouped},${frac}` : intGrouped;
  if (r === 0) return opts.sign ? `${body}` : body;
  if (x < 0) return `${MINUS}${body}`;
  return opts.sign ? `+${body}` : body;
}

/** Метры: 2 знака — «9,25 м». */
export const metres = (x: number): string => `${num(x, 2)}${NBSP}м`;
/** Площадь: 1 знак — «99,3 м²». */
export const area = (x: number): string => `${num(x, 1)}${NBSP}м²`;
/** Площадь без единицы (второе число в паре «0,9 м² проти 2,2»). */
export const areaBare = (x: number): string => num(x, 1);
/** Отклонение: 1 знак со знаком — «+0,3 %», «−1,9 %». */
export const pctSigned = (x: number): string => `${num(x, 1, { sign: true })}${NBSP}%`;
/** Доля 0..1 как целый процент — «89 %», «65 %». */
export const pctInt = (frac: number): string => `${num(frac * 100, 0)}${NBSP}%`;
/** Доля зоны: целый процент; меньше 5 % — 1 знак («2,5 %»). */
export const share = (frac: number): string => {
  const p = frac * 100;
  return `${num(p, p < 5 ? 1 : 0)}${NBSP}%`;
};
/** Пиксели стен: 1 знак — «10,5». */
export const px = (x: number): string => num(x, 1);
/** Целое со счётом тысяч — «11», «1 038». */
export const int = (n: number): string => num(n, 0);

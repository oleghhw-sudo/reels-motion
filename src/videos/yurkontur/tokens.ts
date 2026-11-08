// Токены видео «Юридичний контур АНЦ» (задача 031) — из CSS стенда yurcontur/Yurkontur_demo.html и правок Олега 08.11.
// Режим hud в светлом варианте: графит на бумаге. Цвета ниже — все, других не вводить.
import { fontStack } from '../../theme/loadFonts.ts';

export const C = {
  paper: '#F9F3E8',
  ink: '#1C201E',
  line: '#DFD7C9',
  line2: '#D1C7B8',
  muted: '#6A6E68',
  accent: '#27514A', // стенд: --accent / --layer-legal
  green: '#3E7163', // людина, петля навчання, подтверждение (решение Олега 08.11: границы «Людина», трассы петли)
  tight: '#BD8A3C', // охра: активный узел, головки трасс, чипы-значения, нитка «поле → скан»
  crit: '#A6483C', // конфлікт, критична умова
  accentSoft: '#F5ECDD',
  warnBg: '#FCEED7',
} as const;

export const rgba = (hex: string, a: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

export const FONT = {
  ui: fontStack('Inter'),
  mono: fontStack('JetBrainsMono'),
  // Source Serif 4 Regular из стенда: два файла-подмножества одного семейства (src/theme/fonts.ts)
  serif: fontStack('SourceSerif4Cyr'),
} as const;

/**
 * Типографика — одна система (правки Олега 08.11): у каждой роли один шрифт во всех сценах и на любом масштабе камеры.
 * Inter 600 нигде не используется.
 */
export const TYPE = {
  /** голос (субтитры) */
  voice: { fontFamily: FONT.serif, fontSize: 42, fontWeight: 400, color: C.ink, lineHeight: 1.3 },
  /** заголовок сцены */
  title: { fontFamily: FONT.serif, fontSize: 60, fontWeight: 400, color: C.ink, lineHeight: 1.15 },
  /** название узла: JetBrains Mono капсом, ~0.1em; меняется только размер (общий план — фактура, близко ≥ 32 px) */
  node: { fontFamily: FONT.mono, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacingEm: 0.1, lineHeight: 1.2 },
  /** пояснения в узлах и мелкие подписи: Inter Regular ≥ 24 px */
  detail: { fontFamily: FONT.ui, fontWeight: 400, minPx: 24, lineHeight: 1.3 },
  /** чип-значение на канале (данные): JetBrains Mono 24 px */
  chip: { fontFamily: FONT.mono, fontSize: 24, fontWeight: 400 },
} as const;

/** Границы карточек и панелей (px кадра 1920×1080). Скругление 8. Заливка — --paper непрозрачная. */
export const BORDER = {
  normal: { color: rgba(C.ink, 0.38), width: 2.2 },
  active: { color: rgba(C.tight, 0.8), width: 2.8 },
  human: { color: rgba(C.green, 0.8), width: 2.4 },
  conflict: { color: rgba(C.crit, 0.8), width: 2.4 },
  ghost: { color: rgba(C.ink, 0.22), width: 1.6 },
  radius: 8,
} as const;

/** Метка фактуры: мелкий текст, который readcheck не меряет (в <Readable> не оборачивается). */
export const TEXTURE_ATTR = { 'data-texture': '' } as const;

/** Межбуквенный интервал названия, чтобы самое длинное слово влезло в ширину avail (≤ 0.1em, ≥ 0.03em). */
export function fitLetterSpacing(label: string, fontPx: number, avail: number): number {
  const n = Math.max(...label.split(/\s+/).map((w) => w.length));
  if (n <= 1) return TYPE.node.letterSpacingEm;
  const ls = (avail / fontPx - 0.6 * n) / (n - 1); // JetBrains Mono: шаг 0.6em
  return Math.max(0.03, Math.min(TYPE.node.letterSpacingEm, ls));
}

// Токены видео «Юридичний контур АНЦ» (задача 031) — из CSS стенда yurcontur/Yurkontur_demo.html (таблица в задаче).
// Режим hud в светлом варианте: графитовые линии на бумаге. Других цветов не вводить.
import { fontStack } from '../../theme/loadFonts.ts';

export const C = {
  paper: '#F9F3E8',
  ink: '#1C201E',
  line: '#DFD7C9',
  line2: '#D1C7B8',
  muted: '#6A6E68',
  accent: '#27514A', // людина, петля навчання, підтверджено
  tight: '#BD8A3C', // нитка «поле → скан», пропозиція / розраховано
  crit: '#A6483C', // конфлікт, критична умова
  loopTrace: '#3E7163', // бегущие трассы петли навчання (решение Олега 08.11, правки кадра блока 5)
  subInk: '#2A2F2C', // цвет субтитров вариантов B и C (решение Олега 08.11)
  accentSoft: '#F5ECDD',
  warnBg: '#FCEED7',
} as const;

export const FONT = {
  ui: fontStack('Inter'),
  mono: fontStack('JetBrainsMono'),
  // Source Serif 4 Regular из стенда: два файла-подмножества одного семейства (src/theme/fonts.ts)
  serif: fontStack('SourceSerif4Cyr'),
} as const;

/** Субтитры: варианты Олега (правки кадра блока 5). Inter 600 для субтитров не используется. */
export const SUB_STYLES = {
  A: { fontFamily: FONT.serif, fontSize: 42, fontWeight: 400, color: C.ink },
  B: { fontFamily: FONT.ui, fontSize: 38, fontWeight: 400, color: C.subInk },
  C: { fontFamily: FONT.mono, fontSize: 32, fontWeight: 400, color: C.subInk },
} as const;
export type SubStyle = keyof typeof SUB_STYLES;

/** Метка фактуры: мелкий моноширинный текст, который readcheck не меряет (в <Readable> не оборачивается). */
export const TEXTURE_ATTR = { 'data-texture': '' } as const;

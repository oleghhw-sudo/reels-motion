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
  accentSoft: '#F5ECDD',
  warnBg: '#FCEED7',
} as const;

// Source Serif 4 (заголовки стенда) в public/fonts пока нет — извлекается из стенда на шаге 1 (бриф).
// В тесте рендера (шаг 0) заголовков нет: Inter (подписи) и JetBrains Mono (фактура) из реестра.
export const FONT = {
  ui: fontStack('Inter'),
  mono: fontStack('JetBrainsMono'),
} as const;

/** Метка фактуры: мелкий моноширинный текст, который readcheck не меряет (в <Readable> не оборачивается). */
export const TEXTURE_ATTR = { 'data-texture': '' } as const;

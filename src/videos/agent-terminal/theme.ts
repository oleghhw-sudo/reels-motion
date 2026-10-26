// Палитра и раскладка ролика «Термінал помічника кресляра» (задача 020) — токены из сториборда пакета.
// Цвета данных (зоны) и UI; числа раскладки — px кадра 1920×1080. Шрифты — только реестр src/theme/fonts.ts.
import { fontStack } from '../../theme/loadFonts.ts';

export const C = {
  bg: '#0b0f14',
  text: '#f2efe8',
  muted: '#8f9aa6',
  amber: '#e0a344',
  teal: '#2fd1c3',
  red: '#e5484d', // только штамп «ДО ЛЮДИНИ»
  zone: {
    trade_hall: '#2fd1c3',
    storage: '#6f8fd8',
    staff_room: '#c9a7f0',
    sanitary: '#7fd3f7',
    none: 'rgba(242,239,232,.10)',
  },
  panel: 'rgba(242,239,232,0.035)',
  line: 'rgba(242,239,232,0.10)',
  lineStrong: 'rgba(242,239,232,0.22)',
} as const;

export type ZoneKey = keyof typeof C.zone;

/** Подписи зон на плане и в логах (ключи — как в real_examples.json / stats.json). */
export const ZONE_LABEL: Record<Exclude<ZoneKey, 'none'>, string> = {
  trade_hall: 'зал',
  storage: 'склад',
  staff_room: 'персонал',
  sanitary: 'санвузол',
};

export const FONT = {
  title: fontStack('Unbounded'),
  ui: fontStack('Onest'),
  mono: fontStack('JetBrainsMono'),
} as const;

/** Раскладка кадра: шапка 90, слева модули 300, справа лог 420, внизу очередь 150; центр — полотно. */
export const L = {
  W: 1920,
  H: 1080,
  header: 90,
  rail: 300,
  log: 420,
  queue: 150,
  pad: 24,
} as const;
export const CANVAS = { x: L.rail, y: L.header, w: L.W - L.rail - L.log, h: L.H - L.header - L.queue } as const;

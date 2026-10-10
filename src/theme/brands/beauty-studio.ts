// Бренд-пресет beautystudiozp.com. ВСЕ значения — из STYLE_HANDOFF.md (ссылки на параграфы рядом).
// Палитра сайта задана в hex/rgba (oklch на сайте не используется, §1.5) — для бренда храним как есть,
// чтобы не терять точность конвертацией.
import { Easing } from 'remotion';
import { FONTS } from '../fonts.ts';

/** §1.1–1.3 */
export const BEAUTY_COLORS = {
  milk: '#f4ece8',
  blush: '#eadbd5',
  white: '#fff',
  ink: '#111',
  dark: '#171513',
  bronze: '#9d6849',
  /** §1.2 --menu-bronze-text: осветлённая бронза ТОЛЬКО для мелкого текста на тёмном */
  menuBronzeText: '#BC8767',
  ruleStructural: 'rgba(87, 58, 45, .24)',
  ruleSecondary: 'rgba(87, 58, 45, .13)',
  ruleDarkStructural: 'rgba(244, 236, 232, .24)',
  ruleDarkSecondary: 'rgba(244, 236, 232, .12)',
  /** §1.1: пигмент секции .about («Студія») */
  aboutSurface: '#eee3dd',
  /** §1.3: «Наші роботи» */
  textOnDarkTitle: 'rgba(255,255,255,.92)',
  textOnDark: 'rgba(255,255,255,.72)',
  textOnDarkService: 'rgba(255,255,255,.7)',
  /** §3.3: трек прогресс-баров на тёмном */
  progressTrack: 'rgba(255,255,255,.18)',
  /** §1.3: фон лоадера */
  loader: '#F4ECE8',
  /** §4.4: тёплый почти-чёрный скримов */
  scrimRgb: '18,14,12',
} as const;

/** §2.1: Playfair 400 (normal + italic), Manrope 400/500. Жирного нет. */
export const BEAUTY_FONTS = {
  display: `'${FONTS.PlayfairDisplay.family}'`,
  body: `'${FONTS.Manrope.family}'`,
} as const;

/** §5.2. Easing.bezier из remotion — функции t∈[0,1] → [0,1]. */
export const BEAUTY_EASE = {
  ease: Easing.bezier(0.22, 1, 0.36, 1),
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
  /** material standard — растворение кадров студии (§5.5) */
  studio: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

/** Масштаб: мобильная колонка сайта 390 → ширина Reels 1080. */
export const SITE_TO_REELS = 1080 / 390; // 2.769…
export const s = (sitePx: number) => Math.round(sitePx * SITE_TO_REELS * 10) / 10;

/**
 * Типографика §2.3 (значения 390) × SITE_TO_REELS — отправная точка; где Reels требует иного
 * (safe zones, длина строки), отклонение подписано и проверено по стиллам.
 */
export const BEAUTY_TYPE = {
  label: { size: s(11), tracking: '.18em', lineHeight: 1.8 }, // метка NN / Розділ
  kicker: { size: s(11), tracking: '.2em' },
  heroH1: { size: s(47.58), lineHeight: 0.94, tracking: '-.043em' },
  heroSub: { size: s(13), lineHeight: 1.6 },
  editorial: { size: s(50.7), lineHeight: 0.91, tracking: '-.038em' },
  body: { size: s(15), lineHeight: 1.6 },
  coda: { size: s(19.2), lineHeight: 1.18, tracking: '-.02em' },
  works: { size: s(74.1), lineHeight: 0.8, tracking: '-.055em' },
  serviceName: { size: s(50.7), lineHeight: 0.9, tracking: '-.04em' },
  serviceNum: { size: s(11) },
  studio: { size: s(44.8), lineHeight: 0.91, tracking: '-.038em' },
  contactsH2: { size: s(56), lineHeight: 0.86, tracking: '-.043em' },
  contactValue: { size: s(18), lineHeight: 1.2 },
  button: { size: s(13) },
} as const;

/** §6: отступ секции на телефоне 20px → Reels; совпадает с SafeZones.left (64). */
export const BEAUTY_PAD = 64;

/** §3.1 «бумага»: тайл шума — data-URI сайта дословно; тайл 180px × SITE_TO_REELS. */
export const PAPER_NOISE_SVG =
  "data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' seed='17' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)' opacity='.055'/%3E%3C/svg%3E";
export const PAPER_TILE_PX = Math.round(180 * SITE_TO_REELS); // 498
export const PAPER_LAYERS = [
  'radial-gradient(circle at 18% 12%, rgba(255,255,255,.34), transparent 42%)',
  'linear-gradient(118deg, rgba(255,255,255,.12), transparent 48%, rgba(120,82,65,.035))',
  `url("${PAPER_NOISE_SVG}")`,
] as const;

export const BEAUTY_SURFACE_IDS = ['milk-paper', 'blush-paper', 'about-paper', 'dark', 'hero-video', 'logo-milk'] as const;
export type BeautySurfaceId = (typeof BEAUTY_SURFACE_IDS)[number];

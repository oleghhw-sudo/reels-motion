// Стилевые пресеты. Палитры — только OKLCH-строки (Chrome рендерит их напрямую;
// для Paper Shaders конвертируем через toShaderRgba, их парсер oklch не понимает).
// Контраст проверяется тестом src/theme/contrast.test.ts (npm run test:contrast).

import type { FontId } from './fonts.ts';

export type Palette = {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  /** Акцент. Допустим для КРУПНОГО текста (≥ 3:1 к bg) и графики. */
  accent: string;
  accent2: string;
  glow: string;
};

export type GrainParams = {
  /** Непрозрачность слоя зерна 0..1 */
  opacity: number;
  /** baseFrequency feTurbulence: больше — мельче зерно */
  frequency: number;
  /** soft-light для тёмных, multiply для светлых */
  blend: 'soft-light' | 'overlay' | 'multiply' | 'screen';
  /** true — seed меняется каждый кадр (живое зерно), false — статичное */
  animated: boolean;
};

export type Preset = {
  id: PresetId;
  label: string;
  /** Для каких задач задуман */
  intent: string;
  mode: 'dark' | 'light';
  palette: Palette;
  fonts: { display: FontId; body: FontId; mono: FontId };
  /** Вес display-шрифта для заголовков */
  displayWeight: number;
  grain: GrainParams;
};

export const PRESET_IDS = [
  'graphite-lime',
  'ink-coral',
  'bone-editorial',
  'deep-teal-amber',
  'chrome-ice',
  'signal-orange',
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESETS: Record<PresetId, Preset> = {
  'graphite-lime': {
    id: 'graphite-lime',
    label: 'Graphite / Lime',
    intent: 'курсы AI-CGI, техно, разборы инструментов',
    mode: 'dark',
    palette: {
      bg: 'oklch(0.205 0.008 70)', // тёплый графит
      surface: 'oklch(0.27 0.01 70)',
      text: 'oklch(0.96 0.012 95)',
      textMuted: 'oklch(0.74 0.012 85)',
      accent: 'oklch(0.9 0.21 125)', // кислотный лайм
      accent2: 'oklch(0.72 0.1 160)',
      glow: 'oklch(0.86 0.19 125)',
    },
    fonts: { display: 'Unbounded', body: 'Onest', mono: 'JetBrainsMono' },
    displayWeight: 800,
    grain: { opacity: 0.22, frequency: 0.85, blend: 'soft-light', animated: true },
  },
  'ink-coral': {
    id: 'ink-coral',
    label: 'Ink / Coral',
    intent: 'личный экспертный блог, тёплая подача',
    mode: 'dark',
    palette: {
      bg: 'oklch(0.22 0.05 255)', // глубокие чернила
      surface: 'oklch(0.29 0.06 255)',
      text: 'oklch(0.96 0.015 70)',
      textMuted: 'oklch(0.76 0.03 250)',
      accent: 'oklch(0.73 0.16 35)', // коралл
      accent2: 'oklch(0.84 0.09 75)', // тёплый песок
      glow: 'oklch(0.7 0.17 30)',
    },
    fonts: { display: 'Montserrat', body: 'Lora', mono: 'IBMPlexMono' },
    displayWeight: 800,
    grain: { opacity: 0.2, frequency: 0.75, blend: 'soft-light', animated: true },
  },
  'bone-editorial': {
    id: 'bone-editorial',
    label: 'Bone / Editorial',
    intent: 'журнальная подача, разборы, цитаты',
    mode: 'light',
    palette: {
      bg: 'oklch(0.95 0.018 88)', // слоновая кость
      surface: 'oklch(0.91 0.022 85)',
      text: 'oklch(0.18 0.01 60)',
      textMuted: 'oklch(0.43 0.015 60)',
      accent: 'oklch(0.55 0.21 28)', // один красный
      accent2: 'oklch(0.3 0.01 60)',
      glow: 'oklch(0.99 0.01 90)',
    },
    fonts: { display: 'PlayfairDisplay', body: 'Lora', mono: 'IBMPlexMono' },
    displayWeight: 800,
    grain: { opacity: 0.35, frequency: 0.65, blend: 'multiply', animated: false },
  },
  'deep-teal-amber': {
    id: 'deep-teal-amber',
    label: 'Deep Teal / Amber',
    intent: 'кино и CGI, тизеры, атмосфера',
    mode: 'dark',
    palette: {
      bg: 'oklch(0.21 0.04 200)', // тёмный бирюзовый
      surface: 'oklch(0.28 0.05 200)',
      text: 'oklch(0.96 0.02 85)',
      textMuted: 'oklch(0.75 0.035 190)',
      accent: 'oklch(0.8 0.15 70)', // янтарь
      accent2: 'oklch(0.62 0.09 195)',
      glow: 'oklch(0.78 0.16 65)',
    },
    fonts: { display: 'Oswald', body: 'Inter', mono: 'JetBrainsMono' },
    displayWeight: 700,
    grain: { opacity: 0.26, frequency: 0.7, blend: 'soft-light', animated: true },
  },
  'chrome-ice': {
    id: 'chrome-ice',
    label: 'Chrome / Ice',
    intent: 'сторонние продукты, tech-обзоры, холодный премиум',
    mode: 'dark',
    palette: {
      bg: 'oklch(0.23 0.015 240)', // холодный стальной
      surface: 'oklch(0.31 0.02 240)',
      text: 'oklch(0.97 0.006 230)',
      textMuted: 'oklch(0.76 0.02 235)',
      accent: 'oklch(0.86 0.12 205)', // ледяной циан
      accent2: 'oklch(0.7 0.02 240)', // хром
      glow: 'oklch(0.93 0.045 210)',
    },
    fonts: { display: 'Exo2', body: 'Inter', mono: 'JetBrainsMono' },
    displayWeight: 800,
    grain: { opacity: 0.16, frequency: 0.9, blend: 'overlay', animated: true },
  },
  'signal-orange': {
    id: 'signal-orange',
    label: 'Signal / Orange',
    intent: 'агрессивный хук, первые 2 секунды, CTA',
    mode: 'dark',
    palette: {
      bg: 'oklch(0.16 0.006 50)', // почти чёрный, чуть тёплый
      surface: 'oklch(0.23 0.01 50)',
      text: 'oklch(0.985 0.004 80)',
      textMuted: 'oklch(0.75 0.01 60)',
      accent: 'oklch(0.7 0.2 45)', // сигнальный оранжевый
      accent2: 'oklch(0.985 0.004 80)',
      glow: 'oklch(0.69 0.19 42)',
    },
    fonts: { display: 'Rubik', body: 'Onest', mono: 'JetBrainsMono' },
    displayWeight: 900,
    grain: { opacity: 0.24, frequency: 0.95, blend: 'soft-light', animated: true },
  },
};

export function getPreset(id: string): Preset {
  const p = (PRESETS as Record<string, Preset>)[id];
  if (!p) throw new Error(`Неизвестный пресет "${id}". Есть: ${PRESET_IDS.join(', ')}`);
  return p;
}

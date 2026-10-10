// Реестр локальных шрифтов (public/fonts, OFL). Единственный источник правды:
// его читают и пресеты (CSS family), и scripts/check-env.mjs (через env.manifest.json — список файлов
// дублируется там намеренно: манифест среды обязан быть читаем без сборки TS).

export type FontId =
  | 'Unbounded'
  | 'Onest'
  | 'JetBrainsMono'
  | 'Rubik'
  | 'Inter'
  | 'IBMPlexMono'
  | 'PlayfairDisplay'
  | 'Lora'
  | 'Oswald'
  | 'Exo2'
  | 'Montserrat'
  | 'PlayfairDisplayItalic'
  | 'Manrope';

export type FontDef = {
  /** CSS-семейство с префиксом RM, чтобы никогда не подхватить системный шрифт с тем же именем. */
  family: string;
  /** Путь относительно public/ */
  file: string;
  /** Диапазон осей веса variable-шрифта, как строка для @font-face */
  weight: string;
  /** Начертание для @font-face. Италик — отдельный файл того же семейства (font-style: italic). */
  style?: 'normal' | 'italic';
};

export const FONTS: Record<FontId, FontDef> = {
  Unbounded: { family: 'RM Unbounded', file: 'fonts/Unbounded/Unbounded-VF.ttf', weight: '200 900' },
  Onest: { family: 'RM Onest', file: 'fonts/Onest/Onest-VF.ttf', weight: '100 900' },
  JetBrainsMono: { family: 'RM JetBrains Mono', file: 'fonts/JetBrainsMono/JetBrainsMono-VF.ttf', weight: '100 800' },
  Rubik: { family: 'RM Rubik', file: 'fonts/Rubik/Rubik-VF.ttf', weight: '300 900' },
  Inter: { family: 'RM Inter', file: 'fonts/Inter/Inter-VF.ttf', weight: '100 900' },
  IBMPlexMono: { family: 'RM IBM Plex Mono', file: 'fonts/IBMPlexMono/IBMPlexMono-Regular.ttf', weight: '400' },
  PlayfairDisplay: { family: 'RM Playfair Display', file: 'fonts/PlayfairDisplay/PlayfairDisplay-VF.ttf', weight: '400 900' },
  Lora: { family: 'RM Lora', file: 'fonts/Lora/Lora-VF.ttf', weight: '400 700' },
  Oswald: { family: 'RM Oswald', file: 'fonts/Oswald/Oswald-VF.ttf', weight: '200 700' },
  Exo2: { family: 'RM Exo 2', file: 'fonts/Exo2/Exo2-VF.ttf', weight: '100 900' },
  Montserrat: { family: 'RM Montserrat', file: 'fonts/Montserrat/Montserrat-VF.ttf', weight: '100 900' },
  // Тот же family, что PlayfairDisplay: в CSS курсив включается fontStyle: 'italic' (как на сайте beautystudiozp.com).
  PlayfairDisplayItalic: {
    family: 'RM Playfair Display',
    file: 'fonts/PlayfairDisplay/PlayfairDisplay-Italic-VF.ttf',
    weight: '400 900',
    style: 'italic',
  },
  // В Manrope нет ʼ U+02BC — в текстах только ’ U+2019 (см. env.manifest.json).
  Manrope: { family: 'RM Manrope', file: 'fonts/Manrope/Manrope-VF.ttf', weight: '200 800' },
};

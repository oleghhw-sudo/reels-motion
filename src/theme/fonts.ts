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
  | 'Manrope'
  | 'Anton';

export type FontDef = {
  /** CSS-семейство с префиксом RM, чтобы никогда не подхватить системный шрифт с тем же именем. */
  family: string;
  /** Путь относительно public/ */
  file: string;
  /** Диапазон осей веса variable-шрифта, как строка для @font-face */
  weight: string;
  /** Начертание для @font-face. Италик — отдельный файл того же семейства (font-style: italic). */
  style?: 'normal' | 'italic';
  /**
   * Шрифт без кириллицы: значение — причина/область (env.manifest.json → fonts.files[].latinOnly).
   * Текст с U+0400–U+04FF или ’ этим шрифтом — громкая ошибка сборки (fontFor) и нарушение LATIN_ONLY в readcheck.
   */
  latinOnly?: string;
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
  // В Anton нет ґ є і ї (решение Олега 2026-10-18: только латиница, тексты аутро MIA английские).
  Anton: { family: 'RM Anton', file: 'fonts/Anton/Anton-Regular.ttf', weight: '400', latinOnly: 'только латиница, тексты аутро MIA английские' },
};

/** Символы, которых нельзя набирать шрифтом latinOnly: кириллица U+0400–U+04FF и украинский апостроф ’. */
export const LATIN_ONLY_FORBIDDEN = /[\u0400-\u04FF\u2019]/u;

/** null — текст подходит шрифту; иначе — текст ошибки. */
export function latinOnlyViolation(id: FontId, text: string): string | null {
  const def = FONTS[id];
  if (!def.latinOnly) return null;
  const bad = [...text].filter((c) => LATIN_ONLY_FORBIDDEN.test(c));
  return bad.length ? `Шрифт ${id} — latinOnly (${def.latinOnly}), а в тексте «${text}» есть ${[...new Set(bad)].join(' ')}: кириллицу и ’ им набирать нельзя` : null;
}

/** CSS-стек шрифта для конкретного текста: для latinOnly с кириллицей — громкая ошибка (сборка/рендер падают). */
export function fontFor(id: FontId, text: string): string {
  const v = latinOnlyViolation(id, text);
  if (v) throw new Error(v);
  return `'${FONTS[id].family}'`;
}

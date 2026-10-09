// Загрузка локальных шрифтов (public/fonts) через @remotion/fonts.
// loadFont сам держит delayRender до готовности FontFace — кадр не снимется с фолбэк-шрифтом.
import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';
import { FONTS } from './fonts.ts';

let started = false;

export function loadAllFonts(): void {
  if (started) return;
  started = true;
  for (const def of Object.values(FONTS)) {
    loadFont({ family: def.family, url: staticFile(def.file), weight: def.weight, format: 'truetype' }).catch(
      (e: unknown) => {
        throw new Error(`Шрифт ${def.family} не загрузился: ${String(e)}`);
      },
    );
  }
}

export function fontStack(id: keyof typeof FONTS): string {
  // Без системных фолбэков с кириллицей: если шрифт не загрузился — видно сразу (serif по умолчанию).
  return `'${FONTS[id].family}'`;
}
